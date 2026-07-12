// src/features/notifications/scheduler.ts — on-device reminder/event notifications (elder's phone).
// HiNikki has no server cron; instead each time the schedule changes we cancel and re-schedule
// LOCAL notifications so the elder is pinged at the right moment even if the app is closed:
//   • reminders fire at their set time (daily / weekly / one-off, from the recurrence),
//   • events fire "announce N minutes before" the start (using the event's lead minutes).
// Best-effort: if notification permission isn't granted, it quietly does nothing.
import * as Notifications from "expo-notifications";
import { listReminders } from "../../services/reminderService";
import { listEvents } from "../../services/calendarService";

const TITLE = "HiNikki";

async function schedule(body: string, trigger: Notifications.NotificationTriggerInput): Promise<void> {
  await Notifications.scheduleNotificationAsync({ content: { title: TITLE, body, sound: "default" }, trigger }).catch(() => undefined);
}

// Rebuild the whole set of scheduled notifications from the current schedule. Cancels everything
// first (HiNikki is the only source), so edits/deletes never leave stale pings behind.
export async function syncScheduledNotifications(olderAdultId: string): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return; // permission is requested during push registration; don't nag here
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = Date.now();

    const [reminders, events] = await Promise.all([
      listReminders(olderAdultId).catch(() => []),
      listEvents(olderAdultId).catch(() => []),
    ]);

    for (const r of reminders) {
      if (!r.active || !r.scheduled_at) continue;
      const when = new Date(r.scheduled_at);
      if (Number.isNaN(when.getTime())) continue;
      const body = r.nikki_message ?? r.title;
      if (r.recurrence_rule === "Every day") {
        await schedule(body, { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: when.getHours(), minute: when.getMinutes() });
      } else if (r.recurrence_rule === "Every week") {
        // expo weekday is 1–7 with 1 = Sunday; JS getDay() is 0–6 with 0 = Sunday.
        await schedule(body, { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: when.getDay() + 1, hour: when.getHours(), minute: when.getMinutes() });
      } else if (when.getTime() > now) {
        // One-off (or an unrecognised custom rule): a single ping at the set time, if still ahead.
        await schedule(body, { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when });
      }
    }

    for (const e of events) {
      if (e.completion_status !== "scheduled" || e.announce_lead_minutes == null) continue;
      const fireAt = new Date(new Date(e.start_at).getTime() - e.announce_lead_minutes * 60_000);
      if (Number.isNaN(fireAt.getTime()) || fireAt.getTime() <= now) continue;
      await schedule(`Soon: ${e.user_friendly_summary ?? e.title}`, { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt });
    }
  } catch {
    // best-effort — a scheduling failure must never affect the app
  }
}
