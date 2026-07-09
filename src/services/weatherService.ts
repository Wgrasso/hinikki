// src/services/weatherService.ts — WeatherProvider behind a replaceable interface.
// MVP ships a deterministic MockWeatherProvider; a real keyless provider (Open-Meteo) can replace it
// later without touching the AI/UI layers.
import { supabase } from "../lib/supabase";
import type { WeatherProvider, WeatherSnapshot } from "../types/domain";

export class MockWeatherProvider implements WeatherProvider {
  async getCurrent(_locationLabel: string | null): Promise<WeatherSnapshot> {
    // Deterministic "mild Dutch afternoon with a chance of rain" — enough to prove Nikki's advice.
    const temperatureC = 12;
    const rainProbability = 0.6;
    return {
      temperatureC,
      feelsLikeC: 10,
      rainProbability,
      windKph: 14,
      summary: "Cloudy with a chance of rain this afternoon",
      clothingSuggestion: "It is a little cool, so a warm coat would be comfortable.",
      safetySuggestion: rainProbability > 0.5 ? "It may rain later — taking an umbrella is a good idea." : null,
    };
  }
}

export const weatherProvider: WeatherProvider = new MockWeatherProvider();

export async function getWeather(locationLabel: string | null): Promise<WeatherSnapshot> {
  return weatherProvider.getCurrent(locationLabel);
}

// Family-entered advice ("remind dad to wear his brown coat under 8°"). Stored per older adult.
export async function saveWeatherAdvice(olderAdultId: string, advice: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("weather_preferences")
    .upsert({ older_adult_id: olderAdultId, custom_weather_advice: advice }, { onConflict: "older_adult_id" });
  if (error) throw new Error(error.message);
}
