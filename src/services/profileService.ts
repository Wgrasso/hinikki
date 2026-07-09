// src/services/profileService.ts — auth + identity.
// Admin = Supabase email/password; older adult = anonymous auth. With no Supabase env the app runs
// in a fully navigable DEMO identity so it can be exercised in Expo Go / web preview.
import { supabase } from "../lib/supabase";
import { DEMO_OLDER_ADULT_ID } from "../data/demo";
import { getDeviceId } from "../storage/localStore";
import type { AppMode, AppRole, OlderAdultProfile } from "../types/database";

export type AuthResult = { ok: true } | { ok: false; message: string };

async function ensureProfile(role: AppRole, mode: AppMode): Promise<string | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const authUserId = userData.user?.id;
  if (!authUserId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ auth_user_id: authUserId, role, selected_mode: mode }, { onConflict: "auth_user_id" })
    .select("id")
    .single();
  if (error) return null;
  return (data as { id: string }).id;
}

// Idempotent: guarantee BOTH the profiles row and the admin_profiles row for the current session.
// Called on sign-up, sign-in, AND boot, so a returning admin is never left without an admin_profiles row.
export async function ensureAdminProfile(displayName: string, email: string): Promise<void> {
  if (!supabase) return;
  const profileId = await ensureProfile("admin", "admin");
  const { data: userData } = await supabase.auth.getUser();
  if (profileId && userData.user) {
    await supabase.from("admin_profiles").upsert(
      { profile_id: profileId, auth_user_id: userData.user.id, display_name: displayName, email },
      { onConflict: "profile_id" },
    );
  }
}

// Ensure an anonymous older-adult session + profiles row exists BEFORE any redeem/claim/roster call.
export async function ensureAnonSession(): Promise<void> {
  if (!supabase) return;
  const { data: existing } = await supabase.auth.getSession();
  if (!existing.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error(error.message);
  }
  await ensureProfile("older_adult", "user");
}

// --- Older adult (user mode) ---------------------------------------------------

export async function startUserMode(): Promise<{ olderAdultId: string }> {
  if (!supabase) return { olderAdultId: DEMO_OLDER_ADULT_ID };
  await ensureAnonSession();
  const deviceId = await getDeviceId();
  const { data, error } = await supabase.rpc("create_older_adult_for_self", { p_display_name: "My profile", p_device_id: deviceId });
  if (error) throw new Error(error.message);
  return { olderAdultId: String(data) };
}

// --- Admin (email/password) ----------------------------------------------------

export async function adminSignUp(email: string, password: string, displayName: string): Promise<AuthResult> {
  if (!supabase) return { ok: true };
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, message: error.message };
  if (!data.session) return { ok: false, message: "Please confirm your email, then sign in." };
  await ensureAdminProfile(displayName, email);
  return { ok: true };
}

export async function adminSignIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: true };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
  await ensureAdminProfile("Family", email);
  return { ok: true };
}

export async function createOlderAdultByAdmin(displayName: string): Promise<{ olderAdultId: string }> {
  if (!supabase) return { olderAdultId: DEMO_OLDER_ADULT_ID };
  // RPC creates the profile, sets created_by_admin_id, AND links the admin as owner so
  // can_manage_older_adult() grants them management — all server-side.
  const { data, error } = await supabase.rpc("create_older_adult_by_admin", { p_display_name: displayName });
  if (error) throw new Error(error.message);
  return { olderAdultId: String(data) };
}

export async function getOlderAdult(olderAdultId: string): Promise<OlderAdultProfile | null> {
  if (!supabase) {
    const { demoOlderAdult } = await import("../data/demo");
    return demoOlderAdult;
  }
  const { data, error } = await supabase
    .from("older_adult_profiles")
    .select("id, owner_profile_id, display_name, preferred_name, date_of_birth, primary_language, home_address, setup_status, created_by_admin_id")
    .eq("id", olderAdultId)
    .single();
  if (error) return null;
  return data as OlderAdultProfile;
}

export async function signOutAll(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}

export async function hasActiveSession(): Promise<boolean> {
  if (!supabase) return true; // demo identity is always "signed in"
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}
