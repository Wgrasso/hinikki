// factFilter tests — the deterministic opinion net (plan §3.6). The row-7 checklist
// utterance and its Dutch cousins must never pass; plain facts must always pass.
import { looksLikeOpinion, payloadPassesFilter, sanitizeQuote } from "./factFilter";

describe("looksLikeOpinion", () => {
  const opinions = [
    "My son never visits, he is so cruel.",
    "Marie is so annoying lately",
    "I can't stand Bep",
    "he stole from me",
    "She is a liar and always was",
    "Mijn zoon komt nooit, hij is zo gemeen.",
    "Bep is echt irritant",
    "hij heeft gelogen en gestolen",
    "ze geeft niet om mij",
  ];
  it.each(opinions)("flags: %s", (text) => {
    expect(looksLikeOpinion(text)).toBe(true);
  });

  const facts = [
    "Marie visited on Tuesday",
    "My birthday is the third of May",
    "Tom studies in Utrecht",
    "Marie is my friend from choir",
    "I take my coffee with warm milk",
    "Marieke komt zaterdag langs",
    "Mijn verjaardag is drie mei",
  ];
  it.each(facts)("passes: %s", (text) => {
    expect(looksLikeOpinion(text)).toBe(false);
  });

  it("cannot be dodged by curly apostrophes or double spaces", () => {
    expect(looksLikeOpinion("I can\u2019t stand him")).toBe(true);
    expect(looksLikeOpinion("he doesn\u2019t care about me")).toBe(true);
    expect(looksLikeOpinion("I can't  stand her")).toBe(true);
  });

  it("does not flag substrings inside longer words", () => {
    expect(looksLikeOpinion("we went to the domkerk")).toBe(false); // 'dom' inside a word
    expect(looksLikeOpinion("she made a meanly delicious pie")).toBe(false);
  });
});

describe("sanitizeQuote", () => {
  it("drops opinion quotes entirely", () => {
    expect(sanitizeQuote("My son never visits, he is so cruel.")).toBeNull();
  });
  it("caps length at 200 chars", () => {
    const long = "a fact ".repeat(60);
    const out = sanitizeQuote(long);
    expect(out).not.toBeNull();
    expect((out as string).length).toBeLessThanOrEqual(200);
  });
  it("passes clean quotes through trimmed", () => {
    expect(sanitizeQuote("  Marie is my friend from choir  ")).toBe("Marie is my friend from choir");
  });
  it("returns null for empty input", () => {
    expect(sanitizeQuote("")).toBeNull();
    expect(sanitizeQuote(null)).toBeNull();
  });
});

describe("payloadPassesFilter", () => {
  it("accepts fact-shaped payloads", () => {
    expect(
      payloadPassesFilter({ full_name: "Marie", relationship_label: "friend", visit_frequency: "Wednesdays" }),
    ).toBe(true);
  });
  it("rejects payloads smuggling judgments, even nested", () => {
    expect(payloadPassesFilter({ important_notes: "her son is cruel to her" })).toBe(false);
    expect(payloadPassesFilter({ nested: { note: "hij is zo gemeen" } })).toBe(false);
    expect(payloadPassesFilter({ list: ["fine", "she never calls me anymore"] })).toBe(false);
    expect(payloadPassesFilter({ details: [{ note: "your son never visits, he is selfish" }] })).toBe(false);
  });
});
