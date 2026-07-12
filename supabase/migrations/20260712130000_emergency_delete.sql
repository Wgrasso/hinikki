-- Let family admins permanently delete an alert from the log (swipe-to-delete on the Safety tab).
-- Resolving keeps it as history; deleting removes it entirely.
create policy "delete emergency_events" on emergency_events
  for delete using (can_manage_older_adult(older_adult_id));
