// src/features/safety/homeDestination.ts — where to guide a lost elder: a SAFE PLACE (home is one
// of them now). Shared by the Help screen button and Nikki's guide_to_safe_place tool. If we know
// the elder's current location, we pick the CLOSEST safe place; otherwise we fall back to one named
// "home", else the first with an address or map pin. Coordinates are returned as "lat,lng".
import type { SafeLocation } from "../../types/database";

type Coords = { latitude: number; longitude: number };

// Great-circle distance in metres (haversine) — good enough to rank nearby safe places.
function distanceMeters(a: Coords, b: Coords): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function destinationOf(s: SafeLocation): string | null {
  if (s.address && s.address.trim().length > 0) return s.address.trim();
  if (s.latitude != null && s.longitude != null) return `${s.latitude},${s.longitude}`;
  return null;
}

// True if there's at least one safe place we could actually guide to.
export function hasSafeDestination(safe: SafeLocation[]): boolean {
  return safe.some((s) => destinationOf(s) !== null);
}

export function nearestSafeDestination(current: Coords | null, safe: SafeLocation[]): string | null {
  const withCoords = safe.filter((s) => s.latitude != null && s.longitude != null);
  if (current && withCoords.length > 0) {
    let best = withCoords[0];
    let bestD = distanceMeters(current, { latitude: best.latitude as number, longitude: best.longitude as number });
    for (const s of withCoords.slice(1)) {
      const d = distanceMeters(current, { latitude: s.latitude as number, longitude: s.longitude as number });
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return destinationOf(best);
  }
  // No current fix (or no pinned places): prefer a place named "home", else the first usable one.
  const named = safe.find((s) => /\b(home|thuis|huis)\b/i.test(s.name));
  const pick = named ?? safe.find((s) => destinationOf(s) !== null);
  return pick ? destinationOf(pick) : null;
}
