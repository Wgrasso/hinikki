// src/features/safety/homeDestination.ts — where "home" is for guiding a lost elder. Shared by the
// Help screen button and Nikki's guide_to_safe_place tool so they always agree: the saved home
// address if set, otherwise a safe place — preferring one named "home", else the first with an
// address or map pin. Coordinates are returned as "lat,lng" (the maps app routes to them).
import type { SafeLocation } from "../../types/database";

export function resolveHomeDestination(homeAddress: string | null | undefined, safe: SafeLocation[]): string | null {
  if (homeAddress && homeAddress.trim().length > 0) return homeAddress.trim();
  const named = safe.find((s) => /\b(home|thuis|huis)\b/i.test(s.name));
  const pick = named ?? safe.find((s) => (s.address && s.address.trim()) || (s.latitude != null && s.longitude != null));
  if (!pick) return null;
  if (pick.address && pick.address.trim().length > 0) return pick.address.trim();
  if (pick.latitude != null && pick.longitude != null) return `${pick.latitude},${pick.longitude}`;
  return null;
}
