import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { appRouter } from "@/lib/trpc/router";

function makeSession(): Session {
  return {
    user: {
      id: "user_1",
      email: "student@example.com",
      name: "Student",
      role: "STUDENT"
    },
    expires: new Date(Date.now() + 60_000).toISOString()
  };
}

describe("appRouter smoke", () => {
  it("healthcheck returns ok + time", async () => {
    const caller = appRouter.createCaller({
      prisma: {} as never,
      session: null
    });

    const result = await caller.healthcheck();

    expect(result.status).toBe("ok");
    expect(typeof result.time).toBe("string");
  });

  it("currentUser returns null without session", async () => {
    const caller = appRouter.createCaller({
      prisma: {} as never,
      session: null
    });

    const result = await caller.currentUser();
    expect(result).toBeNull();
  });

  it("currentUser returns session user", async () => {
    const caller = appRouter.createCaller({
      prisma: {} as never,
      session: makeSession()
    });

    const result = await caller.currentUser();

    expect(result?.email).toBe("student@example.com");
    expect(result?.role).toBe("STUDENT");
  });
});
