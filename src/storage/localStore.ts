// src/storage/localStore.ts — typed AsyncStorage helpers for the small, non-secret local state
// (selected mode, linked profile, onboarding flag, device id). Every read validates shape and
// returns a safe default; nothing here is trusted blindly.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORE_KEYS } from "../lib/constants";
import type { AppMode } from "../types/database";

async function readString(key: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return typeof raw === "string" ? raw : null;
  } catch {
    return null;
  }
}

async function writeString(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // best-effort; a failed write just means onboarding re-runs
  }
}

export async function getSelectedMode(): Promise<AppMode | null> {
  const raw = await readString(STORE_KEYS.selectedMode);
  return raw === "user" || raw === "admin" ? raw : null;
}

export async function setSelectedMode(mode: AppMode): Promise<void> {
  await writeString(STORE_KEYS.selectedMode, mode);
}

export async function getLinkedOlderAdultId(): Promise<string | null> {
  return readString(STORE_KEYS.linkedOlderAdultId);
}

export async function setLinkedOlderAdultId(id: string): Promise<void> {
  await writeString(STORE_KEYS.linkedOlderAdultId, id);
}

export async function getGroupId(): Promise<string | null> {
  return readString(STORE_KEYS.groupId);
}

export async function setGroupId(id: string): Promise<void> {
  await writeString(STORE_KEYS.groupId, id);
}

export async function getJoinCode(): Promise<string | null> {
  return readString(STORE_KEYS.joinCode);
}

export async function setJoinCode(code: string): Promise<void> {
  await writeString(STORE_KEYS.joinCode, code);
}

export async function getOnboardingComplete(): Promise<boolean> {
  return (await readString(STORE_KEYS.onboardingComplete)) === "true";
}

export async function setOnboardingComplete(value: boolean): Promise<void> {
  await writeString(STORE_KEYS.onboardingComplete, value ? "true" : "false");
}

export async function getDeviceId(): Promise<string> {
  const existing = await readString(STORE_KEYS.deviceId);
  if (existing) return existing;
  const id = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await writeString(STORE_KEYS.deviceId, id);
  return id;
}

export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORE_KEYS.selectedMode,
      STORE_KEYS.linkedOlderAdultId,
      STORE_KEYS.groupId,
      STORE_KEYS.joinCode,
      STORE_KEYS.onboardingComplete,
    ]);
  } catch {
    // ignore
  }
}

// The admin's chosen APP language (UI text only; the older adult's app + agent language
// come from their profile, not this). Default English.
export async function getAdminLanguage(): Promise<"en" | "nl"> {
  return (await readString(STORE_KEYS.adminLanguage)) === "nl" ? "nl" : "en";
}

export async function setAdminLanguage(lang: "en" | "nl"): Promise<void> {
  await writeString(STORE_KEYS.adminLanguage, lang);
}
