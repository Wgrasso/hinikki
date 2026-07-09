-- Additive columns so the existing "add event" form can store its new input fields.
-- No new feature/table — just two nullable columns on the existing calendar_events table.
alter table calendar_events add column if not exists companion text;                 -- who the older adult goes with (null = alone)
alter table calendar_events add column if not exists announce_lead_minutes integer;   -- how long before start Nikki announces it
