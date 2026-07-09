// src/types/domain.ts — app-level domain shapes the UI reasons over.
// (Conversation understanding/replies live in the ElevenLabs agent now — see src/features/voice/;
// the app no longer models chat messages, intents, or AI providers.)

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

export type SetupChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};
