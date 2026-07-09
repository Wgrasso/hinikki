// src/auth/appState.rehydrate.test.tsx — TDD: verifies server-side rehydration logic via
// resolveBootState(), the pure exported function that refresh() delegates to. No renderer needed.
import { resolveBootState } from "./appState";
import type { BootDeps } from "./appState";
import type { MyGroup } from "../services/groupService";

function noop(): Promise<void> {
  return Promise.resolve();
}

function noopMode(m: import("../types/database").AppMode): Promise<void> {
  void m;
  return Promise.resolve();
}

function baseDeps(overrides: Partial<BootDeps>): BootDeps {
  return {
    checkSession: async (): Promise<boolean> => true,
    readMode: async (): Promise<null> => null,
    readOlderAdultId: async (): Promise<null> => null,
    readOnboardingComplete: async (): Promise<boolean> => false,
    readGroupId: async (): Promise<null> => null,
    readJoinCode: async (): Promise<null> => null,
    fetchGroup: async (): Promise<null> => null,
    persistMode: noopMode,
    persistOlderAdultId: async (_id: string): Promise<void> => noop(),
    persistGroupId: async (_id: string): Promise<void> => noop(),
    persistJoinCode: async (_code: string): Promise<void> => noop(),
    persistOnboardingComplete: async (_v: boolean): Promise<void> => noop(),
    ...overrides,
  };
}

test("a signed-in admin with no local link is rehydrated from getMyGroup()", async () => {
  const mine: MyGroup = { mode: "admin", groupId: "g1", joinCode: "ABC12345", olderAdultId: "o1" };

  const result = await resolveBootState(
    baseDeps({ fetchGroup: async (): Promise<MyGroup> => mine }),
  );

  expect(result).toEqual({
    status: "ready",
    mode: "admin",
    olderAdultId: "o1",
    groupId: "g1",
    joinCode: "ABC12345",
  });
});

test("a principal with no session resolves to onboarding", async () => {
  const result = await resolveBootState(
    baseDeps({ checkSession: async (): Promise<boolean> => false }),
  );

  expect(result).toEqual({
    status: "onboarding",
    mode: null,
    olderAdultId: null,
    groupId: null,
    joinCode: null,
  });
});

test("a fully onboarded user reads from local cache without hitting the server", async () => {
  let fetchCalled = false;
  const result = await resolveBootState(
    baseDeps({
      readMode: async (): Promise<"admin"> => "admin",
      readOlderAdultId: async (): Promise<string> => "o2",
      readOnboardingComplete: async (): Promise<boolean> => true,
      readGroupId: async (): Promise<string> => "g2",
      readJoinCode: async (): Promise<string> => "XYZ99999",
      fetchGroup: async (): Promise<null> => {
        fetchCalled = true;
        return null;
      },
    }),
  );

  expect(fetchCalled).toBe(false);
  expect(result).toEqual({
    status: "ready",
    mode: "admin",
    olderAdultId: "o2",
    groupId: "g2",
    joinCode: "XYZ99999",
  });
});
