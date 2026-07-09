-- One-shot OPTIONAL backfill: give every older adult that has no group_id its own household,
-- attach its owner + linked admins as members. Safe to re-run (skips already-grouped rows).
--
-- NOTE: As of 2026-06-30 this was NOT applied to the live project. The only existing rows were
-- fragmented pre-launch TEST data; the fixed app re-onboards a stale device cleanly because
-- get_my_group() returns null for an older adult whose group_id is null. Apply this only if you
-- have REAL pre-group data to preserve.
do $$
declare
  o record;
  v_group uuid;
begin
  for o in select * from older_adult_profiles where group_id is null loop
    insert into groups (name, join_code, created_by_profile_id)
    values (coalesce(nullif(btrim(o.display_name), '') || '''s family', 'Our family'), gen_group_code(), o.owner_profile_id)
    returning id into v_group;

    update older_adult_profiles set group_id = v_group where id = o.id;

    if o.owner_profile_id is not null then
      insert into group_members(group_id, profile_id, member_role)
      values (v_group, o.owner_profile_id, 'older_adult')
      on conflict (group_id, profile_id) do nothing;
    end if;

    insert into group_members(group_id, profile_id, member_role)
    select v_group, a.profile_id, 'admin'
    from admin_older_adult_links l join admin_profiles a on a.id = l.admin_id
    where l.older_adult_id = o.id and l.status = 'active'
    on conflict (group_id, profile_id) do nothing;
  end loop;
end $$;
