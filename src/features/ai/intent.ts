// src/features/ai/intent.ts — simple, transparent keyword intent detection (MVP).
// Later swappable for a real LLM classifier. Also classifies safety level so the orchestrator
// can escalate distress before anything else.
import type { NikkiIntent, SafetyLevel } from "../../types/domain";

export type IntentResult = {
  intent: NikkiIntent;
  safety: SafetyLevel;
  query: string | null; // a candidate person/name for lookups
};

const EMERGENCY_PHRASES = [
  "i fell",
  "i've fallen",
  "ive fallen",
  "fallen",
  "cannot breathe",
  "can't breathe",
  "cant breathe",
  "chest pain",
  "cannot get up",
  "can't get up",
  "cant get up",
  "i am bleeding",
  "bleeding",
  "i am scared",
  "im scared",
  "i'm scared",
  "emergency",
];

const LOST_PHRASES = [
  "i am lost",
  "im lost",
  "i'm lost",
  "i do not know where",
  "don't know where",
  "dont know where",
  "where am i",
  "get home",
  "find my way",
  "help me get home",
];

const RELATION_WORDS = ["wife", "husband", "son", "daughter", "grandson", "granddaughter", "brother", "sister", "mother", "father", "grandchildren", "children"];

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

export function detectIntent(raw: string): IntentResult {
  const text = raw.trim().toLowerCase();

  if (includesAny(text, EMERGENCY_PHRASES) || text === "i need help" || text === "help") {
    return { intent: "emergency", safety: "emergency", query: null };
  }
  if (includesAny(text, LOST_PHRASES)) {
    return { intent: "lost", safety: "caution", query: null };
  }
  if (includesAny(text, ["weather", "rain", "umbrella", "coat", "cold outside", "hot outside", "wear today"])) {
    return { intent: "weather_question", safety: "normal", query: null };
  }
  if (includesAny(text, ["medication", "medicine", "pills", "pill", "tablets"])) {
    return { intent: "medication_reminder", safety: "normal", query: null };
  }
  if (includesAny(text, ["today", "doing today", "appointment", "schedule", "my plans", "coming today", "what's on", "whats on"])) {
    return { intent: "today_schedule", safety: "normal", query: extractName(raw) };
  }
  if (includesAny(text, RELATION_WORDS) && includesAny(text, ["who", "what", "where", "'s ", "s wife", "s husband"])) {
    return { intent: "family_tree_question", safety: "normal", query: extractName(raw) };
  }
  if (includesAny(text, ["who is", "show me", "tell me about", "where does", "call "])) {
    return { intent: "person_lookup", safety: "normal", query: extractName(raw) };
  }
  if (text.length > 0) {
    return { intent: "general_companion", safety: "normal", query: extractName(raw) };
  }
  return { intent: "unknown", safety: "normal", query: null };
}

// Pull a likely capitalised first name out of the raw (case-preserved) message.
export function extractName(raw: string): string | null {
  const stop = new Set([
    "Who", "What", "Where", "When", "Show", "Tell", "Call", "Is", "Me", "My", "The", "Nikki", "I", "A",
    "About", "Does", "Do", "Live", "Coming", "Today", "Family",
  ]);
  const match = raw.match(/[A-Z][a-z]+/g) ?? [];
  for (const word of match) {
    if (!stop.has(word)) return word;
  }
  return null;
}
