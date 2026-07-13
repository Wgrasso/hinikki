import { hasSafeDestination, nearestSafeDestination } from "./homeDestination";
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

describe("nearestSafeDestination", () => {
  it("picks the closest safe place to the current location", () => {
    const munich = place({ id: "m", name: "Home", latitude: 48.137, longitude: 11.575 });
    const berlin = place({ id: "b", name: "Sister", latitude: 52.52, longitude: 13.405 });
    const current = { latitude: 48.15, longitude: 11.58 }; // near Munich
    expect(nearestSafeDestination(current, [berlin, munich])).toBe("48.137,11.575");
  });

  it("prefers a place named home when there's no current fix", () => {
    const safe = [place({ id: "c", name: "Café", address: "Café 1" }), place({ id: "h", name: "Home", address: "Thuisstraat 4" })];
    expect(nearestSafeDestination(null, safe)).toBe("Thuisstraat 4");
  });

  it("returns an address over coordinates when the nearest place has one", () => {
    const p = place({ name: "Home", address: "Lindenstraat 12", latitude: 52.1, longitude: 4.9 });
    expect(nearestSafeDestination({ latitude: 52.1, longitude: 4.9 }, [p])).toBe("Lindenstraat 12");
  });

  it("is null when there are no usable safe places", () => {
    expect(nearestSafeDestination(null, [])).toBeNull();
    expect(nearestSafeDestination(null, [place({ name: "Nowhere" })])).toBeNull();
  });
});

describe("hasSafeDestination", () => {
  it("is true only when a place has an address or a pin", () => {
    expect(hasSafeDestination([place({ name: "Home", latitude: 1, longitude: 2 })])).toBe(true);
    expect(hasSafeDestination([place({ name: "Home", address: "X 1" })])).toBe(true);
    expect(hasSafeDestination([place({ name: "Home" })])).toBe(false);
    expect(hasSafeDestination([])).toBe(false);
  });
});
