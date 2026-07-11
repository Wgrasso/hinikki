// src/services/conversationService.ts — conversation persistence for the voice era (plan §2.5).
// The old text-chat layer is gone; this is the sole writer of chat_interactions now.
// Rows: voice turns (sender user|nikki, intent 'voice_turn') and Nikki's private
// end-of-session notes (sender 'nikki', intent 'session_note'). RLS is self-only
// (schema.sql "own chat") — admins can never read any of this.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import type { ChatInteraction } from "../types/database";

const TURN_INTENT = "voice_turn";
const NOTE_INTENT = "session_note";
const DEMO_KEY_PREFIX = "hinikki.conversation.";
const DEMO_MAX_ROWS = 100;

export type ConversationTurn = { role: "user" | "nikki"; text: string; at: string };

type DemoRow = { sender: "user" | "nikki"; message: string; intent: string; created_at: string };

async function demoAppend(olderAdultId: string, row: DemoRow): Promise<void> {
  try {
    const key = DEMO_KEY_PREFIX + olderAdultId;
    const raw = await AsyncStorage.getItem(key);
    const rows = raw ? (JSON.parse(raw) as DemoRow[]) : [];
    rows.push(row);
    await AsyncStorage.setItem(key, JSON.stringify(rows.slice(-DEMO_MAX_ROWS)));
  } catch {
    // best-effort; losing a demo row is fine
  }
}

async function demoRead(olderAdultId: string): Promise<DemoRow[]> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_KEY_PREFIX + olderAdultId);
    const rows = raw ? (JSON.parse(raw) as DemoRow[]) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// Persist one spoken turn (either side). Fire-and-forget from the session hook:
// a failed insert must never interrupt the conversation (NFR-3).
export async function recordTurn(olderAdultId: string, role: "user" | "nikki", text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return;
  if (!supabase) {
    await demoAppend(olderAdultId, {
      sender: role,
      message: trimmed,
      intent: TURN_INTENT,
      created_at: new Date().toISOString(),
    });
    return;
  }
  const { error } = await supabase.from("chat_interactions").insert({
    older_adult_id: olderAdultId,
    sender: role,
    message: trimmed,
    intent: TURN_INTENT,
    safety_level: "normal",
  });
  if (error) throw new Error(error.message);
}

// Nikki's private continuity note (2-3 sentences), written by the save_session_note tool.
export async function saveSessionNote(olderAdultId: string, note: string): Promise<void> {
  const trimmed = note.trim();
  if (trimmed.length === 0) return;
  if (!supabase) {
    await demoAppend(olderAdultId, {
      sender: "nikki",
      message: trimmed,
      intent: NOTE_INTENT,
      created_at: new Date().toISOString(),
    });
    return;
  }
  const { error } = await supabase.from("chat_interactions").insert({
    older_adult_id: olderAdultId,
    sender: "nikki",
    message: trimmed,
    intent: NOTE_INTENT,
    safety_level: "normal",
  });
  if (error) throw new Error(error.message);
}

// Retention policy: raw verbatim voice turns are privacy-sensitive and would otherwise
// accumulate forever. Delete this older adult's 'voice_turn' rows past the cutoff. Session
// notes are durable continuity memory and are NEVER pruned. Date.now()/new Date() for the
// cutoff is fine here (app runtime, unlike workflow scripts that must use a fixed clock).
export async function pruneOldTurns(olderAdultId: string, olderThanDays = 30): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  if (!supabase) {
    // Demo: drop voice_turn entries older than the cutoff; best-effort.
    try {
      const key = DEMO_KEY_PREFIX + olderAdultId;
      const rows = await demoRead(olderAdultId);
      const kept = rows.filter((r) => !(r.intent === TURN_INTENT && r.created_at < cutoff));
      if (kept.length !== rows.length) await AsyncStorage.setItem(key, JSON.stringify(kept));
    } catch {
      // best-effort; a failed prune is harmless
    }
    return;
  }
  const { error } = await supabase
    .from("chat_interactions")
    .delete()
    .eq("older_adult_id", olderAdultId)
    .eq("intent", TURN_INTENT)
    .lt("created_at", cutoff);
  if (error) throw new Error(error.message);
}

// Newest verbatim turns, oldest-first for rendering into context. NULL-safe intent
// filter: `.neq` alone would also hide NULL-intent rows (three-valued logic).
export async function listRecentTurns(olderAdultId: string, limit = 12): Promise<ConversationTurn[]> {
  // Opportunistic self-cleanup: this runs at session start, so prune stale voice turns
  // here without awaiting — the retention delete must never slow the context read.
  pruneOldTurns(olderAdultId).catch(() => undefined);
  if (!supabase) {
    const rows = await demoRead(olderAdultId);
    return rows
      .filter((r) => r.intent !== NOTE_INTENT)
      .slice(-limit)
      .map((r) => ({ role: r.sender, text: r.message, at: r.created_at }));
  }
  const { data, error } = await supabase
    .from("chat_interactions")
    .select("sender, message, intent, created_at")
    .eq("older_adult_id", olderAdultId)
    .or(`intent.is.null,intent.neq.${NOTE_INTENT}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .reverse()
    .filter((r) => typeof r.message === "string" && r.message.length > 0)
    .map((r) => ({
      role: (r.sender === "nikki" ? "nikki" : "user") as "user" | "nikki",
      text: r.message as string,
      at: r.created_at as string,
    }));
}

// The last few private session notes, newest first — feeds the [RECENT] context.
export async function listSessionNotes(olderAdultId: string, limit = 5): Promise<string[]> {
  if (!supabase) {
    const rows = await demoRead(olderAdultId);
    return rows
      .filter((r) => r.intent === NOTE_INTENT)
      .slice(-limit)
      .reverse()
      .map((r) => r.message);
  }
  const { data, error } = await supabase
    .from("chat_interactions")
    .select("message, created_at")
    .eq("older_adult_id", olderAdultId)
    .eq("intent", NOTE_INTENT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => (typeof r.message === "string" ? r.message : ""))
    .filter((m) => m.length > 0);
}

export type { ChatInteraction };
