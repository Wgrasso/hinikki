// src/features/voice/sessionVariables.ts — assembles the dynamic variables handed to the ElevenLabs
// agent at session start. This is the personalization seam: the agent's system prompt (versioned in
// elevenlabs/agent.json) references these as {{preferred_name}}, {{today_schedule}}, etc.
// Data minimization: names, schedules and admin-authored hints go to the agent; phone numbers and
// street addresses never do. Formatters are pure and unit-tested; the builder just fans out to the
// existing services (RLS-scoped via the user's own Supabase session).
import { listTodayEvents } from "../../services/calendarService";
import { listEmergencyContacts } from "../../services/emergencyService";
import { listPeople } from "../../services/peopleService";
import { listReminders } from "../../services/reminderService";
import { getWeather } from "../../services/weatherService";
import { formatTime } from "../../utils/format";
import type { CalendarEvent, FamilyPerson, Reminder } from "../../types/database";
import type { WeatherSnapshot } from "../../types/domain";

export type SessionVariables = Record<string, string>;

export function formatSchedule(events: CalendarEvent[]): string {
  const upcoming = events.filter((e) => e.completion_status === "scheduled");
  if (upcoming.length === 0) return "Nothing is planned today; it is a calm, open day.";
  return upcoming
    .map((e) => {
      const parts = [`${formatTime(e.start_at)} — ${e.user_friendly_summary ?? e.title}`];
      if (e.location_name) parts.push(`at ${e.location_name}`);
      if (e.what_to_bring) parts.push(`(bring: ${e.what_to_bring})`);
      if (e.nikki_before_event_message) parts.push(`[note from family: ${e.nikki_before_event_message}]`);
      return parts.join(" ");
    })
    .join("\n");
}

export function formatFamily(people: FamilyPerson[]): string {
  const visible = people.filter((p) => p.can_nikki_mention);
  if (visible.length === 0) return "No family members have been added yet.";
  return visible
    .map((p) => {
      const name = p.preferred_name ?? p.full_name;
      const parts = [`${name}${p.relationship_label ? ` (${p.relationship_label})` : ""}`];
      if (p.location_description) parts.push(`lives ${p.location_description}`);
      if (p.visit_frequency) parts.push(p.visit_frequency);
      if (p.important_notes) parts.push(p.important_notes);
      if (p.conversation_hints) parts.push(`[conversation hint: ${p.conversation_hints}]`);
      return `- ${parts.join(". ")}`;
    })
    .join("\n");
}

export function formatWeather(weather: WeatherSnapshot): string {
  const parts = [`${weather.summary}, ${weather.temperatureC}°C (feels like ${weather.feelsLikeC}°C)`, weather.clothingSuggestion];
  if (weather.safetySuggestion) parts.push(weather.safetySuggestion);
  return parts.join(" ");
}

export function formatMedicationNotes(reminders: Reminder[]): string {
  const meds = reminders.filter((r) => r.active && r.reminder_type === "medication");
  if (meds.length === 0) return "The family has not added any medication notes.";
  return meds
    .map((r) => {
      const detail = r.instructions ?? r.nikki_message;
      return `- ${r.title}${r.scheduled_at ? ` at ${formatTime(r.scheduled_at)}` : ""}${detail ? `: ${detail}` : ""}`;
    })
    .join("\n");
}

export function formatTodayDate(now: Date = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// Everything the agent should know for this session, flattened to strings.
// Failures of individual sources degrade to a safe default rather than blocking the call.
export async function buildSessionVariables(
  olderAdultId: string,
  preferredName: string | null,
): Promise<SessionVariables> {
  const [events, people, weather, reminders, contacts] = await Promise.all([
    listTodayEvents(olderAdultId).catch(() => [] as CalendarEvent[]),
    listPeople(olderAdultId).catch(() => [] as FamilyPerson[]),
    getWeather(olderAdultId).catch(() => null),
    listReminders(olderAdultId).catch(() => [] as Reminder[]),
    listEmergencyContacts(olderAdultId).catch(() => []),
  ]);

  return {
    preferred_name: preferredName ?? "friend",
    today_date: formatTodayDate(),
    local_time: formatTime(new Date().toISOString()),
    today_schedule: formatSchedule(events),
    family_summary: formatFamily(people),
    weather_today: weather ? formatWeather(weather) : "Weather information is not available right now.",
    medication_notes: formatMedicationNotes(reminders),
    // Names only — enough for "I can let Anna know", no phone numbers off-device.
    emergency_contact_names: contacts.map((c) => c.name).join(", ") || "their family",
  };
}
