// Unit tests for the Open-Meteo weather provider: pure mapping helpers plus the
// cache/fallback flow with a mocked fetch (no real network in tests).
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  OpenMeteoWeatherProvider,
  clothingSuggestionFor,
  describeWeatherCode,
  localityCandidates,
  resetWeatherCache,
  safetySuggestionFor,
  snapshotFromApi,
  type OpenMeteoForecast,
} from "./weatherService";

const forecastFixture: OpenMeteoForecast = {
  current: { temperature_2m: 14.4, apparent_temperature: 12.2, weather_code: 61, wind_speed_10m: 13.6 },
  hourly: {
    time: ["2026-07-10T08:00", "2026-07-10T12:00", "2026-07-10T14:00", "2026-07-10T20:00"],
    precipitation_probability: [90, 20, 60, 30],
  },
  daily: { temperature_2m_max: [17.2], temperature_2m_min: [9.4] },
};

describe("localityCandidates", () => {
  it("takes the part after the last comma", () => {
    expect(localityCandidates("Lindenlaan 14, Utrecht")).toEqual(["Utrecht"]);
    expect(localityCandidates("Flat 2, Baker Street, London")).toEqual(["London"]);
  });
  it("strips house numbers and offers the last word when there is no comma", () => {
    expect(localityCandidates("werfstraat 171 amsterdam")).toEqual(["werfstraat amsterdam", "amsterdam"]);
    expect(localityCandidates("Werfstraat 171, 1013 Amsterdam")).toEqual(["Amsterdam"]);
  });
  it("keeps multi-word city names intact as the first candidate", () => {
    expect(localityCandidates("New York")).toEqual(["New York", "York"]);
    expect(localityCandidates("Lisbon")).toEqual(["Lisbon"]);
  });
  it("handles empty, null and unusable input", () => {
    expect(localityCandidates(null)).toEqual([]);
    expect(localityCandidates("")).toEqual([]);
    expect(localityCandidates(" , ")).toEqual([]);
    expect(localityCandidates("171")).toEqual([]);
  });
});

describe("describeWeatherCode", () => {
  it("maps common WMO codes to friendly summaries", () => {
    expect(describeWeatherCode(0)).toBe("Clear skies");
    expect(describeWeatherCode(3)).toBe("Cloudy");
    expect(describeWeatherCode(61)).toBe("Light rain");
    expect(describeWeatherCode(75)).toBe("Snowy");
    expect(describeWeatherCode(95)).toBe("Thunderstorms");
  });
  it("falls back for unknown codes", () => {
    expect(describeWeatherCode(42)).toBe("Changeable weather");
  });
});

describe("clothingSuggestionFor", () => {
  it("covers the temperature bands", () => {
    expect(clothingSuggestionFor(28)).toMatch(/warm/);
    expect(clothingSuggestionFor(20)).toMatch(/mild/);
    expect(clothingSuggestionFor(12)).toMatch(/warm coat/);
    expect(clothingSuggestionFor(5)).toMatch(/thick coat/);
    expect(clothingSuggestionFor(-2)).toMatch(/very cold/);
  });
});

describe("safetySuggestionFor", () => {
  it("prioritises ice over everything else", () => {
    expect(safetySuggestionFor({ temperatureC: -1, windKph: 50, rainProbability: 0.9 })).toMatch(/slippery/);
  });
  it("flags heat, wind and rain", () => {
    expect(safetySuggestionFor({ temperatureC: 32, windKph: 10, rainProbability: 0 })).toMatch(/water/);
    expect(safetySuggestionFor({ temperatureC: 15, windKph: 45, rainProbability: 0 })).toMatch(/windy/);
    expect(safetySuggestionFor({ temperatureC: 15, windKph: 10, rainProbability: 0.6 })).toMatch(/umbrella/);
  });
  it("returns null on a calm day", () => {
    expect(safetySuggestionFor({ temperatureC: 18, windKph: 10, rainProbability: 0.1 })).toBeNull();
  });
});

describe("snapshotFromApi", () => {
  it("rounds values and takes the max rain chance over the remaining hours", () => {
    const snapshot = snapshotFromApi(forecastFixture, new Date("2026-07-10T12:30:00"));
    expect(snapshot.temperatureC).toBe(14);
    expect(snapshot.feelsLikeC).toBe(12);
    expect(snapshot.windKph).toBe(14);
    expect(snapshot.highC).toBe(17);
    expect(snapshot.lowC).toBe(9);
    expect(snapshot.summary).toBe("Light rain");
    // The 90% at 08:00 is in the past; the max of the rest (incl. the hour in progress) is 60%.
    expect(snapshot.rainProbability).toBe(0.6);
    expect(snapshot.clothingSuggestion).toMatch(/warm coat/);
    expect(snapshot.safetySuggestion).toMatch(/umbrella/);
  });
  it("tolerates missing daily and hourly blocks", () => {
    const snapshot = snapshotFromApi({ current: forecastFixture.current }, new Date("2026-07-10T12:30:00"));
    expect(snapshot.highC).toBeNull();
    expect(snapshot.lowC).toBeNull();
    expect(snapshot.rainProbability).toBe(0);
  });
});

describe("OpenMeteoWeatherProvider", () => {
  const geocodeResponse = { results: [{ latitude: 52.09, longitude: 5.12 }] };
  let fetchMock: jest.Mock;

  const jsonResponse = (body: unknown) => ({ ok: true, json: async () => body });

  beforeEach(async () => {
    resetWeatherCache();
    await AsyncStorage.clear();
    fetchMock = jest.fn((url: string) => {
      if (url.includes("geocoding-api")) return Promise.resolve(jsonResponse(geocodeResponse));
      return Promise.resolve(jsonResponse(forecastFixture));
    });
    (global as { fetch: unknown }).fetch = fetchMock;
  });

  it("returns null without an address and never touches the network", async () => {
    const provider = new OpenMeteoWeatherProvider();
    expect(await provider.getCurrent(null)).toBeNull();
    expect(await provider.getCurrent("   ")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("geocodes the locality only and returns a snapshot", async () => {
    const provider = new OpenMeteoWeatherProvider();
    const snapshot = await provider.getCurrent("Lindenlaan 14, Utrecht");
    expect(snapshot?.temperatureC).toBe(14);
    const geocodeUrl = fetchMock.mock.calls[0][0] as string;
    expect(geocodeUrl).toContain("name=Utrecht");
    expect(geocodeUrl).not.toContain("Lindenlaan"); // street never leaves the device
  });

  it("serves a fresh snapshot from cache without refetching", async () => {
    const provider = new OpenMeteoWeatherProvider();
    await provider.getCurrent("Lindenlaan 14, Utrecht");
    expect(fetchMock).toHaveBeenCalledTimes(2); // geocode + forecast
    const again = await provider.getCurrent("Lindenlaan 14, Utrecht");
    expect(again?.temperatureC).toBe(14);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refetches when the address changes", async () => {
    const provider = new OpenMeteoWeatherProvider();
    await provider.getCurrent("Lindenlaan 14, Utrecht");
    await provider.getCurrent("Rua Augusta 1, Lisbon");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toContain("name=Lisbon");
  });

  it("serves a stale snapshot when the network fails within the stale window", async () => {
    const provider = new OpenMeteoWeatherProvider();
    const realNow = Date.now();
    await provider.getCurrent("Lindenlaan 14, Utrecht");
    // 45 minutes later (past fresh, inside stale) the network is down.
    jest.spyOn(Date, "now").mockReturnValue(realNow + 45 * 60 * 1000);
    fetchMock.mockRejectedValue(new Error("offline"));
    const snapshot = await provider.getCurrent("Lindenlaan 14, Utrecht");
    expect(snapshot?.temperatureC).toBe(14);
    jest.restoreAllMocks();
  });

  it("returns null when the network fails and the cache is too old", async () => {
    const provider = new OpenMeteoWeatherProvider();
    const realNow = Date.now();
    await provider.getCurrent("Lindenlaan 14, Utrecht");
    jest.spyOn(Date, "now").mockReturnValue(realNow + 4 * 60 * 60 * 1000);
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await provider.getCurrent("Lindenlaan 14, Utrecht")).toBeNull();
    jest.restoreAllMocks();
  });

  it("falls back to the last word when the street form does not geocode", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("geocoding-api")) {
        // Real behavior: "werfstraat amsterdam" finds nothing, "amsterdam" does.
        return Promise.resolve(
          jsonResponse(url.includes("name=amsterdam") ? geocodeResponse : {}),
        );
      }
      return Promise.resolve(jsonResponse(forecastFixture));
    });
    const provider = new OpenMeteoWeatherProvider();
    const snapshot = await provider.getCurrent("werfstraat 171 amsterdam");
    expect(snapshot?.temperatureC).toBe(14);
    const geocodeUrls = fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => u.includes("geocoding-api"));
    expect(geocodeUrls[0]).toContain("name=werfstraat%20amsterdam");
    expect(geocodeUrls[1]).toContain("name=amsterdam");
  });

  it("returns null when the locality cannot be geocoded", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
    const provider = new OpenMeteoWeatherProvider();
    expect(await provider.getCurrent("Nowhere 1, Atlantis")).toBeNull();
  });
});
