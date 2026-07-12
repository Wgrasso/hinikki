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

// Android delivers by CHANNEL: importance, sound and vibration are fixed per channel, so we
// register two — a normal one for proposals and a max-importance one for emergencies (heads-up
// pop, louder, insistent vibration). iOS takes priority/sound per-message instead (below).
export const PUSH_CHANNEL = { normal: "default", emergency: "emergency" } as const;

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL.normal, {
    name: "Updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL.emergency, {
    name: "Emergencies",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 400, 200, 400],
    bypassDnd: true,
  });
}

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
    await ensureAndroidChannels();
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch {
    return null;
  }
}

// How insistently a push should arrive. "normal" = a quiet update (proposals); "emergency" =
// high priority + the emergency channel so it pops loudly and pushes past Do Not Disturb.
export type PushUrgency = "normal" | "emergency";

// Send a push notification to an Expo push token through Expo's push service.
export async function sendPush(
  expoPushToken: string,
  title: string,
  body: string,
  urgency: PushUrgency = "normal",
): Promise<PushResult> {
  const emergency = urgency === "emergency";
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        to: expoPushToken,
        title,
        body,
        sound: "default",
        priority: emergency ? "high" : "normal",
        channelId: emergency ? PUSH_CHANNEL.emergency : PUSH_CHANNEL.normal,
      }),
    });
    if (!res.ok) return { ok: false, message: `The push service returned ${res.status}.` };
    const json = (await res.json()) as { data?: { status?: string; message?: string } };
    if (json.data?.status === "error") return { ok: false, message: json.data.message ?? "The push service rejected the message." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not reach the push service." };
  }
}
