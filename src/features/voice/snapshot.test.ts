// snapshot renderer tests — the pure functions that turn rows into spoken-context lines.
// The two-grandsons disambiguation (plan FR-4, checklist row 8) is the load-bearing case.
import type { CalendarEvent, FamilyPerson, FamilyRelationship, PersonMemory } from "../../types/database";
import {
  disambiguationSuffixes,
  neverRaiseNames,
  renderRelationshipSentences,
  selectMemories,
} from "./snapshot";

function person(overrides: Partial<FamilyPerson> & { id: string; full_name: string }): FamilyPerson {
  return {
    older_adult_id: "oa1",
    preferred_name: null,
    relationship_label: null,
    date_of_birth: null,
    pronunciation_help: null,
    phone: null,
    address: null,
    location_description: null,
    visit_frequency: null,
    important_notes: null,
    conversation_hints: null,
    can_nikki_mention: true,
    can_contact_in_emergency: false,
    can_be_called_by_nikki: false,
    is_admin: false,
    preferred_contact_method: null,
    primary_photo_path: null,
    ...overrides,
  };
}

function edge(a: string, b: string, type: string): FamilyRelationship {
  return { id: `${a}-${type}-${b}`, older_adult_id: "oa1", person_a_id: a, person_b_id: b, relationship_type: type, notes: null };
}

const tom = person({ id: "tom", full_name: "Tom", relationship_label: "Grandson" });
const daan = person({ id: "daan", full_name: "Daan", relationship_label: "Grandson" });
const marieke = person({ id: "marieke", full_name: "Marieke", relationship_label: "Daughter" });
const peter = person({ id: "peter", full_name: "Peter", relationship_label: "Son" });

describe("disambiguationSuffixes — the two-grandsons rule", () => {
  it("distinguishes two grandsons by their child_of parents", () => {
    const suffixes = disambiguationSuffixes(
      [tom, daan, marieke, peter],
      [edge("tom", "marieke", "child_of"), edge("daan", "peter", "child_of")],
    );
    expect(suffixes.get("tom")).toBe("Marieke's son");
    expect(suffixes.get("daan")).toBe("Peter's son");
  });

  it("falls back to location, then visit rhythm, without edges", () => {
    const a = person({ id: "a", full_name: "Tom", relationship_label: "Grandson", location_description: "in Utrecht" });
    const b = person({ id: "b", full_name: "Daan", relationship_label: "Grandson", visit_frequency: "on Saturdays" });
    const suffixes = disambiguationSuffixes([a, b], []);
    expect(suffixes.get("a")).toBe("the one who lives in Utrecht");
    expect(suffixes.get("b")).toBe("the one who visits on Saturdays");
  });

  it("adds nothing when a label is unique", () => {
    const suffixes = disambiguationSuffixes([tom, marieke], [edge("tom", "marieke", "child_of")]);
    expect(suffixes.size).toBe(0);
  });
});

describe("renderRelationshipSentences", () => {
  it("renders directional and symmetric edges as sentences", () => {
    const marie = person({ id: "marie", full_name: "Marie" });
    const bep = person({ id: "bep", full_name: "Bep" });
    const sentences = renderRelationshipSentences(
      [tom, marieke, marie, bep],
      [edge("tom", "marieke", "child_of"), edge("bep", "marie", "friend_of")],
    );
    expect(sentences).toContain("Tom is Marieke's child");
    expect(sentences).toContain("Bep and Marie are friends");
  });

  it("skips edges touching suppressed people", () => {
    const hidden = person({ id: "hidden", full_name: "Willem", can_nikki_mention: false });
    const sentences = renderRelationshipSentences([tom, hidden], [edge("tom", "hidden", "child_of")]);
    expect(sentences).toHaveLength(0);
  });
});

describe("selectMemories — relevance over recency", () => {
  const mem = (id: string, personId: string | null): PersonMemory => ({
    id, older_adult_id: "oa1", person_id: personId, title: id, description: null, approximate_date: null, can_nikki_mention: true,
  });
  const eventWith = (companion: string): CalendarEvent => ({
    id: "e1", older_adult_id: "oa1", title: "Cards", event_type: null,
    start_at: new Date().toISOString(), end_at: null, location_name: null, location_address: null,
    what_to_bring: null, transport_notes: null, companion, announce_lead_minutes: null,
    nikki_before_event_message: null, calming_explanation: null, user_friendly_summary: null,
    priority_level: "normal", may_cause_stress: false, completion_status: "scheduled",
  });

  it("puts memories about today's companion first and caps the list", () => {
    const marie = person({ id: "marie", full_name: "Marie" });
    const memories = [mem("m1", null), mem("m2", null), mem("m3", "marie"), mem("m4", null), mem("m5", null), mem("m6", null)];
    const selected = selectMemories(memories, [eventWith("Marie")], [marie], 5);
    expect(selected).toHaveLength(5);
    expect(selected[0].id).toBe("m3");
  });

  it("excludes mention-off memories entirely", () => {
    const hiddenMem = { ...mem("mh", null), can_nikki_mention: false };
    expect(selectMemories([hiddenMem], [], [])).toHaveLength(0);
  });
});

describe("neverRaiseNames", () => {
  it("returns names of suppressed people only", () => {
    const hidden = person({ id: "h", full_name: "Willem", can_nikki_mention: false });
    expect(neverRaiseNames([tom, hidden])).toEqual(["Willem"]);
  });
});
