import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@arcmath/db", () => ({
  prisma: {}
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/membership", () => ({
  hasActiveMembership: vi.fn(() => false)
}));

vi.mock("@/lib/resource-pdf-delivery", () => ({
  parsePdfVariant: vi.fn((value: string | null) => (value === "answers" ? "answers" : "problems")),
  getResourcePdfResponse: vi.fn()
}));

import { getServerSession } from "next-auth";
import { prisma } from "@arcmath/db";
import { hasActiveMembership } from "@/lib/membership";
import { getResourcePdfResponse, parsePdfVariant } from "@/lib/resource-pdf-delivery";
import { GET } from "@/app/api/resources/pdf/route";

describe("/api/resources/pdf route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(parsePdfVariant).mockImplementation((value: string | null) =>
      value === "answers" ? "answers" : "problems"
    );
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", role: "STUDENT" }
    } as never);
    vi.mocked(hasActiveMembership).mockReturnValue(false);
    vi.mocked(getResourcePdfResponse).mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70, 45]), {
        status: 200,
        headers: {
          "content-type": "application/pdf"
        }
      })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);

    const response = await GET(new NextRequest("http://localhost:3000/api/resources/pdf?id=set_1"));

    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/resources/pdf"));

    expect(response.status).toBe(400);
  });

  it("uses parsed variant and delegates to shared delivery service", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/resources/pdf?id=set_1&variant=answers")
    );

    expect(response.status).toBe(200);
    expect(parsePdfVariant).toHaveBeenCalledWith("answers");
    expect(getResourcePdfResponse).toHaveBeenCalledWith({
      prisma,
      userId: "u1",
      hasMembership: false,
      problemSetId: "set_1",
      variant: "answers"
    });
  });

  it("defaults to problems variant for unknown variant", async () => {
    await GET(new NextRequest("http://localhost:3000/api/resources/pdf?id=set_1&variant=unknown"));

    expect(parsePdfVariant).toHaveBeenCalledWith("unknown");
    expect(getResourcePdfResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "problems"
      })
    );
  });

  it("passes membership status to delivery service", async () => {
    vi.mocked(hasActiveMembership).mockReturnValue(true);

    await GET(new NextRequest("http://localhost:3000/api/resources/pdf?id=set_1"));

    expect(getResourcePdfResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        hasMembership: true
      })
    );
  });
});
