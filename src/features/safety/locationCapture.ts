// src/features/safety/locationCapture.ts — best-effort foreground location capture (dignified, opt-in).
// Returns false quietly if permission is declined or unavailable (e.g. web preview).
import * as Location from "expo-location";
import { recordLocation } from "../../services/locationService";

export type CurrentPlace = { latitude: number; longitude: number; city: string | null };

// The device's current coordinates + nearest town name, for real-time weather. Does NOT prompt
// for permission (the user layout already asks); returns null if permission isn't granted or a
// fix can't be taken, so callers fall back to the home address.
export async function getCurrentPlace(): Promise<CurrentPlace | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = position.coords;
    let city: string | null = null;
    try {
      const places = await Location.reverseGeocodeAsync({ latitude, longitude });
      const p = places[0];
      city = p?.city ?? p?.subregion ?? p?.region ?? null;
    } catch {
      // reverse geocode is best-effort; coordinates alone still give correct weather
    }
    return { latitude, longitude, city };
  } catch {
    return null;
  }
}

// Turn stored coordinates into a human place — an area + town like "Freiham, Munich" — for the
// admin's location card (never show raw coordinates). Best-effort; null if it can't be resolved.
// Deliberately excludes the street name/number to keep it coarse and private.
export async function describePlace(latitude: number, longitude: number): Promise<string | null> {
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    const p = places[0];
    if (!p) return null;
    const area = p.district ?? p.subregion ?? null; // neighbourhood / borough, NOT the street
    const town = p.city ?? p.region ?? null;
    if (area && town && area.toLowerCase() !== town.toLowerCase()) return `${area}, ${town}`;
    return town ?? area ?? null;
  } catch {
    return null;
  }
}

// Returns the stored location's id (so a safety event can link to it), or null if unavailable.
export async function captureAndStoreLocation(olderAdultId: string, emergencyFlag = false): Promise<string | null> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return await recordLocation(
      olderAdultId,
      { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy },
      emergencyFlag,
    );
  } catch {
    return null;
  }
}
