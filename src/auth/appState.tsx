// src/auth/appState.tsx — the app's boot + identity state, consumed by the router.
// On launch: restore session → selected mode → linked profile → route. Survives restarts.
// If the session is active but the local link is missing, re-derives identity from the server.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hasActiveSession, signOutAll } from "../services/profileService";
import { getMyGroup } from "../services/groupService";
import type { MyGroup } from "../services/groupService";
import {
  clearSession,
  getGroupId,
  getJoinCode,
  getLinkedOlderAdultId,
  getOnboardingComplete,
  getSelectedMode,
  setGroupId,
  setJoinCode,
  setLinkedOlderAdultId,
  setOnboardingComplete,
  setSelectedMode,
} from "../storage/localStore";
import type { AppMode } from "../types/database";

type Status = "loading" | "onboarding" | "ready";

type AppStateValue = {
  status: Status;
  mode: AppMode | null;
  olderAdultId: string | null;
  groupId: string | null;
  joinCode: string | null;
  refresh: () => Promise<void>;
  completeSetup: (mode: AppMode, olderAdultId: string) => Promise<void>;
  completeSetupWithGroup: (mode: AppMode, olderAdultId: string, groupId: string, joinCode: string) => Promise<void>;
  chooseMode: (mode: AppMode) => Promise<void>;
  signOut: () => Promise<void>;
};

// BootState — the pure resolution result used by resolveBootState and applied by refresh().
export type BootState = {
  status: "onboarding" | "ready";
  mode: AppMode | null;
  olderAdultId: string | null;
  groupId: string | null;
  joinCode: string | null;
};

// BootDeps — injected dependencies for resolveBootState (enables pure unit testing).
export type BootDeps = {
  checkSession: () => Promise<boolean>;
  readMode: () => Promise<AppMode | null>;
  readOlderAdultId: () => Promise<string | null>;
  readOnboardingComplete: () => Promise<boolean>;
  readGroupId: () => Promise<string | null>;
  readJoinCode: () => Promise<string | null>;
  fetchGroup: () => Promise<MyGroup | null>;
  persistMode: (mode: AppMode) => Promise<void>;
  persistOlderAdultId: (id: string) => Promise<void>;
  persistGroupId: (id: string) => Promise<void>;
  persistJoinCode: (code: string) => Promise<void>;
  persistOnboardingComplete: (value: boolean) => Promise<void>;
};

/**
 * resolveBootState — pure async function that derives the app's boot state.
 * Called by refresh() with real store/service deps. Exported for unit testing.
 */
export async function resolveBootState(deps: BootDeps): Promise<BootState> {
  const session = await deps.checkSession();
  if (!session) {
    return { status: "onboarding", mode: null, olderAdultId: null, groupId: null, joinCode: null };
  }
  const [storedMode, linkedId, onboarded, cachedGroup, cachedCode] = await Promise.all([
    deps.readMode(),
    deps.readOlderAdultId(),
    deps.readOnboardingComplete(),
    deps.readGroupId(),
    deps.readJoinCode(),
  ]);
  if (onboarded && storedMode && linkedId) {
    return {
      status: "ready",
      mode: storedMode,
      olderAdultId: linkedId,
      groupId: cachedGroup,
      joinCode: cachedCode,
    };
  }
  // Session exists but the local link is missing/incomplete → re-derive it from the server.
  const mine = await deps.fetchGroup();
  if (mine && mine.olderAdultId) {
    await Promise.all([
      deps.persistMode(mine.mode),
      deps.persistOlderAdultId(mine.olderAdultId),
      deps.persistGroupId(mine.groupId),
      deps.persistJoinCode(mine.joinCode),
      deps.persistOnboardingComplete(true),
    ]);
    return {
      status: "ready",
      mode: mine.mode,
      olderAdultId: mine.olderAdultId,
      groupId: mine.groupId,
      joinCode: mine.joinCode,
    };
  }
  return {
    status: "onboarding",
    mode: storedMode,
    olderAdultId: linkedId,
    groupId: cachedGroup,
    joinCode: cachedCode,
  };
}

const REAL_BOOT_DEPS: BootDeps = {
  checkSession: hasActiveSession,
  readMode: getSelectedMode,
  readOlderAdultId: getLinkedOlderAdultId,
  readOnboardingComplete: getOnboardingComplete,
  readGroupId: getGroupId,
  readJoinCode: getJoinCode,
  fetchGroup: getMyGroup,
  persistMode: setSelectedMode,
  persistOlderAdultId: setLinkedOlderAdultId,
  persistGroupId: setGroupId,
  persistJoinCode: setJoinCode,
  persistOnboardingComplete: setOnboardingComplete,
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<AppMode | null>(null);
  const [olderAdultId, setOlderAdultId] = useState<string | null>(null);
  const [groupId, setGroupIdState] = useState<string | null>(null);
  const [joinCode, setJoinCodeState] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const boot = await resolveBootState(REAL_BOOT_DEPS);
    setMode(boot.mode);
    setOlderAdultId(boot.olderAdultId);
    setGroupIdState(boot.groupId);
    setJoinCodeState(boot.joinCode);
    setStatus(boot.status);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const chooseMode = useCallback(async (next: AppMode): Promise<void> => {
    await setSelectedMode(next);
    setMode(next);
  }, []);

  const completeSetup = useCallback(async (next: AppMode, id: string): Promise<void> => {
    await Promise.all([setSelectedMode(next), setLinkedOlderAdultId(id), setOnboardingComplete(true)]);
    setMode(next);
    setOlderAdultId(id);
    setStatus("ready");
  }, []);

  const completeSetupWithGroup = useCallback(
    async (next: AppMode, id: string, gid: string, code: string): Promise<void> => {
      await Promise.all([
        setSelectedMode(next),
        setLinkedOlderAdultId(id),
        setGroupId(gid),
        setJoinCode(code),
        setOnboardingComplete(true),
      ]);
      setMode(next);
      setOlderAdultId(id);
      setGroupIdState(gid);
      setJoinCodeState(code);
      setStatus("ready");
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await signOutAll();
    await clearSession();
    setMode(null);
    setOlderAdultId(null);
    setGroupIdState(null);
    setJoinCodeState(null);
    setStatus("onboarding");
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      status,
      mode,
      olderAdultId,
      groupId,
      joinCode,
      refresh,
      completeSetup,
      completeSetupWithGroup,
      chooseMode,
      signOut,
    }),
    [status, mode, olderAdultId, groupId, joinCode, refresh, completeSetup, completeSetupWithGroup, chooseMode, signOut],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
