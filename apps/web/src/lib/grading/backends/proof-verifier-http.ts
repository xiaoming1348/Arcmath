/**
 * HTTP backends that talk to the Python `services/proof-verifier`
 * (currently Fly.io: https://arcmath-proof-verifier.fly.dev).
 *
 * Two backends are exposed here because the verifier service exposes
 * one /verify endpoint but routes internally — SymPy for algebra/
 * (in)equalities, Lean for CLAIMs. We split them so the v2 fan-out can
 * record source-specific evidence cleanly and so failures on one path
 * (Lean toolchain unavailable) don't taint the other.
 */

import type { Backend } from "../backends";
import { extractProblemHypotheses } from "../problem-hypotheses";
import type { BackendVote, StepInput, StepType } from "../types";

const DEFAULT_TIMEOUT_MS = 20_000;
// CLAIM steps run /prove on the verifier which autoformalizes →
// completes → kernel-verifies; that can take 60-180 s on Mathlib-heavy
// goals. Give it a real budget.
const LEAN_TIMEOUT_MS = 4 * 60_000;

type PyVerdict = "VERIFIED" | "PLAUSIBLE" | "UNKNOWN" | "INVALID" | "ERROR";
type PyBackend =
  | "SYMPY"
  | "LEAN"
  | "LLM_JUDGE"
  | "GEOGEBRA"
  | "CLASSIFIER_ONLY"
  | "NONE";

type PyVerifyResponse = {
  verdict: PyVerdict;
  backend: PyBackend;
  confidence: number;
  details: Record<string, unknown>;
};

export type HttpFetcher = (
  url: string,
  init: RequestInit
) => Promise<Response>;

function getBaseUrl(envUrl: string | undefined): string | null {
  const url = envUrl?.trim();
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

/**
 * Heuristic: extract equality/inequality "assumptions" from previous
 * proof steps so SymPy can use them when verifying the current step.
 *
 * Example: prior step `x + y = 5` → assumption "x + y = 5". This is what
 * unblocks multi-step derivations like
 *
 *     (x+y)^2 = x^2 + 2xy + y^2     # algebraic identity, no assumption
 *     25 = x^2 + 2*6 + y^2           # needs x+y=5 AND xy=6 assumed
 *     x^2 + y^2 = 13                 # follows
 *
 * Without hypotheses the second step is just "an equation with free
 * variables", and SymPy's numeric probe will (correctly) find
 * counterexamples and call it INVALID. Wrong! We want SymPy to ABSTAIN
 * (so escalation gate can route to teacher or LLM judge) or, ideally,
 * to verify it conditionally on the given hypotheses.
 *
 * We pass every prior step verbatim; the Python side picks the ones it
 * can parse and feeds them to its solver as hypotheses.
 */
function extractAssumptions(previousSteps: string[]): string[] {
  return previousSteps
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 10); // cap so the prompt does not blow up
}

async function postVerify(
  fetcher: HttpFetcher,
  base: string,
  stepType: StepType,
  latex: string,
  previousSteps: string[],
  problemHypotheses: string[],
  timeoutMs: number
): Promise<PyVerifyResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Problem-statement hypotheses go FIRST in the assumptions list so
    // SymPy's solver sees them before the (often noisier) prior steps.
    const assumptions = [
      ...problemHypotheses,
      ...extractAssumptions(previousSteps)
    ].slice(0, 12);
    const res = await fetcher(`${base}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step_type: stepType,
        latex,
        context_latex: previousSteps,
        assumptions
      }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    return (await res.json()) as PyVerifyResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const SYMPY_HANDLES: ReadonlyArray<StepType> = [
  "ALGEBRAIC_EQUIVALENCE",
  "EQUATION",
  "INEQUALITY"
];
const LEAN_HANDLES: ReadonlyArray<StepType> = ["CLAIM"];

function makeVote(
  source: "SYMPY" | "LEAN",
  resp: PyVerifyResponse | null,
  errorEvidence: string
): BackendVote {
  if (!resp) {
    return {
      source,
      outcome: "ABSTAIN",
      confidence: 0,
      evidence: errorEvidence,
      details: { stage: "workspace_missing" }
    };
  }
  // PLAUSIBLE in the Python verifier means "probes pass but not proven".
  // We do NOT treat that as VERIFIED — it must be ABSTAIN so the merge
  // layer's "deterministic VERIFIED" guarantee holds.
  switch (resp.verdict) {
    case "VERIFIED":
      return {
        source,
        outcome: "VERIFIED",
        confidence: resp.confidence,
        evidence: shortEvidence(resp),
        details: resp.details
      };
    case "INVALID":
      return {
        source,
        outcome: "INVALID",
        confidence: resp.confidence,
        evidence: shortEvidence(resp),
        details: resp.details
      };
    case "PLAUSIBLE":
    case "UNKNOWN":
      return {
        source,
        outcome: "ABSTAIN",
        confidence: resp.confidence,
        evidence: `${source} returned ${resp.verdict}: ${shortEvidence(resp)}`,
        details: resp.details
      };
    case "ERROR":
      // We surface the parse/stage so the escalation gate can flag
      // PARSER_FAILED appropriately.
      return {
        source,
        outcome: "ABSTAIN",
        confidence: 0,
        evidence: `${source} ERROR: ${shortEvidence(resp)}`,
        details: { ...resp.details, stage: resp.details.stage ?? "parse" }
      };
  }
}

function shortEvidence(resp: PyVerifyResponse): string {
  const d = resp.details;
  if (typeof d.note === "string") return d.note;
  if (typeof d.reason === "string") return d.reason;
  if (typeof d.stage === "string") return `stage=${d.stage}`;
  return JSON.stringify(d).slice(0, 240);
}

export type ProofVerifierBackendsConfig = {
  url?: string;
  fetcher?: HttpFetcher;
  sympyTimeoutMs?: number;
  leanTimeoutMs?: number;
};

/**
 * Heuristic guard: input is a multi-variable substitution declaration
 * like "n=1, a=1, b=2, c=2" rather than an algebraic identity.
 *
 * Why a TS-side check: SymPy's `parse_latex` silently truncates at the
 * first comma, so `parse_latex("1, a=1, b=2, c=2.")` returns just `1`.
 * The downstream `_verify_equation` then concludes "n = 1 is INVALID
 * because it doesn't hold for all n". We saw this exact pattern in
 * pilot testing (Putnam B5 substitution claim).
 *
 * We catch the pattern client-side so the false-INVALID can't surface
 * even before the Python service has a chance to mishandle it. The
 * Python verifier got the same guard in services/proof-verifier; this
 * TS check is defense-in-depth and unblocks pilot testing without
 * waiting for a Fly.io redeploy.
 */
function looksLikeSubstitutionDeclaration(latex: string): boolean {
  const trimmed = latex.trim().replace(/\.$/, "");
  const parts = trimmed.split(",").map((s) => s.trim());
  if (parts.length < 2) return false;
  // Each part should look like `<name> = <value>` outside braces.
  let eqCount = 0;
  for (const part of parts) {
    if (/^[\s]*[A-Za-z_]\w*\s*=\s*[^=]/.test(part)) {
      eqCount += 1;
    }
  }
  return eqCount >= 2;
}

export function makeSympyBackend(
  config: ProofVerifierBackendsConfig = {}
): Backend {
  const base = getBaseUrl(config.url ?? process.env.PROOF_VERIFIER_URL);
  const fetcher = config.fetcher ?? fetch;
  const timeout = config.sympyTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: "sympy-http",
    deterministic: true,
    handles: SYMPY_HANDLES,
    async verify(step: StepInput): Promise<BackendVote> {
      // Bail before even talking to the Python service when the input
      // is a substitution declaration. See helper docstring.
      if (looksLikeSubstitutionDeclaration(step.latex)) {
        return {
          source: "SYMPY",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence:
            "Step looks like a substitution declaration (var=val, var=val, …); not an algebraic identity SymPy can judge.",
          details: { stage: "substitution_declaration_skip" }
        };
      }
      if (!base) {
        return {
          source: "SYMPY",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: "PROOF_VERIFIER_URL not configured",
          details: { stage: "workspace_missing" }
        };
      }
      // The Python /verify expects a step_type; we pass the same one the
      // pipeline classified into. SymPy only handles algebra/eq/ineq —
      // anything else short-circuits to ABSTAIN via the verifier itself.
      const stepType =
        step.previousSteps.length === 0 && step.latex.includes("=")
          ? "EQUATION"
          : step.latex.includes("\\leq") ||
              step.latex.includes("\\geq") ||
              /[<>≤≥]/.test(step.latex)
            ? "INEQUALITY"
            : "ALGEBRAIC_EQUIVALENCE";
      // Pull hypotheses from the problem prose so SymPy can use them as
      // constraints when verifying intermediate substitutions.
      let problemHypotheses: string[] = [];
      try {
        problemHypotheses = await extractProblemHypotheses(
          step.problemStatement
        );
      } catch {
        // Hypothesis extraction is best-effort; if the LLM call fails we
        // proceed without it (escalation gate will catch wrongly-routed
        // INVALIDs via teacher review).
      }
      const resp = await postVerify(
        fetcher,
        base,
        stepType,
        step.latex,
        step.previousSteps,
        problemHypotheses,
        timeout
      );
      return makeVote("SYMPY", resp, "sympy backend unreachable");
    }
  };
}

export function makeLeanClaimBackend(
  config: ProofVerifierBackendsConfig = {}
): Backend {
  const base = getBaseUrl(config.url ?? process.env.PROOF_VERIFIER_URL);
  const fetcher = config.fetcher ?? fetch;
  const timeout = config.leanTimeoutMs ?? LEAN_TIMEOUT_MS;

  return {
    name: "lean-claim-http",
    deterministic: true,
    handles: LEAN_HANDLES,
    async verify(step: StepInput): Promise<BackendVote> {
      if (!base) {
        return {
          source: "LEAN",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: "PROOF_VERIFIER_URL not configured",
          details: { stage: "workspace_missing" }
        };
      }
      // Lean backend benefits less from algebraic hypotheses (those go
      // into SymPy), but we still pass them through so the verifier
      // service can decide. Hypothesis extraction is best-effort.
      let problemHypotheses: string[] = [];
      try {
        problemHypotheses = await extractProblemHypotheses(
          step.problemStatement
        );
      } catch {
        // ignore — best-effort
      }
      const resp = await postVerify(
        fetcher,
        base,
        "CLAIM",
        step.latex,
        step.previousSteps,
        problemHypotheses,
        timeout
      );
      return makeVote("LEAN", resp, "lean backend unreachable");
    }
  };
}
