// src/features/voice/snapshot.ts — the tiered context cache behind buildSessionVariables
// (plan §2.2). Per-turn latency is the product: a voice session must start from CACHE, never
// from a burst of network calls. Tiers refresh independently — identity hourly, the day's
// schedule every 15 minutes, the people/memories world hourly, continuity per session — and
// a realtime event (src/features/sync/liveChannel.ts) marks the matching tier dirty so the
// next session rebuilds only what changed.
// Also home of the PURE renderers (relationship sentences, disambiguation, memory ranking)
// so they can be unit-tested without any I/O.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { listTodayEvents, listUpcomingEvents } from "../../services/calendarService";
import { listRecentTurns, listSessionNotes, type ConversationTurn } from "../../services/conversationService";
import { listEmergencyContacts } from "../../services/emergencyService";
import { listMemories, listSupportNotes } from "../../services/memoryService";
import { listPeople, listRelationships } from "../../services/peopleService";
import { getOlderAdult } from "../../services/profileService";
import { listDigestTopics } from "../../services/proposalService";
import { listReminders } from "../../services/reminderService";
import { getWeatherAdvice } from "../../services/weatherService";
import type {
  CalendarEvent,
  FamilyPerson,
  FamilyRelationship,
  OlderAdultProfile,
  PersonMemory,
  Reminder,
} from "../../types/database";
import type { LiveTable } from "../sync/liveChannel";

export type SnapshotTiers = {
  profile: OlderAdultProfile | null;
  todayEvents: CalendarEvent[];
  soonEvents: CalendarEvent[]; // upcoming beyond today, within 48h
  reminders: Reminder[];
  people: FamilyPerson[];
  relationships: FamilyRelationship[];
  memories: PersonMemory[];
  supportNotes: string[];
  emergencyContactNames: string[];
  weatherAdvice: string | null;
  sessionNotes: string[];
  recentTurns: ConversationTurn[];
  digestTopics: string[];
};

type TierName = "identity" | "day" | "world" | "continuity";
const TIER_TTL_MS: Record<TierName, number> = {
  identity: 60 * 60 * 1000,
  day: 15 * 60 * 1000,
  world: 60 * 60 * 1000,
  // Short, not zero: tools call getSnapshotTiers mid-conversation and must not pay a
  // network roundtrip per tool call; a fresh session start (>60s later) still rebuilds.
  continuity: 60 * 1000,
};

const TABLE_TO_TIER: Partial<Record<Exclude<LiveTable, "*">, TierName>> = {
  older_adult_profiles: "identity",
  calendar_events: "day",
  reminders: "day",
  weather_preferences: "day",
  family_people: "world",
  family_relationships: "world",
  person_memories: "world",
  // ai_memory_items (support_note) also lives in the world tier, but has no realtime wiring —
  // the 60-min world TTL rebuilds it, which is fine for these slow-changing observations.
  nikki_proposals: "continuity",
};

type CacheEntry = {
  tiers: SnapshotTiers;
  builtAt: Record<TierName, number>;
  dirty: Set<TierName>;
};

const cache = new Map<string, CacheEntry>();
const storageKey = (id: string) => `hinikki.snapshot.${id}`;

function emptyTiers(): SnapshotTiers {
  return {
    profile: null,
    todayEvents: [],
    soonEvents: [],
    reminders: [],
    people: [],
    relationships: [],
    memories: [],
    supportNotes: [],
    emergencyContactNames: [],
    weatherAdvice: null,
    sessionNotes: [],
    recentTurns: [],
    digestTopics: [],
  };
}

// Called by the liveChannel listener: a change on `table` marks its tier stale.
export function markSnapshotDirty(olderAdultId: string, table: LiveTable): void {
  const entry = cache.get(olderAdultId);
  if (!entry) return;
  if (table === "*") {
    entry.dirty.add("identity").add("day").add("world").add("continuity");
    return;
  }
  const tier = TABLE_TO_TIER[table];
  if (tier) entry.dirty.add(tier);
}

// Forget everything cached for this elder (RAM + disk). Called on sign-out so the next
// person paired on this phone never inherits another family's context.
export async function clearSnapshot(olderAdultId: string): Promise<void> {
  cache.delete(olderAdultId);
  try {
    await AsyncStorage.removeItem(storageKey(olderAdultId));
  } catch {
    // cache persistence is best-effort
  }
}

// Build/refresh the structured tiers. Every source is fail-soft: a broken tier keeps its
// previous (stale) data rather than blocking the session (NFR-3).
export async function getSnapshotTiers(olderAdultId: string): Promise<SnapshotTiers> {
  let entry = cache.get(olderAdultId);
  if (!entry) {
    entry = { tiers: await loadPersisted(olderAdultId), builtAt: { identity: 0, day: 0, world: 0, continuity: 0 }, dirty: new Set() };
    cache.set(olderAdultId, entry);
  }

  const now = Date.now();
  const stale = (t: TierName) => entry!.dirty.has(t) || now - entry!.builtAt[t] >= TIER_TTL_MS[t];

  const jobs: Promise<void>[] = [];
  if (stale("identity")) {
    jobs.push(
      getOlderAdult(olderAdultId)
        .then((profile) => {
          entry!.tiers.profile = profile;
          entry!.builtAt.identity = now;
          entry!.dirty.delete("identity");
        })
        .catch(() => undefined),
    );
  }
  if (stale("day")) {
    jobs.push(
      Promise.all([
        listTodayEvents(olderAdultId).catch(() => entry!.tiers.todayEvents),
        listUpcomingEvents(olderAdultId, 48).catch(() => [] as CalendarEvent[]),
        listReminders(olderAdultId).catch(() => entry!.tiers.reminders),
        getWeatherAdvice(olderAdultId).catch(() => entry!.tiers.weatherAdvice ?? ""),
      ]).then(([today, upcoming, reminders, advice]) => {
        const todayIds = new Set(today.map((e) => e.id));
        entry!.tiers.todayEvents = today;
        entry!.tiers.soonEvents = upcoming.filter((e) => !todayIds.has(e.id));
        entry!.tiers.reminders = reminders;
        entry!.tiers.weatherAdvice = advice && advice.length > 0 ? advice : null;
        entry!.builtAt.day = now;
        entry!.dirty.delete("day");
      }),
    );
  }
  if (stale("world")) {
    jobs.push(
      Promise.all([
        listPeople(olderAdultId).catch(() => entry!.tiers.people),
        listRelationships(olderAdultId).catch(() => entry!.tiers.relationships),
        listMemories(olderAdultId).catch(() => entry!.tiers.memories),
        listEmergencyContacts(olderAdultId).catch(() => [] as { name: string }[]),
        listSupportNotes(olderAdultId).catch(() => entry!.tiers.supportNotes.map((content) => ({ id: "", content }))),
      ]).then(([people, relationships, memories, contacts, supportNotes]) => {
        entry!.tiers.people = people;
        entry!.tiers.relationships = relationships;
        entry!.tiers.memories = memories;
        entry!.tiers.emergencyContactNames = contacts.map((c) => c.name);
        entry!.tiers.supportNotes = supportNotes.map((n) => n.content);
        entry!.builtAt.world = now;
        entry!.dirty.delete("world");
      }),
    );
  }
  if (stale("continuity")) {
    jobs.push(
      Promise.all([
        listSessionNotes(olderAdultId, 5).catch(() => entry!.tiers.sessionNotes),
        listRecentTurns(olderAdultId, 12).catch(() => entry!.tiers.recentTurns),
        listDigestTopics(olderAdultId).catch(() => entry!.tiers.digestTopics),
      ]).then(([notes, turns, digest]) => {
        entry!.tiers.sessionNotes = notes;
        entry!.tiers.recentTurns = turns;
        entry!.tiers.digestTopics = digest;
        entry!.builtAt.continuity = now;
        entry!.dirty.delete("continuity");
      }),
    );
  }

  await Promise.all(jobs);
  void persist(olderAdultId, entry.tiers);
  return entry.tiers;
}

async function loadPersisted(olderAdultId: string): Promise<SnapshotTiers> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(olderAdultId));
    if (!raw) return emptyTiers();
    const parsed = JSON.parse(raw) as SnapshotTiers;
    return { ...emptyTiers(), ...parsed };
  } catch {
    return emptyTiers();
  }
}

async function persist(olderAdultId: string, tiers: SnapshotTiers): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(olderAdultId), JSON.stringify(tiers));
  } catch {
    // cache persistence is best-effort
  }
}

// ─── pure renderers (unit-tested; no I/O) ────────────────────────────────────

const DIRECTIONAL_LABELS: Record<string, (a: string, b: string) => string> = {
  child_of: (a, b) => `${a} is ${b}'s child`,
  carer_of: (a, b) => `${a} helps care for ${b}`,
};
const SYMMETRIC_LABELS: Record<string, (a: string, b: string) => string> = {
  spouse_of: (a, b) => `${a} and ${b} are married`,
  sibling_of: (a, b) => `${a} and ${b} are siblings`,
  friend_of: (a, b) => `${a} and ${b} are friends`,
  neighbour_of: (a, b) => `${a} and ${b} are neighbours`,
};

function displayName(p: FamilyPerson): string {
  return p.preferred_name ?? p.full_name;
}

// One human sentence per edge, e.g. "Tom is Marieke's child".
export function renderRelationshipSentences(
  people: FamilyPerson[],
  relationships: FamilyRelationship[],
): string[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const sentences: string[] = [];
  for (const edge of relationships) {
    const a = byId.get(edge.person_a_id);
    const b = byId.get(edge.person_b_id);
    if (!a || !b || !a.can_nikki_mention || !b.can_nikki_mention) continue;
    const directional = DIRECTIONAL_LABELS[edge.relationship_type];
    const symmetric = SYMMETRIC_LABELS[edge.relationship_type];
    if (directional) sentences.push(directional(displayName(a), displayName(b)));
    else if (symmetric) sentences.push(symmetric(displayName(a), displayName(b)));
  }
  return sentences;
}

// The two-grandsons rule (plan §2.4/FR-4): when several people share a relationship label,
// each gets its strongest disambiguator appended — child_of parent first, else where they
// live, else how often they visit. Returns personId -> suffix ("Marieke's son").
export function disambiguationSuffixes(
  people: FamilyPerson[],
  relationships: FamilyRelationship[],
): Map<string, string> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const byLabel = new Map<string, FamilyPerson[]>();
  for (const p of people) {
    const label = (p.relationship_label ?? "").trim().toLowerCase();
    if (!label) continue;
    byLabel.set(label, [...(byLabel.get(label) ?? []), p]);
  }
  const out = new Map<string, string>();
  for (const group of byLabel.values()) {
    if (group.length < 2) continue;
    for (const p of group) {
      const parentEdge = relationships.find(
        (r) => r.relationship_type === "child_of" && r.person_a_id === p.id,
      );
      const parent = parentEdge ? byId.get(parentEdge.person_b_id) : undefined;
      if (parent) {
        const childWord = /grandson|son\b/i.test(p.relationship_label ?? "")
          ? "son"
          : /granddaughter|daughter/i.test(p.relationship_label ?? "")
            ? "daughter"
            : "child";
        out.set(p.id, `${displayName(parent)}'s ${childWord}`);
      } else if (p.location_description) {
        out.set(p.id, `the one who lives ${p.location_description}`);
      } else if (p.visit_frequency) {
        out.set(p.id, `the one who visits ${p.visit_frequency}`);
      }
    }
  }
  return out;
}

// Relevance-ranked memory selection (plan §2.3, Rev 3.1): memories about people in today's
// picture first, then anything else, capped. Storage is never capped — this is per-session
// rendering only.
export function selectMemories(
  memories: PersonMemory[],
  todayEvents: CalendarEvent[],
  people: FamilyPerson[],
  cap = 5,
): PersonMemory[] {
  const mentionable = memories.filter((m) => m.can_nikki_mention);
  const companionNames = new Set(
    todayEvents
      .map((e) => (e.companion ?? "").trim().toLowerCase())
      .filter((c) => c.length > 0),
  );
  const todayPersonIds = new Set(
    people
      .filter((p) => companionNames.has(displayName(p).toLowerCase()) || companionNames.has(p.full_name.toLowerCase()))
      .map((p) => p.id),
  );
  const score = (m: PersonMemory): number => (m.person_id && todayPersonIds.has(m.person_id) ? 0 : 1);
  return [...mentionable].sort((a, b) => score(a) - score(b)).slice(0, cap);
}

// Names Nikki must never bring up herself (plan §3 [NEVER RAISE]): suppressed people,
// names only — enough for the prompt rule and for lookup_person to treat them as known.
export function neverRaiseNames(people: FamilyPerson[]): string[] {
  return people.filter((p) => !p.can_nikki_mention).map((p) => displayName(p));
}
