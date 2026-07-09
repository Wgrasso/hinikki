// src/services/chatService.ts — load + persist the older adult's chat with Nikki.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { newId } from "../data/demoDb";
import type { ChatInteraction } from "../types/database";
import type { ChatMessage, NikkiIntent, SafetyLevel } from "../types/domain";

const DEMO_CHAT_PREFIX = "hinikki.chat.";

function rowToMessages(row: ChatInteraction): ChatMessage[] {
  const out: ChatMessage[] = [];
  const base = new Date(row.created_at).getTime();
  if (row.message) out.push({ id: `${row.id}-u`, role: "user", text: row.message, createdAt: base });
  if (row.nikki_response) {
    out.push({
      id: `${row.id}-n`,
      role: "nikki",
      text: row.nikki_response,
      intent: (row.intent as NikkiIntent) ?? undefined,
      safetyLevel: row.safety_level,
      createdAt: base + 1,
    });
  }
  return out;
}

export async function loadChat(olderAdultId: string): Promise<ChatMessage[]> {
  if (!supabase) {
    try {
      const raw = await AsyncStorage.getItem(DEMO_CHAT_PREFIX + olderAdultId);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ChatMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const { data, error } = await supabase
    .from("chat_interactions")
    .select("id, older_adult_id, sender, message, nikki_response, intent, safety_level, created_at")
    .eq("older_adult_id", olderAdultId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((r) => rowToMessages(r as ChatInteraction));
}

export async function saveInteraction(
  olderAdultId: string,
  userText: string,
  nikkiText: string,
  intent: NikkiIntent,
  safety: SafetyLevel,
  priorMessages: ChatMessage[],
): Promise<ChatMessage[]> {
  const now = Date.now();
  const next: ChatMessage[] = [
    ...priorMessages,
    { id: newId("u"), role: "user", text: userText, createdAt: now },
    { id: newId("n"), role: "nikki", text: nikkiText, intent, safetyLevel: safety, createdAt: now + 1 },
  ];
  if (!supabase) {
    try {
      await AsyncStorage.setItem(DEMO_CHAT_PREFIX + olderAdultId, JSON.stringify(next.slice(-50)));
    } catch {
      // best-effort
    }
    return next;
  }
  const { error } = await supabase.from("chat_interactions").insert({
    older_adult_id: olderAdultId,
    sender: "user",
    message: userText,
    nikki_response: nikkiText,
    intent,
    safety_level: safety,
  });
  if (error) throw new Error(error.message);
  return next;
}
