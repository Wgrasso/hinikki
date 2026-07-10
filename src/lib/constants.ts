// src/lib/constants.ts — app-wide constants (no secrets here; env comes from expo-public vars).
import { Platform } from "react-native";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

// Prefer EXPO_PUBLIC_* env (from .env locally, or the EAS build env); otherwise fall back to
// app.json `extra` so a fresh clone with no .env still connects on Expo Go. Empty strings count
// as "unset" — some bundlers inline an undefined EXPO_PUBLIC_* var as "", which would defeat `??`
// and silently drop the app into demo mode even when app.json has the config.
function firstNonEmpty(...vals: Array<string | undefined>): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}

export const SUPABASE_URL = firstNonEmpty(process.env.EXPO_PUBLIC_SUPABASE_URL, extra.supabaseUrl);
export const SUPABASE_ANON_KEY = firstNonEmpty(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, extra.supabaseAnonKey);

export const HAS_SUPABASE = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

// Voice (ElevenLabs) — the conversation token is minted server-side by the `elevenlabs-token`
// Edge Function (the agent is private; no agent id or key ever lives client-side), so voice needs
// a real Supabase backend and a native platform (the RN SDK rides on LiveKit's native WebRTC
// module; there is no web or demo-mode voice).
export const HAS_VOICE = HAS_SUPABASE && Platform.OS !== "web";

// Willem is actively developing the user-mode Help tab and the admin-mode Safety/location
// features; keep them out of the shipped build until they're ready. Gates: the user "Help" tab,
// the admin "Safety" tab, and the location surfaces that only make sense alongside it (dashboard's
// "Last known location" card, Settings' "Location sharing" info card). Routes/components stay in
// the codebase either way — this only hides them from the UI.
export const FEATURE_HELP_TAB = false;

// Willem is actively developing the admin dashboard's "send a test push notification" tool;
// keep it out of the first beta build until it's ready to ship. This does not affect the
// underlying push infra used to notify admins of Nikki's proposals (src/services/pushService.ts),
// only this manual test button/section.
export const FEATURE_TEST_PUSH_NOTIFICATION = false;

export const PHOTO_BUCKET = "family-photos";

// Local-storage keys (AsyncStorage).
export const STORE_KEYS = {
  selectedMode: "hinikki.selected_mode",
  linkedOlderAdultId: "hinikki.linked_older_adult_id",
  groupId: "hinikki.group_id",
  joinCode: "hinikki.join_code",
  onboardingComplete: "hinikki.onboarding_complete",
  deviceId: "hinikki.device_id",
  demoState: "hinikki.demo_state",
} as const;

// Pairing code presentation: 6 digits shown as "### ###".
export function formatPairingCode(code: string): string {
  const digits = code.replace(/\D/g, "").slice(0, 6);
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

// Household code presentation: 8 alphanumeric chars shown as "XXXX XXXX".
export function formatHouseholdCode(code: string): string {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
}
