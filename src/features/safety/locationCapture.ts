// src/features/safety/locationCapture.ts — best-effort foreground location capture (dignified, opt-in).
// Returns false quietly if permission is declined or unavailable (e.g. web preview).
import * as Location from "expo-location";
import { recordLocation } from "../../services/locationService";

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
