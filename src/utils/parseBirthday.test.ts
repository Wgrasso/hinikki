import { parseBirthday } from "./parseBirthday";

describe("parseBirthday", () => {
  it("reads English month names, with or without ordinals", () => {
    expect(parseBirthday("3 May 1952")).toBe("1952-05-03");
    expect(parseBirthday("3rd of May 1952")).toBe("1952-05-03");
    expect(parseBirthday("May 3, 1952")).toBe("1952-05-03");
    expect(parseBirthday("October 12 1948")).toBe("1948-10-12");
  });

  it("reads Dutch month names and ordinals", () => {
    expect(parseBirthday("3 mei 1952")).toBe("1952-05-03");
    expect(parseBirthday("3e mei 1952")).toBe("1952-05-03");
    expect(parseBirthday("12 okt 1948")).toBe("1948-10-12");
    expect(parseBirthday("1 maart 1960")).toBe("1960-03-01");
  });

  it("reads ISO and day-first numeric dates", () => {
    expect(parseBirthday("1952-05-03")).toBe("1952-05-03");
    expect(parseBirthday("3-5-1952")).toBe("1952-05-03");
    expect(parseBirthday("3.5.1952")).toBe("1952-05-03");
    expect(parseBirthday("3 5 1952")).toBe("1952-05-03");
  });

  it("rejects impossible calendar dates", () => {
    expect(parseBirthday("31-2-1950")).toBeNull();
    expect(parseBirthday("1950-02-31")).toBeNull();
    expect(parseBirthday("29 February 1951")).toBeNull();
    expect(parseBirthday("29 February 1952")).toBe("1952-02-29");
  });

  it("rejects out-of-range years and garbage", () => {
    expect(parseBirthday("3 May 1852")).toBeNull();
    expect(parseBirthday("3 May 2999")).toBeNull();
    expect(parseBirthday("")).toBeNull();
    expect(parseBirthday("   ")).toBeNull();
    expect(parseBirthday("sometime in spring")).toBeNull();
    expect(parseBirthday("3 blursday 1952")).toBeNull();
  });
});
