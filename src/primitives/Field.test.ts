// Tests for the "tap again to accept the example placeholder" helper.
import { suggestionFrom } from "./Field";

describe("suggestionFrom", () => {
  it("strips the English 'e.g.' lead-in", () => {
    expect(suggestionFrom("e.g. Alex")).toBe("Alex");
    expect(suggestionFrom("e.g. Sophie de Vries")).toBe("Sophie de Vries");
    expect(suggestionFrom("e.g. 3 May 1952 or 1952-05-03")).toBe("3 May 1952 or 1952-05-03");
  });

  it("strips the Dutch 'bijv.' lead-in", () => {
    expect(suggestionFrom("bijv. Alex")).toBe("Alex");
    expect(suggestionFrom("bijvoorbeeld Thuis")).toBe("Thuis");
  });

  it("tolerates a comma and odd spacing after the lead-in", () => {
    expect(suggestionFrom("e.g.,  Mark")).toBe("Mark");
    expect(suggestionFrom("  e.g.   Home ")).toBe("Home");
  });

  it("returns null for placeholders that are not examples", () => {
    expect(suggestionFrom("Optional")).toBeNull();
    expect(suggestionFrom("Name")).toBeNull();
    expect(suggestionFrom(undefined)).toBeNull();
    expect(suggestionFrom("e.g.")).toBeNull(); // marker with nothing after it
  });
});
