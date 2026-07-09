// src/features/notifications/push.ts — register this device for push, and send a push via Expo.
// Push notifications require a native build (dev build / TestFlight) on a real device; on web and
// simulators registration returns null and the caller shows a friendly message instead.
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

// Show notifications even while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushResult = { ok: true } | { ok: false; message: string };

// Ask permission and return this device's Expo push token (null on web/simulator/denied).
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return null;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch {
    return null;
  }
}

// Send a push notification to an Expo push token through Expo's push service.
export async function sendPush(expoPushToken: string, title: string, body: string): Promise<PushResult> {
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ to: expoPushToken, title, body, sound: "default" }),
    });
    if (!res.ok) return { ok: false, message: `The push service returned ${res.status}.` };
    const json = (await res.json()) as { data?: { status?: string; message?: string } };
    if (json.data?.status === "error") return { ok: false, message: json.data.message ?? "The push service rejected the message." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not reach the push service." };
  }
}
