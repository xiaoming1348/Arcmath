import { describe, expect, it } from "vitest";
import { buildResourcePdfDownloadUrl } from "./page";

describe("resources page download URL builder", () => {
  it("builds problems and answers variant URLs", () => {
    expect(buildResourcePdfDownloadUrl("set_1", "problems")).toBe(
      "/api/resources/pdf?id=set_1&variant=problems"
    );
    expect(buildResourcePdfDownloadUrl("set_1", "answers")).toBe(
      "/api/resources/pdf?id=set_1&variant=answers"
    );
  });

  it("encodes problem set ids safely", () => {
    expect(buildResourcePdfDownloadUrl("set 1/2", "answers")).toBe(
      "/api/resources/pdf?id=set+1%2F2&variant=answers"
    );
  });
});
