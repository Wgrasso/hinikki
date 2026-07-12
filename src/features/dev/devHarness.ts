// src/features/dev/devHarness.ts — DEV ONLY: deterministically become the admin OR the user
// of ONE fixed family (devConfig.ts), every time, regardless of whatever session is stored.
// Unlike the session-stash switcher, this never drifts: the admin is a real persistent
// account, and the user re-claims the same named elder on each call (ownership transfers to
// the fresh anonymous session — fine for testing). Both flows self-heal a corrupt session.
import { supabase } from "../../lib/supabase";
import { adminSignIn, ensureAnonSession } from "../../services/profileService";
import { claimOlderAdult, getGroupRoster, joinGroupAsAdmin } from "../../services/groupService";
import { getActiveDevFamily } from "./devConfig";

export type BecomeResult = { ok: true } | { ok: false; message: string };
export type BecomeUserResult =
  | { ok: true; olderAdultId: string; groupId: string; joinCode: string }
  | { ok: false; message: string };

// Sign in as the fixed dev admin and ensure it is in the target family. The caller then
// clears the local mode cache and calls appState.refresh(), which re-derives admin mode +
// the family group from get_my_group().
export async function becomeAdmin(): Promise<BecomeResult> {
  const cfg = await getActiveDevFamily();
  if (!__DEV__ || !supabase || !cfg) return { ok: false, message: "dev only" };
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const r = await adminSignIn(cfg.adminEmail, cfg.adminPassword);
  if (!r.ok) return { ok: false, message: r.message };
  await joinGroupAsAdmin(cfg.familyCode).catch(() => undefined); // idempotent link
  return { ok: true };
}

// Become the fixed elder of the target family: fresh anonymous session, then claim the
// named older adult by code (moves ownership to this session). The caller finishes with
// completeSetupWithGroup(...) so the local state is set to user mode immediately.
export async function becomeUser(): Promise<BecomeUserResult> {
  const cfg = await getActiveDevFamily();
  if (!__DEV__ || !supabase || !cfg) return { ok: false, message: "dev only" };
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  await ensureAnonSession();
  const roster = await getGroupRoster(cfg.familyCode);
  if (!roster.ok) return { ok: false, message: roster.message };
  const target =
    roster.value.olderAdults.find(
      (o) => o.displayName.trim().toLowerCase() === cfg.elderName.toLowerCase(),
    ) ?? roster.value.olderAdults[0];
  if (!target) return { ok: false, message: "no older adult in the dev family yet" };
  const claim = await claimOlderAdult(cfg.familyCode, target.id);
  if (!claim.ok) return { ok: false, message: claim.message };
  return { ok: true, olderAdultId: claim.value.olderAdultId, groupId: roster.value.groupId, joinCode: cfg.familyCode };
}
