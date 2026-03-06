import { describe, expect, it } from "vitest";
import { canAccessAdmin, isRole } from "./rbac";

describe("rbac helpers", () => {
  it("isRole validates known roles", () => {
    expect(isRole("STUDENT")).toBe(true);
    expect(isRole("TEACHER")).toBe(true);
    expect(isRole("ADMIN")).toBe(true);
    expect(isRole("INVALID")).toBe(false);
  });

  it("canAccessAdmin only allows ADMIN", () => {
    expect(canAccessAdmin("ADMIN")).toBe(true);
    expect(canAccessAdmin("STUDENT")).toBe(false);
    expect(canAccessAdmin("TEACHER")).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
    expect(canAccessAdmin(undefined)).toBe(false);
  });
});
