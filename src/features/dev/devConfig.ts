// src/features/dev/devConfig.ts — DEV ONLY targets for the dev harness (devHarness.ts).
// Families come from two places, merged: a hardcoded seed list, and families you land in at
// runtime (creating/joining one auto-saves it, with the admin session captured so you can hop
// back to Admin without a password). The ACTIVE family is remembered, so the switch always
// stays where you are and past family codes stay in the dropdown. All DEV-only, never shipped.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type DevFamily = {
  label: string; // shown in the dropdown
  familyCode: string;
  elderName: string; // elder to become on the user side ("" = just take the first one)
  adminEmail?: string; // seed families sign in with these; runtime families fall back to SHARED_DEV_ADMIN
  adminPassword?: string;
};

// A persistent dev admin account used to become admin of ANY family: it signs in, then joins the
// target family by its code (join_group_as_admin), so there's no per-family password or expiring
// session to manage. It's the same throwaway account as the seed family.
export const SHARED_DEV_ADMIN = { email: "dev-harness@hinikki.test", password: "devharness-XZVX2D2T-2026" };

// Seed families (full credentials). Add more here if you want a permanent, password-based entry.
const SEED_FAMILIES: DevFamily[] = __DEV__
  ? [
      {
        label: "Alexu",
        familyCode: "XZVX2D2T",
        adminEmail: "dev-harness@hinikki.test",
        adminPassword: "devharness-XZVX2D2T-2026",
        elderName: "Alexu",
      },
    ]
  : [];

// Kept for callers that just need "are there any dev families / is this dev".
export const DEV_FAMILIES = SEED_FAMILIES;

const SAVED_KEY = "dev.savedFamilies";
const ACTIVE_KEY = "dev.activeFamilyCode";

async function getSaved(): Promise<DevFamily[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as DevFamily[]) : [];
  } catch {
    return [];
  }
}

// Seed ∪ runtime-saved, keyed by code (saved entries override/extend the seed, e.g. add tokens).
export async function getAllDevFamilies(): Promise<DevFamily[]> {
  if (!__DEV__) return [];
  const byCode = new Map<string, DevFamily>();
  for (const f of SEED_FAMILIES) byCode.set(f.familyCode, f);
  for (const f of await getSaved()) byCode.set(f.familyCode, { ...byCode.get(f.familyCode), ...f });
  return [...byCode.values()];
}

// Remember (or update) a family discovered at runtime, without clobbering a captured session
// when the incoming entry has none.
export async function upsertSavedDevFamily(fam: DevFamily): Promise<void> {
  if (!__DEV__) return;
  try {
    const saved = await getSaved();
    const i = saved.findIndex((f) => f.familyCode === fam.familyCode);
    if (i >= 0) saved[i] = { ...saved[i], ...fam };
    else saved.push(fam);
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    // best-effort
  }
}

export async function getActiveDevFamily(): Promise<DevFamily | null> {
  if (!__DEV__) return null;
  const all = await getAllDevFamilies();
  if (all.length === 0) return null;
  try {
    const code = await AsyncStorage.getItem(ACTIVE_KEY);
    const match = all.find((f) => f.familyCode === code);
    if (match) return match;
  } catch {
    // fall through to default
  }
  return all[0];
}

export async function setActiveDevFamilyCode(familyCode: string): Promise<void> {
  if (!__DEV__) return;
  try {
    await AsyncStorage.setItem(ACTIVE_KEY, familyCode);
  } catch {
    // best-effort
  }
}
