// src/data/demoDb.ts — a small in-memory store used ONLY when Supabase is not configured,
// so the app is fully usable in Expo Go / web preview. Mutations persist to AsyncStorage so
// they survive a restart, mirroring the real backend's durability.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORE_KEYS } from "../lib/constants";
import type {
  CalendarEvent,
  EmergencyContact,
  EmergencyEvent,
  FamilyPerson,
  FamilyRelationship,
  LocationUpdate,
  OlderAdultProfile,
  Reminder,
  SafeLocation,
} from "../types/database";
import {
  buildDemoEvents,
  buildDemoReminders,
  demoEmergencyContacts,
  demoOlderAdult,
  demoPeople,
  demoRelationships,
  demoSafeLocations,
} from "./demo";

export type DemoState = {
  olderAdult: OlderAdultProfile;
  people: FamilyPerson[];
  relationships: FamilyRelationship[];
  events: CalendarEvent[];
  reminders: Reminder[];
  safeLocations: SafeLocation[];
  emergencyContacts: EmergencyContact[];
  locationUpdates: LocationUpdate[];
  emergencyEvents: EmergencyEvent[];
};

function seed(): DemoState {
  return {
    olderAdult: { ...demoOlderAdult },
    people: demoPeople.map((p) => ({ ...p })),
    relationships: demoRelationships.map((r) => ({ ...r })),
    events: buildDemoEvents(),
    reminders: buildDemoReminders(),
    safeLocations: demoSafeLocations.map((s) => ({ ...s })),
    emergencyContacts: demoEmergencyContacts.map((c) => ({ ...c })),
    locationUpdates: [],
    emergencyEvents: [],
  };
}

let state: DemoState | null = null;

async function persist(): Promise<void> {
  if (!state) return;
  try {
    // Events/reminders carry today's date; persist only the user-mutable collections.
    const snapshot = {
      people: state.people,
      relationships: state.relationships,
      safeLocations: state.safeLocations,
      emergencyContacts: state.emergencyContacts,
      locationUpdates: state.locationUpdates.slice(-20),
      emergencyEvents: state.emergencyEvents.slice(-20),
    };
    await AsyncStorage.setItem(STORE_KEYS.demoState, JSON.stringify(snapshot));
  } catch {
    // best-effort
  }
}

export async function getDemoState(): Promise<DemoState> {
  if (state) return state;
  const fresh = seed();
  try {
    const raw = await AsyncStorage.getItem(STORE_KEYS.demoState);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoState>;
      if (Array.isArray(parsed.people)) fresh.people = parsed.people;
      if (Array.isArray(parsed.relationships)) fresh.relationships = parsed.relationships;
      if (Array.isArray(parsed.safeLocations)) fresh.safeLocations = parsed.safeLocations;
      if (Array.isArray(parsed.emergencyContacts)) fresh.emergencyContacts = parsed.emergencyContacts;
      if (Array.isArray(parsed.locationUpdates)) fresh.locationUpdates = parsed.locationUpdates;
      if (Array.isArray(parsed.emergencyEvents)) fresh.emergencyEvents = parsed.emergencyEvents;
    }
  } catch {
    // ignore corrupt cache; fall back to fresh seed
  }
  state = fresh;
  return state;
}

export async function mutateDemo(fn: (s: DemoState) => void): Promise<void> {
  const s = await getDemoState();
  fn(s);
  await persist();
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
