-- 20260710120000_nikki_brain.sql — the Nikki "brain" write-back layer (docs/plans/nikki-brain.md §4.1).
-- Purely ADDITIVE: two new tables, one helper function, realtime publication entries.
-- No existing table, column, or policy is altered. Idempotent per repo convention.

-- ─── nikki_proposals ─────────────────────────────────────────────────────────
-- The human-in-the-loop queue: the elder's session (via Nikki's tools) INSERTs
-- pending facts; managing admins review, apply under their own session, and the
-- row records the audit trail. 'session_recap' rows (status 'fyi') are the
-- Conversations feed — informational, never reviewable, never applied.
create table if not exists nikki_proposals (
  id uuid primary key default gen_random_uuid(),
  older_adult_id uuid not null references older_adult_profiles(id) on delete cascade,
  proposal_type text not null,
  target_id uuid,
  payload jsonb not null,
  source_quote text,
  agent_note text,
  status text not null default 'pending'
    check (status in ('pending','approved','declined','applied','failed','fyi')),
  decline_reason text
    check (decline_reason in ('already_known','not_true','family_prefers_not')),
  review_note text,
  reviewed_by_admin_id uuid references admin_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists nikki_proposals_review_idx
  on nikki_proposals (older_adult_id, status, created_at desc);
alter table nikki_proposals enable row level security;

-- The elder session may only file clean rows: pending facts or fyi recaps,
-- never pre-filled review fields (forged audit trail) and never a reviewable
-- recap / unreviewable fact (status↔type coupling).
drop policy if exists "self insert proposals" on nikki_proposals;
create policy "self insert proposals" on nikki_proposals
  for insert with check (
    is_self_older_adult(older_adult_id)
    and status in ('pending','fyi')
    and ((status = 'fyi') = (proposal_type = 'session_recap'))
    and decline_reason is null and review_note is null
    and reviewed_by_admin_id is null and reviewed_at is null
  );
drop policy if exists "view proposals" on nikki_proposals;
create policy "view proposals" on nikki_proposals
  for select using (can_view_older_adult(older_adult_id));
drop policy if exists "manage proposals" on nikki_proposals;
create policy "manage proposals" on nikki_proposals
  for update using (can_manage_older_adult(older_adult_id))
  with check (can_manage_older_adult(older_adult_id));
-- Decline-and-erase: a stored insult must be removable (plan FR-8 layer 3).
drop policy if exists "erase proposals" on nikki_proposals;
create policy "erase proposals" on nikki_proposals
  for delete using (can_manage_older_adult(older_adult_id));

-- ─── push_tokens ─────────────────────────────────────────────────────────────
-- One row per device. The elder's device fans proposal pushes out client-side,
-- so it must READ its admins' tokens — scoped to ACTIVE admin links, not raw
-- group membership (legacy pairing-linked admins have links but no membership;
-- revoked caregivers keep membership forever — neither may diverge here).
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  unique (profile_id, expo_push_token)
);
alter table push_tokens enable row level security;

create or replace function is_my_active_admin(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_older_adult_links l
    join admin_profiles a on a.id = l.admin_id
    where a.profile_id = p_profile_id
      and l.status = 'active'
      and is_self_older_adult(l.older_adult_id)
  );
$$;

drop policy if exists "own token" on push_tokens;
create policy "own token" on push_tokens
  for all using (profile_id = get_current_profile_id())
  with check (profile_id = get_current_profile_id());
drop policy if exists "my active admins' tokens" on push_tokens;
create policy "my active admins' tokens" on push_tokens
  for select using (is_my_active_admin(profile_id));

-- Guard trigger (additive, on OUR new table only): RLS grants managing admins UPDATE,
-- but review must not rewrite history — no re-parenting a row to another elder, no
-- editing recaps into reviewable facts, no forging another admin's reviewed_by, and
-- only legal status transitions.
create or replace function nikki_proposals_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.older_adult_id <> old.older_adult_id
     or new.proposal_type <> old.proposal_type
     or new.created_at <> old.created_at
     or new.source_quote is distinct from old.source_quote then
    raise exception 'immutable proposal fields cannot change';
  end if;
  if old.status = 'fyi' then
    raise exception 'recap rows are immutable';
  end if;
  if new.payload::text is distinct from old.payload::text
     and old.status not in ('pending', 'approved') then
    raise exception 'payload can only change during review';
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending' and new.status in ('approved', 'declined', 'failed'))
      or (old.status = 'approved' and new.status in ('applied', 'failed'))
      or (old.status = 'failed' and new.status = 'approved')
    ) then
      raise exception 'illegal proposal status transition: % -> %', old.status, new.status;
    end if;
  end if;
  if new.reviewed_by_admin_id is not null
     and new.reviewed_by_admin_id is distinct from old.reviewed_by_admin_id
     and new.reviewed_by_admin_id not in (
       select id from admin_profiles where profile_id = get_current_profile_id()
     ) then
    raise exception 'reviewed_by must be the acting admin';
  end if;
  return new;
end;
$$;
drop trigger if exists nikki_proposals_guard_trg on nikki_proposals;
create trigger nikki_proposals_guard_trg
  before update on nikki_proposals
  for each row execute function nikki_proposals_guard();

-- ─── realtime publication ────────────────────────────────────────────────────
-- FLAGGED DDL (plan §4.1/§11): adds existing tables to the supabase_realtime
-- publication so screens + the context snapshot invalidate without manual
-- refresh. RLS still filters what each session receives. Guarded per table so
-- the migration is re-runnable.
do $$
declare
  t text;
begin
  foreach t in array array[
    'nikki_proposals', 'family_people', 'person_photos', 'calendar_events',
    'reminders', 'person_memories', 'family_relationships', 'emergency_events',
    'older_adult_profiles', 'safe_locations', 'weather_preferences'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
