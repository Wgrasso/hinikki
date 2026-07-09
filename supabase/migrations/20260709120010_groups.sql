-- HiNikki — additive migration: household groups + stable join code + recovery RPCs.
-- Apply with: node scripts/apply-schema.mjs blueprints/hinikki.groups.sql
-- Safe to run more than once (idempotent DDL via IF NOT EXISTS / CREATE OR REPLACE).

create extension if not exists pgcrypto;

-- A household. Owns ONE stable, reusable join code that family + older adults enter to connect.
create table if not exists groups (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null default 'Our family',
  join_code             text not null unique,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Membership of an authenticated principal (admin OR older-adult device) in a household.
create table if not exists group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  member_role text not null check (member_role in ('admin','older_adult')),
  created_at  timestamptz not null default now(),
  unique (group_id, profile_id)
);

-- Each older adult care profile belongs to one household.
alter table older_adult_profiles add column if not exists group_id uuid references groups(id) on delete set null;
create index if not exists older_adult_profiles_group_id_idx on older_adult_profiles (group_id);

-- Unambiguous, human-readable 8-char code (no 0/O/1/I), guaranteed unique in groups.
create or replace function gen_group_code() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_i int;
begin
  loop
    v_code := '';
    for v_i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % length(v_alphabet)), 1);
    end loop;
    exit when not exists (select 1 from groups where join_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table groups enable row level security;
alter table group_members enable row level security;

-- SECURITY: a "real" (non-anonymous, e.g. email/password) principal. Anonymous older-adult
-- sessions return false, so they can never self-assert admin status. auth.jwt() reads the
-- ORIGINAL request's claims even inside SECURITY DEFINER, so this reflects the true caller.
create or replace function is_real_user() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) = false;
$$;

-- Membership check via SECURITY DEFINER (bypasses RLS) so policies that reference
-- group_members do not recurse (Postgres 42P17). Standard Supabase de-recursion pattern.
create or replace function is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group and profile_id = get_current_profile_id());
$$;

-- A principal can see groups they belong to (non-recursive via is_group_member).
drop policy if exists "view own groups" on groups;
create policy "view own groups" on groups for select using (is_group_member(id));

-- A principal sees membership rows for groups they belong to (non-recursive).
drop policy if exists "view own group members" on group_members;
create policy "view own group members" on group_members for select using (is_group_member(group_id));

-- SECURITY (C1): an anonymous principal must NOT be able to self-insert an admin_profiles row
-- and thereby self-promote to admin. Override the base schema policy to require a real
-- (non-anonymous) user on writes. Reads of one's own row stay profile-scoped.
drop policy if exists "own admin profile" on admin_profiles;
create policy "own admin profile" on admin_profiles for all
  using (profile_id = get_current_profile_id())
  with check (profile_id = get_current_profile_id() and is_real_user());

-- SECURITY (I1): rate limit for code-consuming RPCs (reuses pairing_redeem_attempts): at most
-- 8 failed code lookups per 15 minutes per principal, so the stable join code cannot be brute-forced.
create or replace function check_code_rate_limit(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from pairing_redeem_attempts
        where profile_id = p_profile and not success
          and attempted_at > now() - interval '15 minutes') >= 8 then
    raise exception 'too many attempts — please wait a few minutes and try again';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Helper: link an admin to every older adult currently in a group (idempotent).
-- ----------------------------------------------------------------------------
create or replace function link_admin_to_group(p_admin uuid, p_group uuid, p_relationship text default null, p_level text default 'family_admin')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into admin_older_adult_links(admin_id, older_adult_id, relationship_to_user, permission_level, status)
  select p_admin, o.id, p_relationship, p_level, 'active'
  from older_adult_profiles o
  where o.group_id = p_group
  -- SECURITY (I3): never silently un-revoke a removed caregiver via the stable code.
  on conflict (admin_id, older_adult_id) do update set status = 'active'
    where admin_older_adult_links.status <> 'revoked';
end;
$$;

-- Idempotent: return the caller's existing owned older adult, else create one.
create or replace function create_older_adult_for_self(p_display_name text default 'My profile', p_device_id text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := get_current_profile_id();
  v_id uuid;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  select id into v_id from older_adult_profiles where owner_profile_id = v_profile limit 1;
  if v_id is not null then return v_id; end if;
  insert into older_adult_profiles (display_name, owner_profile_id, created_by_device_id)
  values (coalesce(nullif(btrim(p_display_name), ''), 'My profile'), v_profile, p_device_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Admin creates (or returns existing) household + first older adult. Idempotent.
create or replace function admin_create_household(p_group_name text default 'Our family', p_older_adult_name text default 'Loved one')
returns json language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := get_current_profile_id();
  v_admin uuid;
  v_group uuid;
  v_code text;
  v_oa uuid;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  if not is_real_user() then raise exception 'only an admin can create a household'; end if;
  select id into v_admin from admin_profiles where profile_id = v_profile;
  if v_admin is null then raise exception 'only an admin can create a household'; end if;

  -- already in a group? return it.
  select g.id, g.join_code into v_group, v_code
  from group_members m join groups g on g.id = m.group_id
  where m.profile_id = v_profile and m.member_role = 'admin'
  order by m.created_at asc limit 1;

  if v_group is null then
    insert into groups (name, join_code, created_by_profile_id)
    values (coalesce(nullif(btrim(p_group_name), ''), 'Our family'), gen_group_code(), v_profile)
    returning id, join_code into v_group, v_code;
    insert into group_members(group_id, profile_id, member_role) values (v_group, v_profile, 'admin')
      on conflict (group_id, profile_id) do nothing;
  end if;

  select o.id into v_oa from older_adult_profiles o where o.group_id = v_group order by o.created_at asc limit 1;
  if v_oa is null then
    insert into older_adult_profiles (display_name, created_by_admin_id, group_id)
    values (coalesce(nullif(btrim(p_older_adult_name), ''), 'Loved one'), v_admin, v_group)
    returning id into v_oa;
    insert into admin_older_adult_links (admin_id, older_adult_id, permission_level, status)
    values (v_admin, v_oa, 'owner', 'active')
    on conflict (admin_id, older_adult_id) do update set status = 'active';
  end if;

  return json_build_object('group_id', v_group, 'join_code', v_code, 'older_adult_id', v_oa);
end;
$$;

-- Admin joins an existing household via its code; linked to every older adult in it.
create or replace function join_group_as_admin(p_code text, p_relationship text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := get_current_profile_id();
  v_admin uuid;
  v_group uuid;
  v_ids uuid[];
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  if not is_real_user() then raise exception 'only an admin can join as family'; end if;
  perform check_code_rate_limit(v_profile);
  select id into v_admin from admin_profiles where profile_id = v_profile;
  if v_admin is null then raise exception 'only an admin can join as family'; end if;
  select id into v_group from groups where join_code = upper(btrim(p_code));
  if v_group is null then
    insert into pairing_redeem_attempts(profile_id, success) values (v_profile, false);
    raise exception 'invalid code';
  end if;

  perform link_admin_to_group(v_admin, v_group, p_relationship, 'family_admin');
  insert into group_members(group_id, profile_id, member_role) values (v_group, v_profile, 'admin')
    on conflict (group_id, profile_id) do nothing;

  select coalesce(array_agg(o.id), '{}') into v_ids from older_adult_profiles o where o.group_id = v_group;
  return json_build_object('group_id', v_group, 'older_adult_ids', v_ids);
end;
$$;

-- Older adult starting with no family yet: idempotent owned older adult + a wrapping household.
create or replace function start_solo_older_adult(p_display_name text default 'My profile')
returns json language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := get_current_profile_id();
  v_oa uuid;
  v_group uuid;
  v_code text;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;

  select id, group_id into v_oa, v_group from older_adult_profiles where owner_profile_id = v_profile limit 1;
  if v_oa is null then
    insert into older_adult_profiles (display_name, owner_profile_id)
    values (coalesce(nullif(btrim(p_display_name), ''), 'My profile'), v_profile)
    returning id into v_oa;
  end if;

  if v_group is null then
    insert into groups (name, join_code, created_by_profile_id)
    values ('Our family', gen_group_code(), v_profile)
    returning id, join_code into v_group, v_code;
    update older_adult_profiles set group_id = v_group where id = v_oa;
    insert into group_members(group_id, profile_id, member_role) values (v_group, v_profile, 'older_adult')
      on conflict (group_id, profile_id) do nothing;
  else
    select join_code into v_code from groups where id = v_group;
  end if;

  return json_build_object('group_id', v_group, 'join_code', v_code, 'older_adult_id', v_oa);
end;
$$;

-- Roster of older adults in a household, so an older adult can pick which person they are.
create or replace function get_group_roster(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := get_current_profile_id();
  v_group uuid;
  v_name text;
  v_list json;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  perform check_code_rate_limit(v_profile);
  select id, name into v_group, v_name from groups where join_code = upper(btrim(p_code));
  if v_group is null then
    insert into pairing_redeem_attempts(profile_id, success) values (v_profile, false);
    raise exception 'invalid code';
  end if;
  select coalesce(json_agg(json_build_object(
           'id', o.id, 'display_name', o.display_name, 'has_owner', o.owner_profile_id is not null
         ) order by o.created_at asc), '[]'::json)
    into v_list from older_adult_profiles o where o.group_id = v_group;
  return json_build_object('group_id', v_group, 'group_name', v_name, 'older_adults', v_list);
end;
$$;

-- Older adult claims/recovers an existing person in the household: ownership transfers to this device.
create or replace function claim_older_adult_in_group(p_code text, p_older_adult uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := get_current_profile_id();
  v_group uuid;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  perform check_code_rate_limit(v_profile);
  select id into v_group from groups where join_code = upper(btrim(p_code));
  if v_group is null then
    insert into pairing_redeem_attempts(profile_id, success) values (v_profile, false);
    raise exception 'invalid code';
  end if;
  if not exists (select 1 from older_adult_profiles where id = p_older_adult and group_id = v_group) then
    raise exception 'that person is not in this household';
  end if;
  -- (N1) keep one-person-per-device: surface a clear message instead of a bare unique_violation.
  if exists (select 1 from older_adult_profiles where owner_profile_id = v_profile and id <> p_older_adult) then
    raise exception 'this device is already set up as a different person';
  end if;
  -- transfer ownership to the current device (recovery is login-free; the code is the trust boundary).
  update older_adult_profiles set owner_profile_id = v_profile where id = p_older_adult;
  insert into group_members(group_id, profile_id, member_role) values (v_group, v_profile, 'older_adult')
    on conflict (group_id, profile_id) do nothing;
  return p_older_adult;
end;
$$;

-- Older adult joins a household as a brand-new person.
create or replace function create_older_adult_self_in_group(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := get_current_profile_id();
  v_group uuid;
  v_oa uuid;
  v_admin record;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  perform check_code_rate_limit(v_profile);
  select id into v_group from groups where join_code = upper(btrim(p_code));
  if v_group is null then
    insert into pairing_redeem_attempts(profile_id, success) values (v_profile, false);
    raise exception 'invalid code';
  end if;
  if exists (select 1 from older_adult_profiles where owner_profile_id = v_profile) then
    raise exception 'this device is already set up as a different person';
  end if;

  insert into older_adult_profiles (display_name, owner_profile_id, group_id)
  values (coalesce(nullif(btrim(p_display_name), ''), 'My profile'), v_profile, v_group)
  returning id into v_oa;
  insert into group_members(group_id, profile_id, member_role) values (v_group, v_profile, 'older_adult')
    on conflict (group_id, profile_id) do nothing;
  -- link every admin already in this household to the new older adult.
  for v_admin in select m.profile_id from group_members m where m.group_id = v_group and m.member_role = 'admin' loop
    insert into admin_older_adult_links (admin_id, older_adult_id, permission_level, status)
    select a.id, v_oa, 'family_admin', 'active' from admin_profiles a where a.profile_id = v_admin.profile_id
    on conflict (admin_id, older_adult_id) do update set status = 'active';
  end loop;
  return v_oa;
end;
$$;

-- Server-side rehydration: the current principal's household + their default older adult.
create or replace function get_my_group()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := get_current_profile_id();
  v_admin uuid;
  v_group uuid;
  v_code text;
  v_oa uuid;
begin
  if v_profile is null then return null; end if;

  -- older adult? (owns a care profile)
  select o.id, o.group_id into v_oa, v_group from older_adult_profiles o where o.owner_profile_id = v_profile limit 1;
  if v_oa is not null then
    if v_group is null then return null; end if;
    select join_code into v_code from groups where id = v_group;
    return json_build_object('mode','user','group_id',v_group,'join_code',v_code,'older_adult_id',v_oa);
  end if;

  -- admin?
  select id into v_admin from admin_profiles where profile_id = v_profile;
  if v_admin is not null then
    -- prefer an explicit group membership; fall back to a managed older adult's group.
    select g.id, g.join_code into v_group, v_code
    from group_members m join groups g on g.id = m.group_id
    where m.profile_id = v_profile and m.member_role = 'admin'
    order by m.created_at asc limit 1;
    if v_group is null then
      select o.group_id into v_group
      from admin_older_adult_links l join older_adult_profiles o on o.id = l.older_adult_id
      where l.admin_id = v_admin and l.status = 'active' and o.group_id is not null
      order by l.created_at asc limit 1;
      if v_group is not null then select join_code into v_code from groups where id = v_group; end if;
    end if;
    if v_group is null then return null; end if;
    select o.id into v_oa from older_adult_profiles o where o.group_id = v_group order by o.created_at asc limit 1;
    return json_build_object('mode','admin','group_id',v_group,'join_code',v_code,'older_adult_id',v_oa);
  end if;

  return null;
end;
$$;
