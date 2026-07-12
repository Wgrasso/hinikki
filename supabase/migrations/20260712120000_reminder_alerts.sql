-- Reminder alert offsets: how many minutes before a reminder's time to notify the elder.
-- announce_lead_minutes = first alert (null/0 = at the time); second_lead_minutes = optional 2nd.
alter table reminders add column if not exists announce_lead_minutes int;
alter table reminders add column if not exists second_lead_minutes int;
