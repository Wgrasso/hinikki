// src/features/voice/micPermission.ts — Android runtime mic permission (iOS prompts on first use).
// Imported only from .native voice files; PermissionsAndroid does not exist on react-native-web.
import { PermissionsAndroid, Platform } from "react-native";

export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
