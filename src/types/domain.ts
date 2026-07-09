// src/types/domain.ts — app-level domain shapes the UI and AI layer reason over.
import type { CalendarEvent, FamilyPerson, Reminder } from "./database";

export type ChatRole = "user" | "nikki";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  intent?: NikkiIntent;
  safetyLevel?: SafetyLevel;
  createdAt: number;
};

export type SafetyLevel = "normal" | "caution" | "emergency";

export type NikkiIntent =
  | "today_schedule"
  | "person_lookup"
  | "family_tree_question"
  | "weather_question"
  | "lost"
  | "emergency"
  | "medication_reminder"
  | "general_companion"
  | "unknown";

// A small, structured context object — never a raw DB dump — handed to the AI provider.
export type NikkiContext = {
  intent: NikkiIntent;
  preferredName: string | null;
  today?: { events: CalendarEvent[]; people: FamilyPerson[] };
  person?: { match: FamilyPerson | null; relationOf?: string | null };
  people?: FamilyPerson[];
  weather?: WeatherSnapshot;
  reminders?: Reminder[];
  location?: { hasRecent: boolean; lastSeenLabel: string | null };
  emergency?: { contacts: { name: string; phone: string | null }[] };
};

export type NikkiAIInput = {
  message: string;
  context: NikkiContext;
};

export type NikkiAIResponse = {
  text: string;
  safetyLevel: SafetyLevel;
  followUps: string[];
};

export interface NikkiAIProvider {
  generateResponse(input: NikkiAIInput): Promise<NikkiAIResponse>;
}

// Weather — replaceable provider (mock for MVP, Open-Meteo later).
export type WeatherSnapshot = {
  temperatureC: number;
  feelsLikeC: number;
  rainProbability: number;
  windKph: number;
  summary: string;
  clothingSuggestion: string;
  safetySuggestion: string | null;
};

export interface WeatherProvider {
  getCurrent(locationLabel: string | null): Promise<WeatherSnapshot>;
}

// Future voice seams — declared now, unused in MVP (texting-first).
export interface STTProvider {
  transcribe(audioUri: string): Promise<string>;
}
export interface TTSProvider {
  speak(text: string): Promise<void>;
}

export type SetupChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};
