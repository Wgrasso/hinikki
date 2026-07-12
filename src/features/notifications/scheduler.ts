// src/features/notifications/scheduler.ts — on-device reminder/event notifications (elder's phone).
// HiNikki has no server cron; instead each time the schedule changes we cancel and re-schedule
// LOCAL notifications so the elder is pinged at the right moment even if the app is closed:
//   • reminders fire at their set time (daily / weekly / one-off, from the recurrence),
//   • events fire "announce N minutes before" the start (using the event's lead minutes).
// Best-effort: if notification permission isn't granted, it quietly does nothing.
import * as Notifications from "expo-notifications";
import { listReminders } from "../../services/reminderService";
import { listEvents } from "../../services/calendarService";
import { getOlderAdult } from "../../services/profileService";

const TITLE = "HiNikki";

// A gentle sense of how soon, in the elder's language: "In 15 minutes" / "Over 15 minuten",
// "In 1 hour" / "Over 1 uur", or "Now" / "Nu" when it's starting.
function inTime(minutes: number, dutch: boolean): string {
  if (minutes <= 0) return dutch ? "Nu" : "Now";
  if (minutes < 60) {
    const unit = dutch ? (minutes === 1 ? "minuut" : "minuten") : minutes === 1 ? "minute" : "minutes";
    return dutch ? `Over ${minutes} ${unit}` : `In ${minutes} ${unit}`;
  }
  const hours = Math.round(minutes / 60);
  const unit = dutch ? "uur" : hours === 1 ? "hour" : "hours";
  return dutch ? `Over ${hours} ${unit}` : `In ${hours} ${unit}`;
}

async function schedule(body: string, trigger: Notifications.NotificationTriggerInput): Promise<void> {
  await Notifications.scheduleNotificationAsync({ content: { title: TITLE, body, sound: "default" }, trigger }).catch(() => undefined);
}

// Rebuild the whole set of scheduled notifications from the current schedule. Cancels everything
// first (HiNikki is the only source), so edits/deletes never leave stale pings behind.
export async function syncScheduledNotifications(olderAdultId: string): Promise<void> {
  try {
    // The elder's phone needs notification permission for reminders to fire — request it here
    // (this is the only place the elder app asks). After a decision it won't nag again.
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = Date.now();

    const [reminders, events, adult] = await Promise.all([
      listReminders(olderAdultId).catch(() => []),
      listEvents(olderAdultId).catch(() => []),
      getOlderAdult(olderAdultId).catch(() => null),
    ]);
    const dutch = (adult?.primary_language ?? "").startsWith("nl");

    for (const r of reminders) {
      if (!r.active || !r.scheduled_at) continue;
      const when = new Date(r.scheduled_at);
      if (Number.isNaN(when.getTime())) continue;
      const body = r.nikki_message ?? r.title;
      // One ping per configured alert: the first alert (default at the time) plus an optional
      // second. Each fires `lead` minutes before the reminder's time.
      const leads = Array.from(
        new Set([r.announce_lead_minutes ?? 0, ...(r.second_lead_minutes != null ? [r.second_lead_minutes] : [])]),
      );
      for (const lead of leads) {
        const fire = new Date(when.getTime() - lead * 60_000);
        if (r.recurrence_rule === "Every day") {
          await schedule(body, { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: fire.getHours(), minute: fire.getMinutes() });
        } else if (r.recurrence_rule === "Every week") {
          // expo weekday is 1–7 with 1 = Sunday; JS getDay() is 0–6 with 0 = Sunday.
          await schedule(body, { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: fire.getDay() + 1, hour: fire.getHours(), minute: fire.getMinutes() });
        } else if (r.recurrence_rule === "Every month") {
          await schedule(body, { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, day: fire.getDate(), hour: fire.getHours(), minute: fire.getMinutes() });
        } else if (fire.getTime() > now) {
          // One-off: a single ping at the (lead-adjusted) time, if it's still ahead.
          await schedule(body, { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire });
        }
      }
    }

    for (const e of events) {
      if (e.completion_status !== "scheduled" || e.announce_lead_minutes == null) continue;
      const fireAt = new Date(new Date(e.start_at).getTime() - e.announce_lead_minutes * 60_000);
      if (Number.isNaN(fireAt.getTime()) || fireAt.getTime() <= now) continue;
      // e.g. "In 15 minutes: a visit to Dr Jansen" — the lead IS how long until it starts.
      await schedule(`${inTime(e.announce_lead_minutes, dutch)}: ${e.user_friendly_summary ?? e.title}`, {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      });
    }
  } catch {
    // best-effort — a scheduling failure must never affect the app
  }
}
