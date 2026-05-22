import { describe, expect, it } from "vitest";
import {
  makeLeanClaimBackend,
  makeSympyBackend,
  type HttpFetcher
} from "@/lib/grading/backends/proof-verifier-http";
import type { StepInput } from "@/lib/grading/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function makeFetcher(handler: (url: string, body: unknown) => Response): HttpFetcher {
  return async (url, init) => {
    const body = init.body ? JSON.parse(init.body as string) : null;
    return handler(url, body);
  };
}

const baseInput: StepInput = {
  problemStatement: "p",
  latex: "a + b = b + a",
  previousSteps: []
};

describe("SymPy HTTP backend", () => {
  it("returns ABSTAIN when no PROOF_VERIFIER_URL configured", async () => {
    const backend = makeSympyBackend({ url: "" });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.evidence).toContain("not configured");
  });

  it("maps VERIFIED → VERIFIED", async () => {
    const fetcher = makeFetcher(() =>
      jsonResponse({
        verdict: "VERIFIED",
        backend: "SYMPY",
        confidence: 0.98,
        details: { stage: "symbolic", note: "diff simplified to 0" }
      })
    );
    const backend = makeSympyBackend({
      url: "https://verifier.example",
      fetcher
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("VERIFIED");
    expect(vote.confidence).toBe(0.98);
    expect(vote.source).toBe("SYMPY");
  });

  it("maps INVALID → INVALID", async () => {
    const fetcher = makeFetcher(() =>
      jsonResponse({
        verdict: "INVALID",
        backend: "SYMPY",
        confidence: 0.9,
        details: { stage: "numeric_probe", counterexamples: [{ x: 0.5 }] }
      })
    );
    const backend = makeSympyBackend({
      url: "https://verifier.example",
      fetcher
    });
    const vote = await backend.verify({
      ...baseInput,
      latex: "x^2 < 0"
    });
    expect(vote.outcome).toBe("INVALID");
  });

  it("maps PLAUSIBLE → ABSTAIN (never claim VERIFIED on probes only)", async () => {
    const fetcher = makeFetcher(() =>
      jsonResponse({
        verdict: "PLAUSIBLE",
        backend: "SYMPY",
        confidence: 0.6,
        details: { stage: "numeric_probe" }
      })
    );
    const backend = makeSympyBackend({
      url: "https://verifier.example",
      fetcher
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.evidence).toContain("PLAUSIBLE");
  });

  it("maps ERROR → ABSTAIN with parse stage so escalation can fire", async () => {
    const fetcher = makeFetcher(() =>
      jsonResponse({
        verdict: "ERROR",
        backend: "SYMPY",
        confidence: 0.0,
        details: { stage: "parse", error: "antlr blew up" }
      })
    );
    const backend = makeSympyBackend({
      url: "https://verifier.example",
      fetcher
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.details?.stage).toBe("parse");
  });

  it("treats non-200 HTTP as workspace_missing", async () => {
    const fetcher: HttpFetcher = async () =>
      new Response("oops", { status: 500 });
    const backend = makeSympyBackend({
      url: "https://verifier.example",
      fetcher
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.details?.stage).toBe("workspace_missing");
  });

  it("treats fetch exception as workspace_missing", async () => {
    const fetcher: HttpFetcher = async () => {
      throw new Error("network down");
    };
    const backend = makeSympyBackend({
      url: "https://verifier.example",
      fetcher
    });
    const vote = await backend.verify(baseInput);
    expect(vote.outcome).toBe("ABSTAIN");
    expect(vote.details?.stage).toBe("workspace_missing");
  });

  it("only handles algebra/eq/ineq step types", () => {
    const backend = makeSympyBackend({ url: "" });
    expect(backend.handles).toContain("EQUATION");
    expect(backend.handles).toContain("ALGEBRAIC_EQUIVALENCE");
    expect(backend.handles).toContain("INEQUALITY");
    expect(backend.handles).not.toContain("CLAIM");
  });
});

describe("Lean CLAIM HTTP backend", () => {
  it("posts CLAIM step type", async () => {
    const received: { stepType?: string } = {};
    const fetcher = makeFetcher((_url, body) => {
      received.stepType = (body as { step_type?: string }).step_type;
      return jsonResponse({
        verdict: "VERIFIED",
        backend: "LEAN",
        confidence: 0.99,
        details: { stage: "claim_via_prove" }
      });
    });
    const backend = makeLeanClaimBackend({
      url: "https://verifier.example",
      fetcher
    });
    const vote = await backend.verify({
      ...baseInput,
      latex: "There exist infinitely many primes."
    });
    expect(received.stepType).toBe("CLAIM");
    expect(vote.outcome).toBe("VERIFIED");
    expect(vote.source).toBe("LEAN");
  });

  it("only handles CLAIM", () => {
    const backend = makeLeanClaimBackend({ url: "" });
    expect(backend.handles).toEqual(["CLAIM"]);
  });
});
