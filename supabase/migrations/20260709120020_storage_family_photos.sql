-- HiNikki storage: private 'family-photos' bucket + RLS mirroring the DB access model.
-- Object path convention: <older_adult_id>/<person_id>/<file>.jpg  (folder[1] = older_adult_id)

insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', false)
on conflict (id) do nothing;

-- View: the older adult themselves OR a linked admin (mirrors can_view_older_adult)
drop policy if exists "family_photos_select" on storage.objects;
create policy "family_photos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'family-photos'
    and can_view_older_adult(((storage.foldername(name))[1])::uuid)
  );

-- Upload: managing admins only (mirrors can_manage_older_adult)
drop policy if exists "family_photos_insert" on storage.objects;
create policy "family_photos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'family-photos'
    and can_manage_older_adult(((storage.foldername(name))[1])::uuid)
  );

-- Update (upload uses upsert:true): managing admins only
drop policy if exists "family_photos_update" on storage.objects;
create policy "family_photos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'family-photos'
    and can_manage_older_adult(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'family-photos'
    and can_manage_older_adult(((storage.foldername(name))[1])::uuid)
  );

-- Delete: managing admins only
drop policy if exists "family_photos_delete" on storage.objects;
create policy "family_photos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'family-photos'
    and can_manage_older_adult(((storage.foldername(name))[1])::uuid)
  );
