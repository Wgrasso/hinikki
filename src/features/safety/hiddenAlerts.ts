// src/features/safety/hiddenAlerts.ts — a per-device list of safety alerts this admin has
// swiped away. Purely local (AsyncStorage): hiding declutters THIS admin's screen only and never
// touches the shared record — "Resolved" is the shared state; hiding is personal.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "safety.hiddenAlerts";

export async function getHiddenAlertIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function hideAlertId(id: string): Promise<void> {
  try {
    const ids = await getHiddenAlertIds();
    if (!ids.includes(id)) await AsyncStorage.setItem(KEY, JSON.stringify([...ids, id]));
  } catch {
    // best-effort; a failed hide just leaves the alert visible
  }
}
