-- HiNikki — Supabase schema (Postgres) — apply with: node scripts/apply-schema.mjs blueprints/hinikki.schema.sql
-- Conventions: uuid PKs via gen_random_uuid(); timestamptz defaults now(); RLS on every table.
-- Identity model: every authenticated principal (admin OR older adult's device) has ONE row in `profiles`,
-- keyed to auth.uid(). Older adults use Supabase ANONYMOUS auth; admins use email/password.
-- An older_adult_profile is OWNED by the older adult's profile (owner_profile_id) and MANAGED by admins via links.

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Identity
-- ----------------------------------------------------------------------------
create table profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  role          text not null check (role in ('older_adult','admin','caregiver','viewer')),
  selected_mode text check (selected_mode in ('user','admin')),
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table admin_profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  profile_id   uuid not null unique references profiles(id) on delete cascade,
  display_name text,
  email        text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table older_adult_profiles (
  id                uuid primary key default gen_random_uuid(),
  owner_profile_id  uuid unique references profiles(id) on delete set null, -- the older adult's own (anon) identity; null until their device pairs
  display_name      text not null,
  preferred_name    text,
  date_of_birth     date,
  primary_language  text not null default 'en',
  home_address      text,
  setup_status      text not null default 'in_progress' check (setup_status in ('in_progress','ready')),
  created_by_admin_id uuid references admin_profiles(id) on delete set null,
  created_by_device_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table admin_older_adult_links (
  id                   uuid primary key default gen_random_uuid(),
  admin_id             uuid not null references admin_profiles(id) on delete cascade,
  older_adult_id       uuid not null references older_adult_profiles(id) on delete cascade,
  relationship_to_user text,
  permission_level     text not null default 'family_admin' check (permission_level in ('owner','family_admin','caregiver','viewer')),
  status               text not null default 'active' check (status in ('active','revoked')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (admin_id, older_adult_id)
);

-- ----------------------------------------------------------------------------
-- Pairing (codes are HASHED; raw code shown once, redeemed via SECURITY DEFINER RPC)
-- ----------------------------------------------------------------------------
create table pairing_codes (
  id                   uuid primary key default gen_random_uuid(),
  code_hash            text not null,
  readable_code_hint   text,                       -- e.g. masked '4•• •13' for display lists, never the full code
  created_by_type      text not null check (created_by_type in ('older_adult','admin')),
  created_by_profile_id uuid references profiles(id) on delete set null,
  older_adult_id       uuid references older_adult_profiles(id) on delete cascade,
  admin_id             uuid references admin_profiles(id) on delete set null,
  intended_role        text not null check (intended_role in ('older_adult','admin')),
  expires_at           timestamptz not null,
  used_at              timestamptz,
  status               text not null default 'active' check (status in ('active','used','expired','revoked')),
  created_at           timestamptz not null default now()
);
create index on pairing_codes (code_hash);

-- Brute-force protection: redemption attempts are logged so the 6-digit space can be rate-limited.
create table pairing_redeem_attempts (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references profiles(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  success      boolean not null default false
);
create index on pairing_redeem_attempts (profile_id, attempted_at);
alter table pairing_redeem_attempts enable row level security;
create policy "no direct attempts access" on pairing_redeem_attempts for select using (false);

-- ----------------------------------------------------------------------------
-- People & family tree
-- ----------------------------------------------------------------------------
create table family_people (
  id                     uuid primary key default gen_random_uuid(),
  older_adult_id         uuid not null references older_adult_profiles(id) on delete cascade,
  full_name              text not null,
  preferred_name         text,
  relationship_label     text,                    -- 'daughter', 'grandson', 'neighbour'
  date_of_birth          date,
  phone                  text,
  address                text,
  role_in_family         text,
  location_description    text,
  visit_frequency        text,
  important_notes        text,
  conversation_hints     text,
  pronunciation_help     text,
  emotional_tone         text,
  admin_only_notes       text,
  can_nikki_mention      boolean not null default true,
  can_contact_in_emergency boolean not null default false,
  is_admin               boolean not null default false,
  preferred_contact_method text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table family_relationships (
  id                uuid primary key default gen_random_uuid(),
  older_adult_id    uuid not null references older_adult_profiles(id) on delete cascade,
  person_a_id       uuid not null references family_people(id) on delete cascade,
  person_b_id       uuid not null references family_people(id) on delete cascade,
  relationship_type text not null,                 -- 'child_of','spouse_of','sibling_of','parent_of'
  notes             text,
  created_at        timestamptz not null default now()
);

create table person_photos (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references family_people(id) on delete cascade,
  storage_path text not null,                       -- RELATIVE path in 'family-photos' bucket, never an absolute URI
  caption      text,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);

create table person_memories (
  id                uuid primary key default gen_random_uuid(),
  older_adult_id    uuid not null references older_adult_profiles(id) on delete cascade,
  person_id         uuid references family_people(id) on delete set null,
  title             text,
  description       text,
  approximate_date  text,
  emotional_tone    text,
  photo_storage_path text,
  can_nikki_mention boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Calendar & reminders
-- ----------------------------------------------------------------------------
create table calendar_events (
  id                       uuid primary key default gen_random_uuid(),
  older_adult_id           uuid not null references older_adult_profiles(id) on delete cascade,
  title                    text not null,
  event_type               text,
  start_at                 timestamptz not null,
  end_at                   timestamptz,
  location_name            text,
  location_address         text,
  preparation_notes        text,
  transport_notes          text,
  what_to_bring            text,
  nikki_day_summary        text,
  nikki_before_event_message text,
  calming_explanation      text,
  priority_level           text not null default 'normal' check (priority_level in ('low','normal','high')),
  may_cause_stress         boolean not null default false,
  notify_family            boolean not null default false,
  admin_notes              text,
  user_friendly_summary    text,
  recurrence_rule          text,
  completion_status        text not null default 'scheduled' check (completion_status in ('scheduled','done','missed','cancelled')),
  follow_up_notes          text,
  created_by_admin_id      uuid references admin_profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index on calendar_events (older_adult_id, start_at);

create table calendar_event_people (
  id                uuid primary key default gen_random_uuid(),
  calendar_event_id uuid not null references calendar_events(id) on delete cascade,
  person_id         uuid not null references family_people(id) on delete cascade,
  role_in_event     text,
  created_at        timestamptz not null default now()
);

create table reminders (
  id                  uuid primary key default gen_random_uuid(),
  older_adult_id      uuid not null references older_adult_profiles(id) on delete cascade,
  title               text not null,
  reminder_type       text,                         -- 'medication','appointment','hydration','visit','routine'
  scheduled_at        timestamptz,
  recurrence_rule     text,
  instructions        text,
  nikki_message       text,
  requires_confirmation boolean not null default false,
  priority_level      text not null default 'normal' check (priority_level in ('low','normal','high')),
  active              boolean not null default true,
  created_by_admin_id uuid references admin_profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table reminder_confirmations (
  id                  uuid primary key default gen_random_uuid(),
  reminder_id         uuid not null references reminders(id) on delete cascade,
  older_adult_id      uuid not null references older_adult_profiles(id) on delete cascade,
  confirmed_at        timestamptz not null default now(),
  confirmation_method text,
  notes               text
);

-- ----------------------------------------------------------------------------
-- Location & safety
-- ----------------------------------------------------------------------------
create table safe_locations (
  id             uuid primary key default gen_random_uuid(),
  older_adult_id uuid not null references older_adult_profiles(id) on delete cascade,
  name           text not null,
  address        text,
  latitude       double precision,
  longitude      double precision,
  radius_meters  integer not null default 150,
  location_type  text,                              -- 'home','family','familiar','medical'
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table location_updates (
  id             uuid primary key default gen_random_uuid(),
  older_adult_id uuid not null references older_adult_profiles(id) on delete cascade,
  latitude       double precision not null,
  longitude      double precision not null,
  accuracy       double precision,
  battery_level  double precision,
  movement_state text,
  source_device  text,
  emergency_flag boolean not null default false,
  created_at     timestamptz not null default now()
);
create index on location_updates (older_adult_id, created_at desc);

create table emergency_contacts (
  id             uuid primary key default gen_random_uuid(),
  older_adult_id uuid not null references older_adult_profiles(id) on delete cascade,
  person_id      uuid references family_people(id) on delete set null,
  name           text not null,
  phone          text,
  relationship   text,
  priority_order integer not null default 1,
  contact_method text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table emergency_events (
  id               uuid primary key default gen_random_uuid(),
  older_adult_id   uuid not null references older_adult_profiles(id) on delete cascade,
  event_type       text not null,                   -- 'lost','fall','medical','distress','help'
  user_message     text,
  detected_urgency text not null default 'medium' check (detected_urgency in ('low','medium','high','critical')),
  location_update_id uuid references location_updates(id) on delete set null,
  status           text not null default 'open' check (status in ('open','acknowledged','resolved')),
  notified_admins  boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

-- ----------------------------------------------------------------------------
-- Weather, chat, AI memory, settings
-- ----------------------------------------------------------------------------
create table weather_preferences (
  id                   uuid primary key default gen_random_uuid(),
  older_adult_id       uuid not null unique references older_adult_profiles(id) on delete cascade,
  weather_location     text,
  cold_threshold       integer default 8,
  heat_threshold       integer default 28,
  rain_reminder_enabled boolean not null default true,
  wind_warning_enabled boolean not null default false,
  clothing_notes       text,
  hydration_notes      text,
  custom_weather_advice text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table chat_interactions (
  id             uuid primary key default gen_random_uuid(),
  older_adult_id uuid not null references older_adult_profiles(id) on delete cascade,
  sender         text not null check (sender in ('user','nikki')),
  message        text,
  nikki_response text,
  intent         text,
  context_used   jsonb,
  safety_level   text default 'normal' check (safety_level in ('normal','caution','emergency')),
  created_at     timestamptz not null default now()
);
create index on chat_interactions (older_adult_id, created_at);

create table ai_memory_items (
  id                uuid primary key default gen_random_uuid(),
  older_adult_id    uuid not null references older_adult_profiles(id) on delete cascade,
  memory_type       text,
  title             text,
  content           text,
  related_person_id uuid references family_people(id) on delete set null,
  importance        integer not null default 1,
  can_nikki_mention boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table app_settings (
  id                       uuid primary key default gen_random_uuid(),
  older_adult_id           uuid not null unique references older_adult_profiles(id) on delete cascade,
  language                 text not null default 'en',
  text_size                text not null default 'large' check (text_size in ('large','xlarge','xxlarge')),
  high_contrast_mode       boolean not null default false,
  reminder_style           text,
  emergency_behavior       text,
  location_sharing_enabled boolean not null default true,
  weather_enabled          boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER, search_path pinned)
-- ----------------------------------------------------------------------------
create or replace function get_current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid();
$$;

create or replace function is_self_older_adult(p_older_adult uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from older_adult_profiles o
    where o.id = p_older_adult and o.owner_profile_id = get_current_profile_id()
  );
$$;

create or replace function is_admin_linked_to_older_adult(p_older_adult uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from admin_older_adult_links l
    join admin_profiles a on a.id = l.admin_id
    where l.older_adult_id = p_older_adult
      and l.status = 'active'
      and a.profile_id = get_current_profile_id()
  );
$$;

create or replace function can_manage_older_adult(p_older_adult uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from admin_older_adult_links l
    join admin_profiles a on a.id = l.admin_id
    where l.older_adult_id = p_older_adult
      and l.status = 'active'
      and l.permission_level in ('owner','family_admin','caregiver')
      and a.profile_id = get_current_profile_id()
  );
$$;

-- can the current principal SEE this older adult's data (self OR any active linked admin/viewer)
create or replace function can_view_older_adult(p_older_adult uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_self_older_adult(p_older_adult) or is_admin_linked_to_older_adult(p_older_adult);
$$;

-- ----------------------------------------------------------------------------
-- Pairing RPCs (the ONLY way codes are created/redeemed; raw code never stored)
-- ----------------------------------------------------------------------------
-- Generate a 6-digit code for an older adult profile; returns the RAW code ONCE.
create or replace function generate_pairing_code(p_older_adult uuid, p_intended_role text, p_ttl_hours int default 72)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text;
  v_hash text;
  v_rand bytea;
begin
  if not (is_self_older_adult(p_older_adult) or can_manage_older_adult(p_older_adult)) then
    raise exception 'not authorized to generate a code for this profile';
  end if;
  -- CSPRNG-sourced 6-digit code (pgcrypto gen_random_bytes), kept numeric for read-aloud usability.
  v_rand := gen_random_bytes(3);
  v_code := lpad(((((get_byte(v_rand, 0)::int << 16) | (get_byte(v_rand, 1)::int << 8) | get_byte(v_rand, 2)::int) % 1000000))::text, 6, '0');
  v_hash := encode(digest(v_code, 'sha256'), 'hex');
  update pairing_codes set status = 'revoked'
    where older_adult_id = p_older_adult and intended_role = p_intended_role and status = 'active';
  insert into pairing_codes(code_hash, readable_code_hint, created_by_type, created_by_profile_id,
                            older_adult_id, intended_role, expires_at, status)
  values (v_hash, left(v_code,1) || '•• •' || right(v_code,2),
          (select role from profiles where id = get_current_profile_id())::text,
          get_current_profile_id(), p_older_adult, p_intended_role,
          now() + make_interval(hours => p_ttl_hours), 'active');
  return v_code;
end;
$$;

-- Redeem a code: links the CURRENT principal (admin) to the older adult, or claims ownership (older adult).
create or replace function redeem_pairing_code(p_code text, p_relationship text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_row pairing_codes;
  v_hash text;
  v_admin uuid;
  v_profile uuid := get_current_profile_id();
begin
  if v_profile is null then
    raise exception 'not authenticated';
  end if;
  -- Rate limit: at most 5 failed redemptions per 15 minutes per principal, so the 1e6 code
  -- space cannot be enumerated (combined with single-use + 72h expiry + one active code).
  if (select count(*) from pairing_redeem_attempts
        where profile_id = v_profile and not success
          and attempted_at > now() - interval '15 minutes') >= 5 then
    raise exception 'too many attempts — please wait a few minutes and try again';
  end if;

  v_hash := encode(digest(p_code, 'sha256'), 'hex');
  select * into v_row from pairing_codes
    where code_hash = v_hash and status = 'active' and expires_at > now()
    order by created_at desc limit 1;
  if v_row.id is null then
    insert into pairing_redeem_attempts(profile_id, success) values (v_profile, false);
    raise exception 'invalid or expired code';
  end if;

  if v_row.intended_role = 'admin' then
    select id into v_admin from admin_profiles where profile_id = v_profile;
    if v_admin is null then raise exception 'only an admin can redeem an admin code'; end if;
    insert into admin_older_adult_links(admin_id, older_adult_id, relationship_to_user, permission_level, status)
    values (v_admin, v_row.older_adult_id, p_relationship, 'family_admin', 'active')
    on conflict (admin_id, older_adult_id) do update set status = 'active';
  else
    -- older adult claiming a profile an admin created
    update older_adult_profiles set owner_profile_id = v_profile
      where id = v_row.older_adult_id and owner_profile_id is null;
  end if;

  update pairing_codes set status = 'used', used_at = now() where id = v_row.id;
  insert into pairing_redeem_attempts(profile_id, success) values (v_profile, true);
  return v_row.older_adult_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Profile-creation RPCs (SECURITY DEFINER) — set ownership server-side and avoid the
-- self-referential RLS + RETURNING trap a client insert hits on older_adult_profiles.
-- ----------------------------------------------------------------------------
create or replace function create_older_adult_for_self(p_display_name text default 'My profile', p_device_id text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := get_current_profile_id();
  v_id uuid;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  insert into older_adult_profiles (display_name, owner_profile_id, created_by_device_id)
  values (coalesce(nullif(btrim(p_display_name), ''), 'My profile'), v_profile, p_device_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function create_older_adult_by_admin(p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid;
  v_id uuid;
begin
  select id into v_admin from admin_profiles where profile_id = get_current_profile_id();
  if v_admin is null then raise exception 'not an admin'; end if;
  insert into older_adult_profiles (display_name, created_by_admin_id)
  values (coalesce(nullif(btrim(p_display_name), ''), 'Loved one'), v_admin)
  returning id into v_id;
  -- The creating admin must be linked as owner, or can_manage_older_adult() denies them.
  insert into admin_older_adult_links (admin_id, older_adult_id, permission_level, status)
  values (v_admin, v_id, 'owner', 'active')
  on conflict (admin_id, older_adult_id) do update set status = 'active';
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Enable RLS + policies
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;
alter table admin_profiles enable row level security;
alter table older_adult_profiles enable row level security;
alter table admin_older_adult_links enable row level security;
alter table pairing_codes enable row level security;
alter table family_people enable row level security;
alter table family_relationships enable row level security;
alter table person_photos enable row level security;
alter table person_memories enable row level security;
alter table calendar_events enable row level security;
alter table calendar_event_people enable row level security;
alter table reminders enable row level security;
alter table reminder_confirmations enable row level security;
alter table safe_locations enable row level security;
alter table location_updates enable row level security;
alter table emergency_contacts enable row level security;
alter table emergency_events enable row level security;
alter table weather_preferences enable row level security;
alter table chat_interactions enable row level security;
alter table ai_memory_items enable row level security;
alter table app_settings enable row level security;

-- profiles: a principal sees/edits only their own profile row
create policy "own profile" on profiles for all
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy "own admin profile" on admin_profiles for all
  using (profile_id = get_current_profile_id()) with check (profile_id = get_current_profile_id());

-- older_adult_profiles: self or any linked admin can view; managers + self can update
create policy "view older adult" on older_adult_profiles for select
  using (can_view_older_adult(id));
create policy "manage older adult" on older_adult_profiles for update
  using (is_self_older_adult(id) or can_manage_older_adult(id))
  with check (is_self_older_adult(id) or can_manage_older_adult(id));
create policy "insert older adult" on older_adult_profiles for insert
  with check (owner_profile_id = get_current_profile_id() or created_by_admin_id in
              (select id from admin_profiles where profile_id = get_current_profile_id()));

-- links: an admin sees their own links; older adult sees links to their profile
create policy "view own links" on admin_older_adult_links for select
  using (admin_id in (select id from admin_profiles where profile_id = get_current_profile_id())
         or is_self_older_adult(older_adult_id));

-- pairing_codes: no direct table access; everything goes through the RPCs (definer). Deny all by default.
create policy "no direct pairing access" on pairing_codes for select using (false);

-- Generic child-table pattern: visible/manageable iff you can view/manage the owning older_adult.
-- VIEW = self or linked admin; WRITE (insert/update/delete) = self or managing admin.
create policy "view family_people" on family_people for select using (can_view_older_adult(older_adult_id));
create policy "manage family_people" on family_people for all
  using (is_self_older_adult(older_adult_id) or can_manage_older_adult(older_adult_id))
  with check (is_self_older_adult(older_adult_id) or can_manage_older_adult(older_adult_id));

create policy "view family_relationships" on family_relationships for select using (can_view_older_adult(older_adult_id));
create policy "manage family_relationships" on family_relationships for all
  using (can_manage_older_adult(older_adult_id)) with check (can_manage_older_adult(older_adult_id));

create policy "view person_photos" on person_photos for select
  using (exists (select 1 from family_people p where p.id = person_id and can_view_older_adult(p.older_adult_id)));
create policy "manage person_photos" on person_photos for all
  using (exists (select 1 from family_people p where p.id = person_id and can_manage_older_adult(p.older_adult_id)))
  with check (exists (select 1 from family_people p where p.id = person_id and can_manage_older_adult(p.older_adult_id)));

create policy "view person_memories" on person_memories for select using (can_view_older_adult(older_adult_id));
create policy "manage person_memories" on person_memories for all
  using (can_manage_older_adult(older_adult_id)) with check (can_manage_older_adult(older_adult_id));

create policy "view calendar_events" on calendar_events for select using (can_view_older_adult(older_adult_id));
create policy "manage calendar_events" on calendar_events for all
  using (can_manage_older_adult(older_adult_id)) with check (can_manage_older_adult(older_adult_id));

create policy "view calendar_event_people" on calendar_event_people for select
  using (exists (select 1 from calendar_events e where e.id = calendar_event_id and can_view_older_adult(e.older_adult_id)));
create policy "manage calendar_event_people" on calendar_event_people for all
  using (exists (select 1 from calendar_events e where e.id = calendar_event_id and can_manage_older_adult(e.older_adult_id)))
  with check (exists (select 1 from calendar_events e where e.id = calendar_event_id and can_manage_older_adult(e.older_adult_id)));

create policy "view reminders" on reminders for select using (can_view_older_adult(older_adult_id));
create policy "manage reminders" on reminders for all
  using (can_manage_older_adult(older_adult_id)) with check (can_manage_older_adult(older_adult_id));

-- reminder_confirmations: the older adult confirms; admins view
create policy "view reminder_confirmations" on reminder_confirmations for select using (can_view_older_adult(older_adult_id));
create policy "confirm reminders" on reminder_confirmations for insert with check (is_self_older_adult(older_adult_id));

create policy "view safe_locations" on safe_locations for select using (can_view_older_adult(older_adult_id));
create policy "manage safe_locations" on safe_locations for all
  using (can_manage_older_adult(older_adult_id)) with check (can_manage_older_adult(older_adult_id));

-- location_updates: the older adult device writes; self + linked admins read
create policy "view location_updates" on location_updates for select using (can_view_older_adult(older_adult_id));
create policy "write location_updates" on location_updates for insert with check (is_self_older_adult(older_adult_id));

create policy "view emergency_contacts" on emergency_contacts for select using (can_view_older_adult(older_adult_id));
create policy "manage emergency_contacts" on emergency_contacts for all
  using (can_manage_older_adult(older_adult_id)) with check (can_manage_older_adult(older_adult_id));

-- emergency_events: older adult creates (distress), self + admins view, admins resolve
create policy "view emergency_events" on emergency_events for select using (can_view_older_adult(older_adult_id));
create policy "create emergency_events" on emergency_events for insert
  with check (is_self_older_adult(older_adult_id));
create policy "resolve emergency_events" on emergency_events for update
  using (can_manage_older_adult(older_adult_id)) with check (can_manage_older_adult(older_adult_id));

create policy "view weather_preferences" on weather_preferences for select using (can_view_older_adult(older_adult_id));
create policy "manage weather_preferences" on weather_preferences for all
  using (can_manage_older_adult(older_adult_id)) with check (can_manage_older_adult(older_adult_id));

-- chat_interactions: only the older adult (self) reads/writes their own chat; admins see a redacted recent feed via a view (future). MVP: self only.
create policy "own chat" on chat_interactions for all
  using (is_self_older_adult(older_adult_id)) with check (is_self_older_adult(older_adult_id));

create policy "view ai_memory_items" on ai_memory_items for select using (can_view_older_adult(older_adult_id));
create policy "manage ai_memory_items" on ai_memory_items for all
  using (can_manage_older_adult(older_adult_id)) with check (can_manage_older_adult(older_adult_id));

create policy "view app_settings" on app_settings for select using (can_view_older_adult(older_adult_id));
create policy "manage app_settings" on app_settings for all
  using (is_self_older_adult(older_adult_id) or can_manage_older_adult(older_adult_id))
  with check (is_self_older_adult(older_adult_id) or can_manage_older_adult(older_adult_id));

-- Storage: create a private bucket 'family-photos' in the Supabase dashboard; add storage policies
-- that allow read/write only to principals where can_view_older_adult / can_manage_older_adult holds
-- for the person the object belongs to (path convention: <older_adult_id>/<person_id>/<filename>).
