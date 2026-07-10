// src/types/domain.ts — app-level domain shapes the UI reasons over.
// (Conversation understanding/replies live in the ElevenLabs agent now — see src/features/voice/;
// the app no longer models chat messages, intents, or AI providers.)

// Weather — replaceable provider (Open-Meteo today; the interface is the swap seam).
export type WeatherSnapshot = {
  temperatureC: number;
  feelsLikeC: number;
  rainProbability: number;
  windKph: number;
  highC: number | null;
  lowC: number | null;
  summary: string;
  clothingSuggestion: string;
  safetySuggestion: string | null;
};

export interface WeatherProvider {
  // Location comes from the elder's free-text home address (never GPS); null means
  // weather is unavailable right now (no address, geocode failed, offline too long).
  getCurrent(homeAddress: string | null): Promise<WeatherSnapshot | null>;
}

export type SetupChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};
