import { jest } from "@jest/globals";

jest.mock("../lib/supabase", () => ({
  supabase: {
    rpc: jest.fn(),
    // getSession is not asserted on; plain arrow avoids jest.fn generics issue
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
  },
}));
jest.mock("./profileService", () => ({ ensureAnonSession: async () => undefined }));

import { adminCreateHousehold, joinGroupAsAdmin, getMyGroup } from "./groupService";

type SupabaseMock = { supabase: { rpc: ReturnType<typeof jest.fn> } };

function getRpc(): ReturnType<typeof jest.fn> {
  return (jest.requireMock("../lib/supabase") as SupabaseMock).supabase.rpc as ReturnType<
    typeof jest.fn
  >;
}

beforeEach(() => getRpc().mockReset());

test("adminCreateHousehold returns the household handle", async () => {
  getRpc().mockResolvedValueOnce({
    data: { group_id: "g1", join_code: "ABCD2345", older_adult_id: "o1" },
    error: null,
  });
  const r = await adminCreateHousehold("Our family", "Anna");
  expect(getRpc()).toHaveBeenCalledWith("admin_create_household", {
    p_group_name: "Our family",
    p_older_adult_name: "Anna",
  });
  expect(r).toEqual({ groupId: "g1", joinCode: "ABCD2345", olderAdultId: "o1" });
});

test("joinGroupAsAdmin surfaces a real error message, not a generic one", async () => {
  getRpc().mockResolvedValueOnce({ data: null, error: { message: "invalid code" } });
  const r = await joinGroupAsAdmin("ZZZZ9999");
  expect(r).toEqual({
    ok: false,
    message: "That code didn't match a household. Please double-check it.",
  });
});

test("getMyGroup maps the rehydration payload", async () => {
  getRpc().mockResolvedValueOnce({
    data: { mode: "admin", group_id: "g1", join_code: "ABCD2345", older_adult_id: "o1" },
    error: null,
  });
  const r = await getMyGroup();
  expect(r).toEqual({ mode: "admin", groupId: "g1", joinCode: "ABCD2345", olderAdultId: "o1" });
});

test("getMyGroup retries on a transient rpc error and returns null without throwing", async () => {
  getRpc().mockResolvedValue({ data: null, error: { message: "network error" } });
  const r = await getMyGroup();
  expect(r).toBeNull();
  expect(getRpc()).toHaveBeenCalledTimes(2);
});
