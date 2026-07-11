// src/utils/openMaps.ts — open the phone's own maps app (Google Maps, Apple Maps, whatever
// they have) at a location, or with directions to a place. No API key, no geocoding: the maps
// app resolves an address string itself, so an admin-typed address works as a destination.
import { Linking, Platform } from "react-native";

// Try each candidate URL in order; the first the OS can open wins.
async function openFirst(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      // try the next candidate
    }
  }
  // Last resort: the universal Google Maps web URL always opens something.
  try {
    await Linking.openURL(urls[urls.length - 1]);
    return true;
  } catch {
    return false;
  }
}

// Show a point on the map. Android offers the app chooser (geo:); iOS opens Apple Maps;
// the https URL is the cross-platform fallback (opens the Google Maps app if installed).
export async function openMapLocation(latitude: number, longitude: number, label?: string): Promise<boolean> {
  const q = label ? encodeURIComponent(label) : `${latitude},${longitude}`;
  const web = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const urls = Platform.select({
    ios: [`maps://?ll=${latitude},${longitude}&q=${q}`, web],
    android: [`geo:${latitude},${longitude}?q=${latitude},${longitude}(${q})`, web],
    default: [web],
  }) as string[];
  return openFirst(urls);
}

// Directions to a destination given as free text (an address or place name). Origin defaults
// to the phone's current location. Works even when we only have an address, no coordinates.
export async function openMapDirections(destination: string): Promise<boolean> {
  const d = encodeURIComponent(destination.trim());
  const web = `https://www.google.com/maps/dir/?api=1&destination=${d}`;
  const urls = Platform.select({
    ios: [`maps://?daddr=${d}`, web],
    android: [`google.navigation:q=${d}`, `geo:0,0?q=${d}`, web],
    default: [web],
  }) as string[];
  return openFirst(urls);
}
