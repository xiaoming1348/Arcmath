import { z } from "zod";
// Relative import so this module is consumable from standalone tsx
// scripts (e.g. demo:grade CLI harness) as well as Next.js runtime.
import {
  PROOF_STEP_TYPES,
  PROOF_VERDICTS,
  type ProofStepType,
  type ProofStepVerdict
} from "./ai/proof-tutor";

const BACKENDS = ["SYMPY", "LEAN", "LLM_JUDGE", "GEOGEBRA", "CLASSIFIER_ONLY", "NONE"] as const;
export type ProofVerificationBackend = (typeof BACKENDS)[number];

const classifyResponseSchema = z.object({
  step_type: z.enum(PROOF_STEP_TYPES),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

const verifyResponseSchema = z.object({
  verdict: z.enum(PROOF_VERDICTS),
  backend: z.enum(BACKENDS),
  confidence: z.number().min(0).max(1),
  details: z.record(z.string(), z.unknown()).default({})
});

export type ProofClassifyResult = {
  stepType: ProofStepType;
  confidence: number;
  reason: string;
};

export type ProofVerifyResult = {
  verdict: ProofStepVerdict;
  backend: ProofVerificationBackend;
  confidence: number;
  details: Record<string, unknown>;
};

let missingUrlWarned = false;
function getBaseUrl(): string | null {
  const url = process.env.PROOF_VERIFIER_URL?.trim();
  if (!url || url.length === 0) {
    if (!missingUrlWarned) {
      missingUrlWarned = true;
      console.warn("[proof-verifier] PROOF_VERIFIER_URL not set — all verify/classify calls will fall back to LLM.");
    }
    return null;
  }
  return url.replace(/\/+$/, "");
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const base = getBaseUrl();
  if (!base) {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      console.warn("[proof-verifier] non-200", { path, status: res.status });
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn("[proof-verifier] request failed", {
      path,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyStep(params: {
  latex: string;
  previousSteps?: string[];
}): Promise<ProofClassifyResult | null> {
  const raw = await postJson<unknown>(
    "/classify",
    { latex: params.latex, context_latex: params.previousSteps ?? [] },
    5000
  );
  if (!raw) return null;
  const parsed = classifyResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[proof-verifier] classify schema mismatch", parsed.error.issues);
    return null;
  }
  return {
    stepType: parsed.data.step_type,
    confidence: parsed.data.confidence,
    reason: parsed.data.reason
  };
}

export async function verifyStep(params: {
  stepType: ProofStepType;
  latex: string;
  previousSteps?: string[];
  assumptions?: string[];
}): Promise<ProofVerifyResult | null> {
  const raw = await postJson<unknown>(
    "/verify",
    {
      step_type: params.stepType,
      latex: params.latex,
      context_latex: params.previousSteps ?? [],
      assumptions: params.assumptions ?? []
    },
    15000
  );
  if (!raw) return null;
  const parsed = verifyResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[proof-verifier] verify schema mismatch", parsed.error.issues);
    return null;
  }
  return {
    verdict: parsed.data.verdict,
    backend: parsed.data.backend,
    confidence: parsed.data.confidence,
    details: parsed.data.details
  };
}
