import { formatTime, greeting, initials, relativeTimeLabel } from "./format";

describe("formatTime", () => {
  it("formats on-the-hour and minutes with am/pm", () => {
    expect(formatTime("2026-06-29T09:00:00")).toBe("9 am");
    expect(formatTime("2026-06-29T11:30:00")).toBe("11:30 am");
    expect(formatTime("2026-06-29T14:05:00")).toBe("2:05 pm");
  });
  it("returns empty string for null or invalid input", () => {
    expect(formatTime(null)).toBe("");
    expect(formatTime("not-a-date")).toBe("");
  });
});

describe("greeting", () => {
  it("varies by time of day", () => {
    expect(greeting(new Date(2026, 0, 1, 9, 0))).toBe("Good morning");
    expect(greeting(new Date(2026, 0, 1, 14, 0))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 0, 1, 20, 0))).toBe("Good evening");
  });
});

describe("initials", () => {
  it("builds initials from one or two names", () => {
    expect(initials("Sophie de Vries")).toBe("SV");
    expect(initials("Anna")).toBe("A");
    expect(initials("")).toBe("?");
  });
});

describe("relativeTimeLabel", () => {
  const now = new Date(2026, 0, 1, 12, 0, 0);
  it("describes recent times in plain words", () => {
    expect(relativeTimeLabel(new Date(2026, 0, 1, 11, 55, 0).toISOString(), now)).toBe("5 minutes ago");
    expect(relativeTimeLabel(null, now)).toBe("not yet shared");
  });
});
