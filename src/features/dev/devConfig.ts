// src/features/dev/devConfig.ts — DEV ONLY targets for the dev harness (devHarness.ts).
// Each entry is one family you can jump into as admin OR user. The ACTIVE one is remembered in
// AsyncStorage, so you can switch families from the on-screen dropdown without losing work in
// another family — and picking a family then tapping Admin/User always lands in that same family.
//
// To add a family: create it once through normal onboarding (an admin signs up → creates the
// family → adds the elder), then append a row below with that family's code, the admin account
// you used, and the elder's display name. These are throwaway test credentials, never shipped
// (every caller checks __DEV__).
import AsyncStorage from "@react-native-async-storage/async-storage";

export type DevFamily = {
  label: string; // short name shown in the dropdown
  familyCode: string;
  adminEmail: string;
  adminPassword: string;
  elderName: string; // the older adult to become on the user side
};

export const DEV_FAMILIES: DevFamily[] = __DEV__
  ? [
      {
        label: "Alexu",
        familyCode: "XZVX2D2T",
        adminEmail: "dev-harness@hinikki.test",
        adminPassword: "devharness-XZVX2D2T-2026",
        elderName: "Alexu",
      },
      // ← add more dev families here, e.g.
      // { label: "Oma", familyCode: "ABCD1234", adminEmail: "you@example.com", adminPassword: "…", elderName: "Oma" },
    ]
  : [];

const ACTIVE_KEY = "dev.activeFamilyCode";

// The family the dev switch currently targets — the stored choice if it still exists, else the
// first configured family. Null only when there are no dev families (or not in dev).
export async function getActiveDevFamily(): Promise<DevFamily | null> {
  if (!__DEV__ || DEV_FAMILIES.length === 0) return null;
  try {
    const code = await AsyncStorage.getItem(ACTIVE_KEY);
    const match = DEV_FAMILIES.find((f) => f.familyCode === code);
    if (match) return match;
  } catch {
    // fall through to the default
  }
  return DEV_FAMILIES[0];
}

export async function setActiveDevFamilyCode(familyCode: string): Promise<void> {
  if (!__DEV__) return;
  try {
    await AsyncStorage.setItem(ACTIVE_KEY, familyCode);
  } catch {
    // best-effort; the default just stays active
  }
}
