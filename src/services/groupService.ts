// src/services/groupService.ts — the household (group) connection layer.
// One stable, reusable join code per household; everyone joins by entering it. Every call
// surfaces the REAL failure cause (never a blanket "expired") so codes are diagnosable.
import { supabase } from "../lib/supabase";
import { DEMO_OLDER_ADULT_ID } from "../data/demo";
import { ensureAnonSession } from "./profileService";

export type GroupHandle = { groupId: string; joinCode: string; olderAdultId: string };
export type RosterEntry = { id: string; displayName: string; hasOwner: boolean };
export type GroupRoster = { groupId: string; groupName: string; olderAdults: RosterEntry[] };
export type MyGroup = { mode: "admin" | "user"; groupId: string; joinCode: string; olderAdultId: string | null };
export type ServiceResult<T> = { ok: true; value: T } | { ok: false; message: string };

const DEMO_CODE = "DEMOFAM2";

// Map a raw Postgres/RPC error to friendly, CAUSE-SPECIFIC copy (never a blanket "expired").
function friendly(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid code")) return "That code didn't match a household. Please double-check it.";
  if (m.includes("not authenticated") || m.includes("prepare your profile")) return "We could not start your session. Please fully close the app and open it again.";
  if (m.includes("only an admin")) return "Please sign in as family first, then enter the code.";
  if (m.includes("not in this household")) return "That person isn't in this household anymore.";
  if (m.includes("too many")) return "Too many tries. Please wait a minute and try again.";
  return "We couldn't connect just now. Please try again.";
}

export async function adminCreateHousehold(groupName: string, olderAdultName: string): Promise<GroupHandle> {
  if (!supabase) return { groupId: "demo-group", joinCode: DEMO_CODE, olderAdultId: DEMO_OLDER_ADULT_ID };
  const { data, error } = await supabase.rpc("admin_create_household", {
    p_group_name: groupName,
    p_older_adult_name: olderAdultName,
  });
  if (error) throw new Error(error.message);
  const d = data as { group_id: string; join_code: string; older_adult_id: string };
  return { groupId: d.group_id, joinCode: d.join_code, olderAdultId: d.older_adult_id };
}

export async function joinGroupAsAdmin(code: string, relationship?: string): Promise<ServiceResult<{ groupId: string; olderAdultId: string }>> {
  if (!supabase) return { ok: true, value: { groupId: "demo-group", olderAdultId: DEMO_OLDER_ADULT_ID } };
  const { data, error } = await supabase.rpc("join_group_as_admin", { p_code: code.trim().toUpperCase(), p_relationship: relationship ?? null });
  if (error) return { ok: false, message: friendly(error.message) };
  const d = data as { group_id: string; older_adult_ids: string[] };
  return { ok: true, value: { groupId: d.group_id, olderAdultId: d.older_adult_ids[0] ?? "" } };
}

export async function startSoloOlderAdult(displayName: string): Promise<GroupHandle> {
  if (!supabase) return { groupId: "demo-group", joinCode: DEMO_CODE, olderAdultId: DEMO_OLDER_ADULT_ID };
  await ensureAnonSession();
  const { data, error } = await supabase.rpc("start_solo_older_adult", {
    p_display_name: displayName.trim() || "My profile",
  });
  if (error) throw new Error(error.message);
  const d = data as { group_id: string; join_code: string; older_adult_id: string };
  return { groupId: d.group_id, joinCode: d.join_code, olderAdultId: d.older_adult_id };
}

export async function getGroupRoster(code: string): Promise<ServiceResult<GroupRoster>> {
  if (!supabase) return { ok: true, value: { groupId: "demo-group", groupName: "Demo family", olderAdults: [{ id: DEMO_OLDER_ADULT_ID, displayName: "Anna de Vries", hasOwner: false }] } };
  await ensureAnonSession();
  const { data, error } = await supabase.rpc("get_group_roster", { p_code: code.trim().toUpperCase() });
  if (error) return { ok: false, message: friendly(error.message) };
  const d = data as { group_id: string; group_name: string; older_adults: { id: string; display_name: string; has_owner: boolean }[] };
  return {
    ok: true,
    value: {
      groupId: d.group_id,
      groupName: d.group_name,
      olderAdults: d.older_adults.map((o) => ({ id: o.id, displayName: o.display_name, hasOwner: o.has_owner })),
    },
  };
}

export async function claimOlderAdult(code: string, olderAdultId: string): Promise<ServiceResult<{ olderAdultId: string }>> {
  if (!supabase) return { ok: true, value: { olderAdultId: DEMO_OLDER_ADULT_ID } };
  await ensureAnonSession();
  const { data, error } = await supabase.rpc("claim_older_adult_in_group", { p_code: code.trim().toUpperCase(), p_older_adult: olderAdultId });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, value: { olderAdultId: String(data) } };
}

export async function joinAsNewOlderAdult(code: string, displayName: string): Promise<ServiceResult<{ olderAdultId: string }>> {
  if (!supabase) return { ok: true, value: { olderAdultId: DEMO_OLDER_ADULT_ID } };
  await ensureAnonSession();
  const { data, error } = await supabase.rpc("create_older_adult_self_in_group", { p_code: code.trim().toUpperCase(), p_display_name: displayName });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, value: { olderAdultId: String(data) } };
}

export async function getMyGroup(): Promise<MyGroup | null> {
  if (!supabase) return null;
  // Retry once so a TRANSIENT rpc error is not conflated with "no group" — that conflation
  // would silently bounce a signed-in user back to onboarding on a network blip. A genuine
  // null payload means "no group". If both attempts error (server unreachable), we return
  // null and the caller degrades to onboarding (a dedicated offline/retry screen is a follow-up).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase.rpc("get_my_group");
    if (!error) {
      if (!data) return null;
      const d = data as { mode: "admin" | "user"; group_id: string; join_code: string; older_adult_id: string | null };
      return { mode: d.mode, groupId: d.group_id, joinCode: d.join_code, olderAdultId: d.older_adult_id };
    }
  }
  return null;
}
