-- Add emergency_contacts to the supabase_realtime publication so the safety-setup "!" marker and
-- the contacts list invalidate live across the family (e.g. when one admin deletes a shared
-- contact, everyone's app updates). Purely additive and re-runnable. RLS still filters rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'emergency_contacts'
  ) then
    execute 'alter publication supabase_realtime add table emergency_contacts';
  end if;
end $$;
