// src/services/weatherService.ts — WeatherProvider behind a replaceable interface.
// Real weather via Open-Meteo (keyless; free for non-commercial use — if HiNikki commercializes,
// swap providers or move to their paid plan; only this file changes). Location comes from the
// elder's home address, never GPS: only the locality after the last comma is sent to the
// geocoder, so the street address stays on the device. Weather is on the voice-session hot path
// (buildSessionVariables), so results are cached and every failure degrades to stale-or-null
// instead of throwing.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORE_KEYS } from "../lib/constants";
import { supabase } from "../lib/supabase";
import type { WeatherProvider, WeatherSnapshot } from "../types/domain";

const FRESH_MS = 15 * 60 * 1000; // serve from cache without network; matches Open-Meteo's own ~15-min update cadence, so a call at conversation start is effectively current
const STALE_MAX_MS = 3 * 60 * 60 * 1000; // acceptable when the network fails
const FETCH_TIMEOUT_MS = 6000;

// ─── pure helpers (unit-tested; no I/O) ──────────────────────────────────────

// Candidate localities to try against the place-name geocoder, most specific first.
// The geocoder matches place names only, so street parts must go: take the segment after the
// last comma (or the whole string when the family typed no comma, e.g. "werfstraat 171
// amsterdam"), drop every token containing a digit (house numbers, postcodes), and offer the
// last word alone as a fallback ("werfstraat amsterdam" → "amsterdam").
export function localityCandidates(homeAddress: string | null): string[] {
  if (!homeAddress) return [];
  const parts = homeAddress.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) return [];
  const words = parts[parts.length - 1].split(/\s+/).filter((w) => w.length > 0 && !/\d/.test(w));
  if (words.length === 0) return [];
  const candidates = [words.join(" ")];
  if (words.length > 1) candidates.push(words[words.length - 1]);
  return candidates;
}

// WMO weather interpretation codes → a short friendly summary (rendered verbatim in the UI pill).
export function describeWeatherCode(code: number): string {
  if (code === 0) return "Clear skies";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 57) return "Light drizzle";
  if (code === 61 || code === 80) return "Light rain";
  if (code === 63 || code === 81) return "Rainy";
  if (code === 65 || code === 82 || code === 66 || code === 67) return "Heavy rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Snowy";
  if (code >= 95) return "Thunderstorms";
  return "Changeable weather";
}

export function clothingSuggestionFor(feelsLikeC: number): string {
  if (feelsLikeC >= 25) return "It is warm — light clothes and a sun hat would be comfortable.";
  if (feelsLikeC >= 18) return "It is pleasantly mild — a light layer is plenty.";
  if (feelsLikeC >= 10) return "It is a little cool, so a warm coat would be comfortable.";
  if (feelsLikeC >= 3) return "It is cold outside — a thick coat and a scarf would be wise.";
  return "It is very cold — please wrap up warmly if going outside.";
}

// One gentle note at most, ordered by how much it matters for an older adult.
export function safetySuggestionFor(input: {
  temperatureC: number;
  windKph: number;
  rainProbability: number;
}): string | null {
  if (input.temperatureC <= 0) return "It is freezing — paths may be slippery, so please take care.";
  if (input.temperatureC >= 30) return "It is very hot — drinking enough water is important.";
  if (input.windKph >= 40) return "It is quite windy outside — extra care when walking is sensible.";
  if (input.rainProbability > 0.5) return "It may rain later — taking an umbrella is a good idea.";
  return null;
}

// The slice of the Open-Meteo forecast response we consume (timezone=auto → local times).
export type OpenMeteoForecast = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly?: { time: string[]; precipitation_probability: Array<number | null> };
  daily?: { temperature_2m_max: Array<number | null>; temperature_2m_min: Array<number | null> };
};

export function snapshotFromApi(api: OpenMeteoForecast, now: Date = new Date()): WeatherSnapshot {
  // Max chance of rain over the rest of today (incl. the hour in progress).
  const hourStart = now.getTime() - 60 * 60 * 1000;
  let maxProbability = 0;
  const times = api.hourly?.time ?? [];
  const probs = api.hourly?.precipitation_probability ?? [];
  for (let i = 0; i < times.length; i += 1) {
    const p = probs[i];
    if (p == null) continue;
    if (new Date(times[i]).getTime() >= hourStart && p > maxProbability) maxProbability = p;
  }
  const high = api.daily?.temperature_2m_max?.[0];
  const low = api.daily?.temperature_2m_min?.[0];
  const temperatureC = Math.round(api.current.temperature_2m);
  const feelsLikeC = Math.round(api.current.apparent_temperature);
  const windKph = Math.round(api.current.wind_speed_10m);
  const rainProbability = maxProbability / 100;
  return {
    temperatureC,
    feelsLikeC,
    rainProbability,
    windKph,
    highC: high == null ? null : Math.round(high),
    lowC: low == null ? null : Math.round(low),
    summary: describeWeatherCode(api.current.weather_code),
    clothingSuggestion: clothingSuggestionFor(feelsLikeC),
    safetySuggestion: safetySuggestionFor({ temperatureC, windKph, rainProbability }),
  };
}

// ─── caching + fetch plumbing ────────────────────────────────────────────────

type GeoCache = { address: string; latitude: number; longitude: number };
type SnapshotCache = { address: string; fetchedAt: number; snapshot: WeatherSnapshot };

// In-memory front for the AsyncStorage-backed caches; geoMemo also remembers failed
// lookups (null) so an un-geocodable address doesn't retry on every screen focus.
let geoMemo: { address: string; geo: GeoCache | null } | null = null;
let snapshotMemo: SnapshotCache | null = null;

// Exposed so tests (and a future sign-out flow) can start from a cold cache.
export function resetWeatherCache(): void {
  geoMemo = null;
  snapshotMemo = null;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveGeo(homeAddress: string, localities: string[]): Promise<GeoCache | null> {
  if (geoMemo && geoMemo.address === homeAddress) return geoMemo.geo;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEYS.weatherGeo);
    if (raw) {
      const cached = JSON.parse(raw) as GeoCache;
      if (cached.address === homeAddress) {
        geoMemo = { address: homeAddress, geo: cached };
        return cached;
      }
    }
  } catch {
    // cache read is best-effort; fall through to a live geocode
  }
  let geo: GeoCache | null = null;
  for (const locality of localities) {
    const data = (await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locality)}&count=1`,
    )) as { results?: Array<{ latitude: number; longitude: number }> };
    const hit = data.results?.[0];
    if (hit) {
      geo = { address: homeAddress, latitude: hit.latitude, longitude: hit.longitude };
      break;
    }
  }
  geoMemo = { address: homeAddress, geo };
  if (geo) {
    try {
      await AsyncStorage.setItem(STORE_KEYS.weatherGeo, JSON.stringify(geo));
    } catch {
      // cache persistence is best-effort
    }
  }
  return geo;
}

async function loadSnapshotCache(): Promise<SnapshotCache | null> {
  if (snapshotMemo) return snapshotMemo;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEYS.weatherSnapshot);
    if (raw) snapshotMemo = JSON.parse(raw) as SnapshotCache;
  } catch {
    // cache read is best-effort
  }
  return snapshotMemo;
}

function usableStale(cached: SnapshotCache | null, homeAddress: string, now: number): WeatherSnapshot | null {
  if (!cached || cached.address !== homeAddress) return null;
  return now - cached.fetchedAt <= STALE_MAX_MS ? cached.snapshot : null;
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  async getCurrent(homeAddress: string | null): Promise<WeatherSnapshot | null> {
    const localities = localityCandidates(homeAddress);
    if (!homeAddress || localities.length === 0) return null;

    const now = Date.now();
    const cached = await loadSnapshotCache();
    if (cached && cached.address === homeAddress && now - cached.fetchedAt < FRESH_MS) {
      return cached.snapshot;
    }

    try {
      const geo = await resolveGeo(homeAddress, localities);
      if (!geo) return usableStale(cached, homeAddress, now);
      const forecast = (await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
          "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
          "&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min" +
          "&forecast_days=1&timezone=auto",
      )) as OpenMeteoForecast;
      const snapshot = snapshotFromApi(forecast);
      snapshotMemo = { address: homeAddress, fetchedAt: now, snapshot };
      try {
        await AsyncStorage.setItem(STORE_KEYS.weatherSnapshot, JSON.stringify(snapshotMemo));
      } catch {
        // cache persistence is best-effort
      }
      return snapshot;
    } catch {
      return usableStale(cached, homeAddress, now);
    }
  }
}

export const weatherProvider: WeatherProvider = new OpenMeteoWeatherProvider();

export async function getWeather(homeAddress: string | null): Promise<WeatherSnapshot | null> {
  return weatherProvider.getCurrent(homeAddress);
}

// Family-entered advice ("remind dad to wear his brown coat under 8°"). Stored per older adult.
export async function saveWeatherAdvice(olderAdultId: string, advice: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("weather_preferences")
    .upsert({ older_adult_id: olderAdultId, custom_weather_advice: advice }, { onConflict: "older_adult_id" });
  if (error) throw new Error(error.message);
}

// The current family-entered advice (empty string if none set yet).
export async function getWeatherAdvice(olderAdultId: string): Promise<string> {
  if (!supabase) return "";
  const { data, error } = await supabase
    .from("weather_preferences")
    .select("custom_weather_advice")
    .eq("older_adult_id", olderAdultId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.custom_weather_advice as string | null) ?? "";
}
