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

export async function captureAndStoreLocation(olderAdultId: string, emergencyFlag = false): Promise<boolean> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return false;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await recordLocation(
      olderAdultId,
      { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy },
      emergencyFlag,
    );
    return true;
  } catch {
    return false;
  }
}
