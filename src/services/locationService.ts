// src/services/locationService.ts — persist + read location updates (live Supabase or demo store).
import { supabase } from "../lib/supabase";
import { getDemoState, mutateDemo, newId } from "../data/demoDb";
import type { LocationUpdate, SafeLocation } from "../types/database";

export type Coords = { latitude: number; longitude: number; accuracy?: number | null; batteryLevel?: number | null };

// Returns the new location row's id (so a safety event can link to exactly where it happened),
// or null if it couldn't be stored.
export async function recordLocation(
  olderAdultId: string,
  coords: Coords,
  emergencyFlag = false,
): Promise<string | null> {
  if (!supabase) {
    const update: LocationUpdate = {
      id: newId("loc"),
      older_adult_id: olderAdultId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy ?? null,
      battery_level: coords.batteryLevel ?? null,
      emergency_flag: emergencyFlag,
      created_at: new Date().toISOString(),
    };
    await mutateDemo((s) => {
      s.locationUpdates.push(update);
    });
    return update.id;
  }
  const { data, error } = await supabase
    .from("location_updates")
    .insert({
      older_adult_id: olderAdultId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy ?? null,
      battery_level: coords.batteryLevel ?? null,
      emergency_flag: emergencyFlag,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

// A single location by id — used to show WHERE a safety alert happened.
export async function getLocationById(id: string): Promise<LocationUpdate | null> {
  if (!supabase) {
    const s = await getDemoState();
    return s.locationUpdates.find((l) => l.id === id) ?? null;
  }
  const { data, error } = await supabase
    .from("location_updates")
    .select("id, older_adult_id, latitude, longitude, accuracy, battery_level, emergency_flag, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LocationUpdate | null) ?? null;
}

export async function getLatestLocation(olderAdultId: string): Promise<LocationUpdate | null> {
  if (!supabase) {
    const s = await getDemoState();
    const mine = s.locationUpdates.filter((l) => l.older_adult_id === olderAdultId);
    return mine.length ? mine[mine.length - 1] : null;
  }
  const { data, error } = await supabase
    .from("location_updates")
    .select("id, older_adult_id, latitude, longitude, accuracy, battery_level, emergency_flag, created_at")
    .eq("older_adult_id", olderAdultId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data && data[0]) ? (data[0] as LocationUpdate) : null;
}

export async function listSafeLocations(olderAdultId: string): Promise<SafeLocation[]> {
  if (!supabase) {
    const s = await getDemoState();
    return s.safeLocations.filter((l) => l.older_adult_id === olderAdultId);
  }
  const { data, error } = await supabase
    .from("safe_locations")
    .select("id, older_adult_id, name, address, latitude, longitude, radius_meters, location_type")
    .eq("older_adult_id", olderAdultId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SafeLocation[];
}

export async function createSafeLocation(
  olderAdultId: string,
  input: { name: string; address?: string | null; location_type?: string | null },
): Promise<SafeLocation> {
  if (!supabase) {
    const loc: SafeLocation = {
      id: newId("s"),
      older_adult_id: olderAdultId,
      name: input.name,
      address: input.address ?? null,
      latitude: null,
      longitude: null,
      radius_meters: 150,
      location_type: input.location_type ?? null,
    };
    await mutateDemo((s) => {
      s.safeLocations.push(loc);
    });
    return loc;
  }
  const { data, error } = await supabase
    .from("safe_locations")
    .insert({ older_adult_id: olderAdultId, ...input })
    .select("id, older_adult_id, name, address, latitude, longitude, radius_meters, location_type")
    .single();
  if (error) throw new Error(error.message);
  return data as SafeLocation;
}

export async function updateSafeLocation(
  id: string,
  patch: { name?: string; address?: string | null; location_type?: string | null },
): Promise<void> {
  if (!supabase) {
    await mutateDemo((s) => {
      const i = s.safeLocations.findIndex((l) => l.id === id);
      if (i >= 0) s.safeLocations[i] = { ...s.safeLocations[i], ...patch };
    });
    return;
  }
  const { error } = await supabase.from("safe_locations").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
