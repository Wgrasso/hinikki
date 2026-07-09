// src/features/ai/context.ts — the seven context builders.
// Each returns a SMALL, structured slice (never a raw DB dump) so the AI provider gets only what
// the current intent needs.
import { listTodayEvents } from "../../services/calendarService";
import { listEmergencyContacts } from "../../services/emergencyService";
import { getLatestLocation } from "../../services/locationService";
import { listPeople, listRelationships } from "../../services/peopleService";
import { listReminders } from "../../services/reminderService";
import { getWeather } from "../../services/weatherService";
import type { FamilyPerson } from "../../types/database";
import type { NikkiContext, NikkiIntent } from "../../types/domain";

export async function buildTodayContext(olderAdultId: string): Promise<NikkiContext["today"]> {
  const [events, people] = await Promise.all([
    listTodayEvents(olderAdultId),
    listPeople(olderAdultId),
  ]);
  return { events, people };
}

function findPerson(people: FamilyPerson[], query: string | null): FamilyPerson | null {
  if (!query) return null;
  const q = query.toLowerCase();
  return (
    people.find((p) => (p.preferred_name ?? "").toLowerCase() === q) ??
    people.find((p) => p.full_name.toLowerCase().includes(q)) ??
    people.find((p) => (p.relationship_label ?? "").toLowerCase().includes(q)) ??
    null
  );
}

export async function buildPeopleContext(
  olderAdultId: string,
  query: string | null,
): Promise<{ match: FamilyPerson | null; people: FamilyPerson[] }> {
  const people = (await listPeople(olderAdultId)).filter((p) => p.can_nikki_mention);
  return { match: findPerson(people, query), people };
}

export async function buildFamilyTreeContext(
  olderAdultId: string,
  query: string | null,
): Promise<{ match: FamilyPerson | null; relationOf: string | null; people: FamilyPerson[] }> {
  const [people, relationships] = await Promise.all([
    listPeople(olderAdultId),
    listRelationships(olderAdultId),
  ]);
  const visible = people.filter((p) => p.can_nikki_mention);
  const match = findPerson(visible, query);
  let relationOf: string | null = null;
  if (match) {
    const link = relationships.find((r) => r.person_a_id === match.id || r.person_b_id === match.id);
    if (link) {
      const otherId = link.person_a_id === match.id ? link.person_b_id : link.person_a_id;
      relationOf = visible.find((p) => p.id === otherId)?.preferred_name ?? null;
    }
  }
  return { match, relationOf, people: visible };
}

export async function buildWeatherContext(olderAdultId: string): Promise<NikkiContext["weather"]> {
  return getWeather(olderAdultId);
}

export async function buildReminderContext(olderAdultId: string): Promise<NikkiContext["reminders"]> {
  return listReminders(olderAdultId);
}

export async function buildLocationContext(olderAdultId: string): Promise<NikkiContext["location"]> {
  const latest = await getLatestLocation(olderAdultId);
  return {
    hasRecent: Boolean(latest),
    lastSeenLabel: latest ? new Date(latest.created_at).toLocaleTimeString() : null,
  };
}

export async function buildEmergencyContext(olderAdultId: string): Promise<NikkiContext["emergency"]> {
  const contacts = await listEmergencyContacts(olderAdultId);
  return { contacts: contacts.map((c) => ({ name: c.name, phone: c.phone })) };
}

// Assemble exactly the context the current intent needs.
export async function buildContext(
  intent: NikkiIntent,
  olderAdultId: string,
  preferredName: string | null,
  query: string | null,
): Promise<NikkiContext> {
  const ctx: NikkiContext = { intent, preferredName };
  switch (intent) {
    case "today_schedule":
      ctx.today = await buildTodayContext(olderAdultId);
      break;
    case "person_lookup": {
      const r = await buildPeopleContext(olderAdultId, query);
      ctx.person = { match: r.match };
      ctx.people = r.people;
      break;
    }
    case "family_tree_question": {
      const r = await buildFamilyTreeContext(olderAdultId, query);
      ctx.person = { match: r.match, relationOf: r.relationOf };
      ctx.people = r.people;
      break;
    }
    case "weather_question":
      ctx.weather = await buildWeatherContext(olderAdultId);
      break;
    case "medication_reminder":
      ctx.reminders = await buildReminderContext(olderAdultId);
      break;
    case "lost":
      ctx.location = await buildLocationContext(olderAdultId);
      ctx.emergency = await buildEmergencyContext(olderAdultId);
      break;
    case "emergency":
      ctx.emergency = await buildEmergencyContext(olderAdultId);
      ctx.location = await buildLocationContext(olderAdultId);
      break;
    default: {
      const r = await buildPeopleContext(olderAdultId, query);
      ctx.person = { match: r.match };
      ctx.people = r.people;
      ctx.today = await buildTodayContext(olderAdultId);
    }
  }
  return ctx;
}
