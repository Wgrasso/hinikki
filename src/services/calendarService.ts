// src/services/calendarService.ts — HiNikki calendar events (live Supabase or demo store).
import { supabase } from "../lib/supabase";
import { getDemoState, mutateDemo, newId } from "../data/demoDb";
import type { CalendarEvent } from "../types/database";
import { isSameDay } from "../utils/format";

const EVENT_COLUMNS =
  "id, older_adult_id, title, event_type, start_at, end_at, location_name, location_address, what_to_bring, transport_notes, companion, announce_lead_minutes, nikki_before_event_message, calming_explanation, user_friendly_summary, priority_level, may_cause_stress, completion_status";

export async function listEvents(olderAdultId: string): Promise<CalendarEvent[]> {
  if (!supabase) {
    const s = await getDemoState();
    return [...s.events]
      .filter((e) => e.older_adult_id === olderAdultId)
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
  }
  const { data, error } = await supabase
    .from("calendar_events")
    .select(EVENT_COLUMNS)
    .eq("older_adult_id", olderAdultId)
    .order("start_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarEvent[];
}

// Just today's events. This is on the elder's hot paths (home screen, next-event, the voice
// context snapshot), so query the single day directly instead of pulling the whole event history
// and filtering client-side — the (older_adult_id, start_at) index makes the bounded range cheap.
export async function listTodayEvents(olderAdultId: string): Promise<CalendarEvent[]> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (!supabase) {
    const s = await getDemoState();
    return [...s.events]
      .filter((e) => e.older_adult_id === olderAdultId && isSameDay(e.start_at, dayStart))
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
  }
  const { data, error } = await supabase
    .from("calendar_events")
    .select(EVENT_COLUMNS)
    .eq("older_adult_id", olderAdultId)
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString())
    .order("start_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarEvent[];
}

// Events starting between now and `hours` from now (default 48 h) — the context snapshot window.
export async function listUpcomingEvents(olderAdultId: string, hours = 48): Promise<CalendarEvent[]> {
  const now = new Date();
  const until = new Date(now.getTime() + hours * 60 * 60 * 1000);
  if (!supabase) {
    const s = await getDemoState();
    return [...s.events]
      .filter((e) => {
        const start = new Date(e.start_at).getTime();
        return e.older_adult_id === olderAdultId && start >= now.getTime() && start <= until.getTime();
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
  }
  const { data, error } = await supabase
    .from("calendar_events")
    .select(EVENT_COLUMNS)
    .eq("older_adult_id", olderAdultId)
    .gte("start_at", now.toISOString())
    .lte("start_at", until.toISOString())
    .order("start_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarEvent[];
}

export async function getNextEvent(olderAdultId: string): Promise<CalendarEvent | null> {
  const today = await listTodayEvents(olderAdultId);
  const now = Date.now();
  const upcoming = today.filter((e) => new Date(e.start_at).getTime() >= now - 60 * 60 * 1000);
  return (upcoming[0] ?? today[0]) ?? null;
}

export type NewEvent = {
  title: string;
  start_at: string;
  end_at?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  what_to_bring?: string | null;
  transport_notes?: string | null;
  companion?: string | null;
  announce_lead_minutes?: number | null;
  nikki_before_event_message?: string | null;
  user_friendly_summary?: string | null;
  priority_level?: "low" | "normal" | "high";
};

export async function createEvent(olderAdultId: string, input: NewEvent): Promise<CalendarEvent> {
  if (!supabase) {
    const event: CalendarEvent = {
      id: newId("e"),
      older_adult_id: olderAdultId,
      title: input.title,
      event_type: null,
      start_at: input.start_at,
      end_at: input.end_at ?? null,
      location_name: input.location_name ?? null,
      location_address: input.location_address ?? null,
      what_to_bring: input.what_to_bring ?? null,
      transport_notes: input.transport_notes ?? null,
      companion: input.companion ?? null,
      announce_lead_minutes: input.announce_lead_minutes ?? null,
      nikki_before_event_message: input.nikki_before_event_message ?? null,
      calming_explanation: null,
      user_friendly_summary: input.user_friendly_summary ?? input.title,
      priority_level: input.priority_level ?? "normal",
      may_cause_stress: false,
      completion_status: "scheduled",
    };
    await mutateDemo((s) => {
      s.events.push(event);
    });
    return event;
  }
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ older_adult_id: olderAdultId, ...input })
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as CalendarEvent;
}

export async function updateEvent(eventId: string, patch: Partial<NewEvent>): Promise<void> {
  if (!supabase) {
    await mutateDemo((s) => {
      const i = s.events.findIndex((e) => e.id === eventId);
      if (i >= 0) s.events[i] = { ...s.events[i], ...patch };
    });
    return;
  }
  const { error } = await supabase.from("calendar_events").update(patch).eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function deleteEvent(eventId: string): Promise<void> {
  if (!supabase) {
    await mutateDemo((s) => {
      s.events = s.events.filter((e) => e.id !== eventId);
    });
    return;
  }
  const { error } = await supabase.from("calendar_events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);
}
