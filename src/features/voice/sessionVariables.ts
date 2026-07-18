// src/features/voice/sessionVariables.ts — assembles the dynamic variables handed to the ElevenLabs
// agent at session start. This is the personalization seam: the agent's system prompt (versioned in
// elevenlabs/agent.json) references these as {{preferred_name}}, {{today_schedule}}, etc.
// Data minimization: names, schedules and admin-authored hints go to the agent; phone numbers and
// street addresses never do (home_hint carries only the area after the last comma). Formatters are
// pure and unit-tested; the builder reads the tiered snapshot cache (src/features/voice/snapshot.ts)
// so a session start never fans out to the network when the cache is warm (plan §2.2, NFR-1).
// Changing a variable name is a TWO-SIDED change: elevenlabs/agent.json + this file + tests.
import { formatTime, timeOfDay } from "../../utils/format";
import {
  disambiguationSuffixes,
  getSnapshotTiers,
  neverRaiseNames,
  renderRelationshipSentences,
  selectMemories,
  type SnapshotTiers,
} from "./snapshot";
import type {
  CalendarEvent,
  FamilyPerson,
  FamilyRelationship,
  PersonMemory,
  Reminder,
} from "../../types/database";
import type { WeatherSnapshot } from "../../types/domain";

export type SessionVariables = Record<string, string>;

function eventLine(e: CalendarEvent): string {
  const parts = [`${formatTime(e.start_at)} — ${e.user_friendly_summary ?? e.title}`];
  if (e.location_name) parts.push(`at ${e.location_name}`);
  if (e.companion) parts.push(`with ${e.companion}`);
  if (e.transport_notes) parts.push(`(getting there: ${e.transport_notes})`);
  if (e.announce_lead_minutes != null && e.announce_lead_minutes > 0) {
    const announceAt = new Date(new Date(e.start_at).getTime() - e.announce_lead_minutes * 60_000);
    parts.push(`[mention it from ${formatTime(announceAt.toISOString())}]`);
  }
  if (e.what_to_bring) parts.push(`(bring: ${e.what_to_bring})`);
  if (e.nikki_before_event_message) parts.push(`[note from family: ${e.nikki_before_event_message}]`);
  return parts.join(" ");
}

export function formatSchedule(events: CalendarEvent[]): string {
  const upcoming = events.filter((e) => e.completion_status === "scheduled");
  if (upcoming.length === 0) return "Nothing is planned today; it is a calm, open day.";
  return upcoming.map(eventLine).join("\n");
}

// Tomorrow / the next-48h window beyond today (plan [SOON], FR-3).
export function formatSoon(events: CalendarEvent[]): string {
  const upcoming = events.filter((e) => e.completion_status === "scheduled");
  if (upcoming.length === 0) return "Nothing extra is planned for tomorrow yet.";
  return upcoming
    .map((e) => {
      const day = new Date(e.start_at).toLocaleDateString(undefined, { weekday: "long" });
      return `${day} ${eventLine(e)}`;
    })
    .join("\n");
}

export function formatFamily(
  people: FamilyPerson[],
  relationships: FamilyRelationship[] = [],
): string {
  const visible = people.filter((p) => p.can_nikki_mention);
  if (visible.length === 0) return "No family members have been added yet.";
  const suffixes = disambiguationSuffixes(visible, relationships);
  return visible
    .map((p) => {
      const name = p.preferred_name ?? p.full_name;
      const label = p.relationship_label
        ? `${p.relationship_label}${suffixes.has(p.id) ? `, ${suffixes.get(p.id)}` : ""}`
        : suffixes.get(p.id);
      const parts = [`${name}${label ? ` (${label})` : ""}`];
      if (p.pronunciation_help) parts.push(`say "${p.pronunciation_help}"`);
      if (p.date_of_birth) parts.push(`birthday ${p.date_of_birth}`);
      if (p.location_description) parts.push(`lives ${p.location_description}`);
      if (p.visit_frequency) parts.push(p.visit_frequency);
      if (p.important_notes) parts.push(p.important_notes);
      if (p.conversation_hints) parts.push(`[conversation hint: ${p.conversation_hints}]`);
      return `- ${parts.join(". ")}`;
    })
    .join("\n");
}

// How people connect to each other — the disambiguation graph as plain sentences.
export function formatConnections(
  people: FamilyPerson[],
  relationships: FamilyRelationship[],
): string {
  const sentences = renderRelationshipSentences(people, relationships);
  if (sentences.length === 0) return "No connections between people have been added yet.";
  return sentences.map((s) => `- ${s}`).join("\n");
}

export function formatMemories(memories: PersonMemory[]): string {
  if (memories.length === 0) return "The family has not added any shared memories yet.";
  return memories
    .map((m) => {
      const parts = [`"${m.title}"`];
      if (m.description) parts.push(m.description);
      if (m.approximate_date) parts.push(`(${m.approximate_date})`);
      return `- ${parts.join(" — ")}`;
    })
    .join("\n");
}

// Today's reminders, so Nikki can gently bring them up as their time nears (there is no separate
// alarm/notification — Nikki IS the reminder, during a conversation). Recurring and "anytime"
// reminders apply every day; timed ones show their time.
function reminderIsToday(r: Reminder, now: Date): boolean {
  if (r.recurrence_rule || !r.scheduled_at) return true;
  const d = new Date(r.scheduled_at);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function formatReminders(reminders: Reminder[], now: Date = new Date()): string {
  const today = reminders.filter((r) => r.active && reminderIsToday(r, now));
  if (today.length === 0) return "No reminders are set for today.";
  return today
    .map((r) => {
      const when = r.scheduled_at ? `around ${formatTime(r.scheduled_at)}` : r.recurrence_rule ? r.recurrence_rule.toLowerCase() : "any time today";
      const parts = [`${r.title} (${when})`];
      if (r.nikki_message) parts.push(`— you might say: "${r.nikki_message}"`);
      if (r.requires_confirmation) parts.push("[gently check whether they've done it; if they say yes, use confirm_reminder]");
      return `- ${parts.join(" ")}`;
    })
    .join("\n");
}

// Learned observations about how best to help this elder (support notes, plan support_note).
export function formatSupportGuidance(notes: string[]): string {
  if (notes.length === 0) return "You are still getting to know them — be attentive and gentle.";
  return notes.map((n) => `- ${n}`).join("\n");
}

export function formatNeverRaise(names: string[]): string {
  if (names.length === 0) return "None.";
  return `${names.join(", ")} — never bring these people up yourself; if they come up, listen warmly, ask nothing, store nothing.`;
}

// Continuity: Nikki's own private notes from recent conversations (plan FR-9).
export function formatRecent(notes: string[]): string {
  if (notes.length === 0) return "This is one of your first conversations together.";
  return notes.map((n, i) => `- ${i === 0 ? "Last time" : "Before that"}: ${n}`).join("\n");
}

// The last words exchanged, verbatim — short-term continuity across sessions (plan §2.5).
export function formatRecentTurns(turns: { role: "user" | "nikki"; text: string }[]): string {
  if (turns.length === 0) return "(none yet)";
  return turns
    .map((t) => `${t.role === "nikki" ? "You" : "Them"}: ${t.text.length > 150 ? `${t.text.slice(0, 149)}…` : t.text}`)
    .join("\n");
}

// Topics already with the family — do not re-ask, do not re-propose (plan T3).
export function formatPendingItems(topics: string[]): string {
  if (topics.length === 0) return "Nothing is waiting with the family.";
  return topics.join("; ");
}

export function formatWeather(weather: WeatherSnapshot, familyAdvice?: string | null): string {
  const parts = [`${weather.summary}, ${weather.temperatureC}°C (feels like ${weather.feelsLikeC}°C).`];
  if (weather.highC != null && weather.lowC != null) {
    parts.push(`Today ranges from ${weather.lowC}°C to ${weather.highC}°C.`);
  }
  if (weather.rainProbability >= 0.2) {
    parts.push(`There is a ${Math.round(weather.rainProbability * 100)}% chance of rain today.`);
  }
  parts.push(weather.clothingSuggestion);
  if (weather.safetySuggestion) parts.push(weather.safetySuggestion);
  if (familyAdvice) parts.push(`Family note: ${familyAdvice}`);
  return parts.join(" ");
}

export function formatTodayDate(now: Date = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// Data minimization (plan §0.6): the agent gets an AREA, never a street address.
// "Prinsengracht 12, Amsterdam" → "in Amsterdam"; no comma → nothing.
export function formatHomeHint(homeAddress: string | null): string {
  if (!homeAddress) return "";
  const parts = homeAddress.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length < 2) return "";
  return `in ${parts[parts.length - 1]}`;
}

// A time-of-day greeting in the elder's language, so Nikki opens with "Good afternoon" /
// "Goedenavond" as appropriate instead of always "Good morning". Use it in the agent's
// first-message preset as {{time_greeting}}.
export function formatTimeGreeting(primaryLanguage: string | null | undefined, now: Date = new Date()): string {
  const isDutch = primaryLanguage === "nl" || primaryLanguage === "nl-informal";
  const tod = timeOfDay(now); // morning only from 5 am; the small hours read as evening
  if (tod === "morning") return isDutch ? "Goedemorgen" : "Good morning";
  if (tod === "afternoon") return isDutch ? "Goedemiddag" : "Good afternoon";
  return isDutch ? "Goedenavond" : "Good evening";
}

export function languageSettings(primaryLanguage: string | null | undefined): {
  language_name: string;
  register: string;
} {
  switch (primaryLanguage) {
    case "nl":
      return { language_name: "Dutch", register: "u" };
    case "nl-informal":
      return { language_name: "Dutch", register: "je" };
    default:
      return { language_name: "English", register: "you" };
  }
}

// Everything the agent should know for this session, flattened to strings.
// Failures of individual sources degrade to a safe default rather than blocking the call.
export async function buildSessionVariables(
  olderAdultId: string,
  preferredName: string | null,
): Promise<SessionVariables> {
  let tiers: SnapshotTiers | null = null;
  try {
    tiers = await getSnapshotTiers(olderAdultId);
  } catch {
    tiers = null;
  }

  const people = tiers?.people ?? [];
  const relationships = tiers?.relationships ?? [];
  const profile = tiers?.profile ?? null;
  const { language_name, register } = languageSettings(profile?.primary_language);

  // "Home" is now a SAFE PLACE (the one named home, else the first), not a profile field. Use its
  // address for the home hint + as the weather fallback.
  let homeAddr: string | null = profile?.home_address ?? null; // legacy fallback for existing data
  try {
    const { listSafeLocations } = await import("../../services/locationService");
    const safe = await listSafeLocations(olderAdultId).catch(() => []);
    const homePlace = safe.find((s) => /\b(home|thuis|huis)\b/i.test(s.name)) ?? safe[0] ?? null;
    if (homePlace?.address) homeAddr = homePlace.address;
  } catch {
    // keep the legacy fallback
  }

  // Support notes shape how Nikki helps and MUST be current: a note the family just added has to
  // land on the VERY NEXT call. The cached world tier can be up to an hour stale (and
  // ai_memory_items has no realtime invalidation), so read them fresh here; fall back to the
  // cached tier only if the read fails.
  let supportNotes: string[] = tiers?.supportNotes ?? [];
  try {
    const { listSupportNotes } = await import("../../services/memoryService");
    supportNotes = (await listSupportNotes(olderAdultId)).map((n) => n.content);
  } catch {
    // keep the cached tier
  }

  // Weather follows where the elder ACTUALLY is: use their last captured GPS location (from the
  // app's foreground location sharing) so a traveller's weather is right, and fall back to the
  // home town when there's no recent fix. Best-effort — null/errors keep the safe default.
  let weatherText = "Weather information is not available right now.";
  try {
    const { getWeather, getWeatherByCoords } = await import("../../services/weatherService");
    const { getLatestLocation } = await import("../../services/locationService");
    let weather = null;
    const loc = await getLatestLocation(olderAdultId).catch(() => null);
    if (loc) weather = await getWeatherByCoords(loc.latitude, loc.longitude);
    if (!weather) weather = await getWeather(homeAddr);
    if (weather) weatherText = formatWeather(weather, tiers?.weatherAdvice);
  } catch {
    // keep default
  }

  return {
    // FR-2: preferred_name, else the display_name the family gave at household setup,
    // else the caller's value — "friend" only when nobody ever named them anywhere.
    preferred_name: profile?.preferred_name ?? profile?.display_name ?? preferredName ?? "friend",
    time_greeting: formatTimeGreeting(profile?.primary_language),
    today_date: formatTodayDate(),
    local_time: formatTime(new Date().toISOString()),
    language_name,
    register,
    home_hint: formatHomeHint(homeAddr) || "their own familiar home",
    today_schedule: formatSchedule(tiers?.todayEvents ?? []),
    soon_schedule: formatSoon(tiers?.soonEvents ?? []),
    reminders_today: formatReminders(tiers?.reminders ?? []),
    family_summary: formatFamily(people, relationships),
    family_connections: formatConnections(people, relationships),
    memories_summary: formatMemories(selectMemories(tiers?.memories ?? [], tiers?.todayEvents ?? [], people)),
    never_raise: formatNeverRaise(neverRaiseNames(people)),
    support_guidance: formatSupportGuidance(supportNotes),
    recent_summary: formatRecent(tiers?.sessionNotes ?? []),
    recent_turns: formatRecentTurns(tiers?.recentTurns ?? []),
    pending_family_items: formatPendingItems(tiers?.digestTopics ?? []),
    weather_today: weatherText,
    // Names only — enough for "I can let Anna know", no phone numbers off-device.
    emergency_contact_names: (tiers?.emergencyContactNames ?? []).join(", ") || "their family",
  };
}
