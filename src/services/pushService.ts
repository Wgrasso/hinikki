// src/services/pushService.ts — persist this device's Expo push token and fan proposal
// notifications out to the family's admins (plan §4.5). Client-side by design: the elder's
// device reads its ACTIVE admins' tokens (RLS: is_my_active_admin) and calls Expo's push
// endpoint directly — no server infra beyond the existing tables.
// Privacy: the push body carries no elder name and no fact content — it transits Expo's
// unauthenticated endpoint in plaintext and sits on lock screens.
import { supabase } from "../lib/supabase";
import { registerForPush, sendPush, type PushUrgency } from "../features/notifications/push";
import { Platform } from "react-native";

const PUSH_TITLE = "HiNikki";
const PROPOSAL_BODY = "Nikki has a question for you";

// Register this device and persist the token under the caller's own profile.
// Safe to call on every app start; a null token (web/simulator/denied) is a no-op.
export async function registerAndSaveToken(): Promise<void> {
  if (!supabase) return;
  const token = await registerForPush();
  if (!token) return;
  const profileId = await myProfileId();
  if (!profileId) return;
  await supabase
    .from("push_tokens")
    .upsert(
      { profile_id: profileId, expo_push_token: token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: "profile_id,expo_push_token" },
    );
}

// Send a push to every active admin device (RLS returns own + active-admin tokens; we drop
// our own). Fire-and-forget; failures fall back to the in-app surfaces.
async function sendToAdmins(title: string, body: string, urgency: PushUrgency = "normal"): Promise<boolean> {
  if (!supabase) return false;
  try {
    const ownProfile = await myProfileId();
    const { data, error } = await supabase.from("push_tokens").select("profile_id, expo_push_token");
    if (error || !data) return false;
    const tokens = data
      .filter((t) => t.profile_id !== ownProfile)
      .map((t) => t.expo_push_token as string);
    if (tokens.length === 0) return false;
    await Promise.all(tokens.map((t) => sendPush(t, title, body, urgency).catch(() => undefined)));
    return true;
  } catch {
    return false;
  }
}

// A proposal landed — quiet, no elder name or content on the lock screen (plan §4.5).
export async function notifyAdminsOfProposal(): Promise<boolean> {
  return sendToAdmins(PUSH_TITLE, PROPOSAL_BODY, "normal");
}

// A safety event was triggered — the message is tailored so the family knows exactly what
// happened. "lost" is loud (they need to see where their person is); calling family is a quiet
// heads-up; anything else is a loud generic alert. Includes the name when we can resolve it.
export async function notifyAdminsOfEmergency(olderAdultId: string, eventType = "help"): Promise<boolean> {
  if (!supabase) return false;
  let name = "Your family member";
  try {
    const { data } = await supabase
      .from("older_adult_profiles")
      .select("preferred_name, display_name")
      .eq("id", olderAdultId)
      .maybeSingle();
    name = (data?.preferred_name as string) ?? (data?.display_name as string) ?? name;
  } catch {
    // fall back to the generic name
  }
  if (eventType === "lost") {
    return sendToAdmins("🚨 HiNikki — someone may be lost", `${name} may be lost right now. Open HiNikki to see where they are.`, "emergency");
  }
  if (eventType === "call_family") {
    return sendToAdmins("HiNikki", `${name} is calling family.`, "normal");
  }
  return sendToAdmins("🚨 HiNikki — help needed", `${name} needs help right now. Open HiNikki.`, "emergency");
}

async function myProfileId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;
    const { data } = await supabase.from("profiles").select("id").eq("auth_user_id", uid).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}
