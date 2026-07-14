// src/features/sync/liveChannel.ts — one shared realtime channel per older adult (plan §5.3).
// Payloads are INVALIDATION SIGNALS ONLY: we discard the row data and let screens refetch
// through their explicit column lists (so subscribed events can never smuggle columns like
// admin_only_notes into the app). DELETE events are not filterable and not RLS-scoped —
// the old record carries only the PK — so a coarse unfiltered DELETE listener treats any
// delete on a watched table as "everything may be stale".
// person_photos has no older_adult_id column: its invalidation rides the parent
// family_people row, which uploadPersonPhoto touches after a photo lands.
import { supabase } from "../../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Tables watched with a per-older-adult filter (all have older_adult_id except
// older_adult_profiles, whose PK is the older adult id itself).
const FILTERED_TABLES = [
  "nikki_proposals",
  "family_people",
  "calendar_events",
  "reminders",
  "person_memories",
  "family_relationships",
  "emergency_events",
  "emergency_contacts",
  "safe_locations",
  "weather_preferences",
] as const;

export type LiveTable = (typeof FILTERED_TABLES)[number] | "older_adult_profiles" | "*";
export type LiveListener = (table: LiveTable) => void;

type Entry = { channel: RealtimeChannel | null; listeners: Set<LiveListener>; refs: number };
const entries = new Map<string, Entry>();

// Subscribe to changes for one older adult. Returns an unsubscribe function.
// Ref-counted: many screens share a single websocket channel per older adult.
export function subscribeLive(olderAdultId: string, listener: LiveListener): () => void {
  let entry = entries.get(olderAdultId);
  if (!entry) {
    entry = { channel: null, listeners: new Set(), refs: 0 };
    entries.set(olderAdultId, entry);
    entry.channel = openChannel(olderAdultId, entry);
  }
  entry.listeners.add(listener);
  entry.refs += 1;

  let unsubscribed = false;
  return () => {
    if (unsubscribed) return; // idempotent: double-cleanup must not corrupt the refcount
    unsubscribed = true;
    entry.listeners.delete(listener);
    entry.refs -= 1;
    if (entry.refs <= 0 && entries.get(olderAdultId) === entry) {
      if (entry.channel && supabase) void supabase.removeChannel(entry.channel);
      entries.delete(olderAdultId);
    }
  };
}

function notify(entry: Entry, table: LiveTable): void {
  for (const l of entry.listeners) {
    try {
      l(table);
    } catch {
      // a broken listener must not break the channel
    }
  }
}

function openChannel(olderAdultId: string, entry: Entry): RealtimeChannel | null {
  if (!supabase) return null; // demo mode: focus-refetch is the freshness floor
  let channel = supabase.channel(`oa-${olderAdultId}`);

  for (const table of FILTERED_TABLES) {
    for (const event of ["INSERT", "UPDATE"] as const) {
      channel = channel.on(
        "postgres_changes",
        { event, schema: "public", table, filter: `older_adult_id=eq.${olderAdultId}` },
        () => notify(entry, table),
      );
    }
  }
  // older_adult_profiles: the PK IS the older adult id.
  for (const event of ["INSERT", "UPDATE"] as const) {
    channel = channel.on(
      "postgres_changes",
      { event, schema: "public", table: "older_adult_profiles", filter: `id=eq.${olderAdultId}` },
      () => notify(entry, "older_adult_profiles"),
    );
  }
  // Coarse DELETE listeners: payload ignored, everything marked stale.
  for (const table of [...FILTERED_TABLES, "older_adult_profiles"]) {
    channel = channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table },
      () => notify(entry, "*"),
    );
  }

  channel.subscribe();
  return channel;
}
