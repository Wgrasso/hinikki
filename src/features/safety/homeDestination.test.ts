import { resolveHomeDestination } from "./homeDestination";
import type { SafeLocation } from "../../types/database";

function place(overrides: Partial<SafeLocation>): SafeLocation {
  return {
    id: "s1",
    older_adult_id: "oa1",
    name: "Somewhere",
    address: null,
    latitude: null,
    longitude: null,
    radius_meters: 150,
    location_type: null,
    ...overrides,
  };
}

describe("resolveHomeDestination", () => {
  it("prefers the home address when set", () => {
    expect(resolveHomeDestination("Lindenstraat 12, Amsterdam", [place({ name: "Home", address: "Elsewhere 3" })])).toBe(
      "Lindenstraat 12, Amsterdam",
    );
  });

  it("falls back to a safe place named home", () => {
    const safe = [place({ name: "Café", address: "Café 1" }), place({ id: "s2", name: "Home", address: "Thuisstraat 4, Utrecht" })];
    expect(resolveHomeDestination(null, safe)).toBe("Thuisstraat 4, Utrecht");
  });

  it("uses a pin's coordinates when a safe place has no address", () => {
    expect(resolveHomeDestination("", [place({ name: "Home", latitude: 48.14, longitude: 11.53 })])).toBe("48.14,11.53");
  });

  it("returns null when there's nowhere to go", () => {
    expect(resolveHomeDestination(null, [])).toBeNull();
    expect(resolveHomeDestination("   ", [place({ name: "Nowhere" })])).toBeNull();
  });
});
