import { detectIntent, extractName } from "./intent";

describe("detectIntent", () => {
  it("classifies emergencies first and as high safety", () => {
    expect(detectIntent("I fell and cannot get up").intent).toBe("emergency");
    expect(detectIntent("I fell").safety).toBe("emergency");
    expect(detectIntent("I need help").intent).toBe("emergency");
  });

  it("classifies lost with caution safety", () => {
    const r = detectIntent("I am lost");
    expect(r.intent).toBe("lost");
    expect(r.safety).toBe("caution");
  });

  it("classifies everyday questions", () => {
    expect(detectIntent("What am I doing today?").intent).toBe("today_schedule");
    expect(detectIntent("What is the weather?").intent).toBe("weather_question");
    expect(detectIntent("Who is Sophie?").intent).toBe("person_lookup");
    expect(detectIntent("Tell me about my medication").intent).toBe("medication_reminder");
  });

  it("falls back to companion / unknown", () => {
    expect(detectIntent("Hello there").intent).toBe("general_companion");
    expect(detectIntent("").intent).toBe("unknown");
  });
});

describe("extractName", () => {
  it("pulls a capitalised name and skips question words", () => {
    expect(extractName("Who is Sophie?")).toBe("Sophie");
    expect(extractName("Show me my grandson")).toBeNull();
  });
});
