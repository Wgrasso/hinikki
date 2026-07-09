// src/lib/constants.ts — app-wide constants (no secrets here; env comes from expo-public vars).
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? "";
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? "";

export const HAS_SUPABASE = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

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
