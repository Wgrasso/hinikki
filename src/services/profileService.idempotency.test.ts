import { jest } from "@jest/globals";

// jest.fn(impl) avoids the mockReturnValue/mockResolvedValue generics issue with @jest/globals.
// Only `from` needs to be a tracked jest.fn; the auth helpers are plain arrows.
jest.mock("../lib/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: jest.fn(() => ({
        select: () => ({ single: async () => ({ data: { id: "p1" }, error: null }) }),
      })),
    })),
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
      signInWithPassword: async () => ({ error: null }),
    },
  },
}));

import { adminSignIn } from "./profileService";

type SupabaseMock = { supabase: { from: ReturnType<typeof jest.fn> } };

test("adminSignIn writes BOTH profiles and admin_profiles (idempotent backfill)", async () => {
  const mockModule = jest.requireMock("../lib/supabase") as SupabaseMock;
  const mockFrom = mockModule.supabase.from as ReturnType<typeof jest.fn>;
  mockFrom.mockClear();
  const r = await adminSignIn("a@b.com", "pw");
  expect(r.ok).toBe(true);
  const tables = mockFrom.mock.calls.map((c: unknown[]) => c[0] as string);
  expect(tables).toContain("profiles");
  expect(tables).toContain("admin_profiles");
});
