// src/features/dev/devSessionSwitch.ts — DEV ONLY: hold two auth sessions on one device
// (the elder's anonymous user + an admin's email user) and flip between them instantly.
// This exists because elder and admin are different Supabase users: a UI-only mode toggle
// would render the other side's screens while every RLS self-write silently fails — the
// worst kind of test. Flipping the real session keeps RLS behavior authentic.
// Never bundled into release behavior: every entry point checks __DEV__.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { getMyGroup } from "../../services/groupService";
import { clearSession, setSelectedMode } from "../../storage/localStore";
import type { AppMode } from "../../types/database";

const KEY_PREFIX = "hinikki.dev.session.";
type StoredSession = { access_token: string; refresh_token: string };

export type SwitchResult =
  | { kind: "switched" }
  | { kind: "needs-login" }
  | { kind: "error" }
  // Both roles are signed in, but into DIFFERENT family groups — almost always a test
  // setup mistake (admin and elder would see unrelated data). The caller decides:
  // proceed() finishes the switch anyway; revert() restores the previous session.
  | {
      kind: "group-mismatch";
      fromCode: string | null;
      toCode: string | null;
      proceed: () => Promise<void>;
      revert: () => Promise<void>;
    };

// Remember the CURRENT auth session under the given mode, so we can come back to it.
export async function stashCurrentSession(mode: AppMode): Promise<boolean> {
  if (!__DEV__ || !supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s?.access_token || !s.refresh_token) return false;
    const stored: StoredSession = { access_token: s.access_token, refresh_token: s.refresh_token };
    await AsyncStorage.setItem(KEY_PREFIX + mode, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

// Flip to the other role's stashed session. "needs-login": that role has not signed in
// on this device yet — use prepareLoginAsOther() once, then flipping works both ways.
export async function switchSession(from: AppMode, to: AppMode): Promise<SwitchResult> {
  if (!__DEV__ || !supabase) return { kind: "error" };
  try {
    // Group of the CURRENT role, read live before we leave it.
    const fromGroup = await getMyGroup().catch(() => null);
    await stashCurrentSession(from);
    const fromRaw = await AsyncStorage.getItem(KEY_PREFIX + from);
    const raw = await AsyncStorage.getItem(KEY_PREFIX + to);
    if (!raw) return { kind: "needs-login" };
    const stored = JSON.parse(raw) as StoredSession;
    const { data, error } = await supabase.auth.setSession(stored);
    if (error || !data.session) {
      // The stashed refresh token expired/was revoked — forget it and ask for a login.
      await AsyncStorage.removeItem(KEY_PREFIX + to);
      return { kind: "needs-login" };
    }
    // Re-stash the rotated tokens (setSession refreshes them).
    await stashCurrentSession(to);

    // CRUCIAL: both roles must be in the same family group, or every cross-side test
    // (proposals, people, recaps) silently looks at different elders.
    const toGroup = await getMyGroup().catch(() => null);
    const fromCode = fromGroup?.joinCode ?? null;
    const toCode = toGroup?.joinCode ?? null;
    if (fromCode && toCode && fromCode !== toCode) {
      return {
        kind: "group-mismatch",
        fromCode,
        toCode,
        proceed: async () => {
          await setSelectedMode(to);
        },
        revert: async () => {
          if (!fromRaw || !supabase) return;
          const back = JSON.parse(fromRaw) as StoredSession;
          await supabase.auth.setSession(back);
          await stashCurrentSession(from);
        },
      };
    }

    await setSelectedMode(to);
    return { kind: "switched" };
  } catch {
    return { kind: "error" };
  }
}

// Clear only the LOCAL mode/link cache (session untouched) — used when re-pairing the
// current role into a different family group.
export async function resetLocalModeCache(): Promise<void> {
  if (!__DEV__) return;
  await clearSession();
}

// One-time setup path: keep the current session stashed, then drop to onboarding so the
// tester can sign in as the other role. LOCAL sign-out only — a global sign-out would
// revoke the refresh token we just stashed.
export async function prepareLoginAsOther(current: AppMode): Promise<void> {
  if (!__DEV__ || !supabase) return;
  await stashCurrentSession(current);
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore — worst case the next screen still has the old session
  }
  await clearSession();
}
