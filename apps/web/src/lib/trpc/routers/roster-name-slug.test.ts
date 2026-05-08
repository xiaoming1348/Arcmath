import { describe, expect, it } from "vitest";
import { rosterNameToSlug } from "./org-admin";

describe("rosterNameToSlug", () => {
  // Pinyin transcription: the original use case.
  it("transcribes Chinese characters to lowercase pinyin with hyphens", () => {
    expect(rosterNameToSlug("王伟")).toBe("wang-wei");
    expect(rosterNameToSlug("李小红")).toBe("li-xiao-hong");
    expect(rosterNameToSlug("张三")).toBe("zhang-san");
  });

  // The bug we're guarding against: pinyin-pro's default `nonZh` setting
  // splits every ASCII character into its own pinyin token, which gave
  // us "j-e-n-n-y-l-i-n" instead of "jenny-lin". `nonZh: "consecutive"`
  // is the fix; this test pins it.
  it("keeps ASCII names intact (not split letter-by-letter)", () => {
    expect(rosterNameToSlug("Jenny Lin")).toBe("jenny-lin");
    expect(rosterNameToSlug("Bob Smith")).toBe("bob-smith");
    expect(rosterNameToSlug("MS. ANDERSON")).toBe("ms-anderson");
  });

  // Mixed names — international schools have these all the time
  // (Chinese given name, Western surname or vice versa).
  it("handles mixed Chinese + ASCII names", () => {
    expect(rosterNameToSlug("王 Tom")).toBe("wang-tom");
    expect(rosterNameToSlug("李小红 Anna")).toBe("li-xiao-hong-anna");
    expect(rosterNameToSlug("Tom 张")).toBe("tom-zhang");
  });

  // Edge cases: punctuation, whitespace, empty.
  it("squashes non-alphanumeric runs to a single hyphen", () => {
    expect(rosterNameToSlug("Ms. Lin (Y3)")).toBe("ms-lin-y3");
    expect(rosterNameToSlug("  spaced  out  ")).toBe("spaced-out");
    expect(rosterNameToSlug("dot.heavy.name")).toBe("dot-heavy-name");
  });

  it("falls back to 'user' for empty / unprintable input", () => {
    expect(rosterNameToSlug("")).toBe("user");
    expect(rosterNameToSlug("   ")).toBe("user");
    expect(rosterNameToSlug("---")).toBe("user");
  });
});
