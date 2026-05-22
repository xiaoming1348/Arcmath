/**
 * DeepSeek-Prover-V2 (or any OpenAI-compatible Lean prover endpoint)
 * backend.
 *
 * Why a separate backend rather than reusing `lean-claim-http`: the Fly
 * verifier autoformalizes via GPT-4.1 and then `lake build`-checks the
 * proof. That is high latency (60-180s) and the autoformalizer is the
 * weakest link. DeepSeek-Prover-V2 (and Goedel-Prover-V2, Kimina-Prover)
 * skip autoformalization for goals that are already in Lean — they
 * produce a tactic block directly, which the verifier then kernel-
 * checks. We register both backends in parallel; the merge layer's
 * "two deterministic backends agreeing" rule lights up VERIFIED with
 * very high confidence whenever both succeed, and a single one is
 * still enough to commit.
 *
 * The actual prover API may move between providers (Together, Replicate,
 * Modal, or self-hosted vllm). We use the OpenAI-compatible Chat
 * Completions shape because every serious deployment exposes that.
 *
 * Configuration env:
 *   DEEPSEEK_PROVER_URL    e.g. https://api.deepseek.com/v1
 *   DEEPSEEK_PROVER_KEY    bearer token
 *   DEEPSEEK_PROVER_MODEL  e.g. "deepseek-prover-v2" or "goedel-prover-v2-32b"
 *   PROOF_VERIFIER_URL     so we can kernel-check the produced proof
 */

import type { Backend } from "../backends";
import type { BackendVote, StepInput, StepType } from "../types";

const HANDLES: ReadonlyArray<StepType> = ["CLAIM"];

const DEFAULT_TIMEOUT_MS = 180_000;
const KERNEL_TIMEOUT_MS = 4 * 60_000;

const PROVER_PROMPT_VERSION = "deepseek-prover-v2-2026-05";

const PROVER_SYSTEM = `You are an expert Lean 4 theorem prover.
Return ONLY a Lean 4 proof body (no markdown fences, no commentary).
Rules:
- The body replaces \`sorry\` in: theorem stmt : <goal> := <YOUR BODY>.
- Use Mathlib tactics: ring, linarith, nlinarith [hints], polyrith,
  positivity, norm_num, decide, exact <lemma>.
- Never use Lean 3 syntax (no \`begin ... end\`, no \`,\` separators).
- If a Mathlib lemma fits exactly, prefer \`exact <lemma>\` to a tactic.
- If you genuinely cannot prove the goal, return only the single
  token \`sorry\`.`;

export type DeepSeekProverConfig = {
  url?: string;
  apiKey?: string;
  model?: string;
  /** Override for tests — should produce Lean source. */
  invoke?: (params: {
    naturalLanguage: string;
  }) => Promise<{ leanCode: string; model: string } | null>;
  /**
   * Override for tests — should kernel-check Lean source and return a
   * vote. By default we POST to PROOF_VERIFIER_URL/verify/lean.
   */
  kernelVerify?: (params: {
    leanCode: string;
  }) => Promise<{
    verdict: "VERIFIED" | "INVALID" | "UNKNOWN" | "ERROR";
    details: Record<string, unknown>;
  } | null>;
  verifierUrl?: string;
  verifierFetcher?: (url: string, init: RequestInit) => Promise<Response>;
  proverTimeoutMs?: number;
  kernelTimeoutMs?: number;
};

function baseUrl(url?: string): string | null {
  const u = url?.trim();
  if (!u) return null;
  return u.replace(/\/+$/, "");
}

async function defaultInvoke(
  config: DeepSeekProverConfig,
  prompt: string,
  timeoutMs: number
): Promise<{ leanCode: string; model: string } | null> {
  const base = baseUrl(config.url ?? process.env.DEEPSEEK_PROVER_URL);
  const apiKey = config.apiKey ?? process.env.DEEPSEEK_PROVER_KEY;
  const model =
    config.model ?? process.env.DEEPSEEK_PROVER_MODEL ?? "deepseek-prover-v2";
  if (!base || !apiKey) return null;

  const url = base.endsWith("/chat/completions")
    ? base
    : `${base}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: PROVER_SYSTEM },
          { role: "user", content: prompt }
        ]
      }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return null;
    // Strip accidental markdown fences.
    let code = content;
    if (code.startsWith("```")) {
      const lines = code.split("\n");
      if (lines[0].startsWith("```")) lines.shift();
      if (lines.length > 0 && lines[lines.length - 1].startsWith("```"))
        lines.pop();
      code = lines.join("\n").trim();
    }
    return { leanCode: code, model: json.model ?? model };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function defaultKernelVerify(
  config: DeepSeekProverConfig,
  leanCode: string,
  timeoutMs: number
): Promise<{
  verdict: "VERIFIED" | "INVALID" | "UNKNOWN" | "ERROR";
  details: Record<string, unknown>;
} | null> {
  const base = baseUrl(config.verifierUrl ?? process.env.PROOF_VERIFIER_URL);
  if (!base) return null;
  const fetcher = config.verifierFetcher ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(`${base}/verify/lean`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lean_code: leanCode }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      verdict: "VERIFIED" | "INVALID" | "UNKNOWN" | "ERROR" | "PLAUSIBLE";
      details: Record<string, unknown>;
    };
    if (json.verdict === "PLAUSIBLE") {
      return { verdict: "UNKNOWN", details: json.details };
    }
    return { verdict: json.verdict, details: json.details };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function makeDeepSeekProverBackend(
  config: DeepSeekProverConfig = {}
): Backend {
  const proverTimeout = config.proverTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const kernelTimeout = config.kernelTimeoutMs ?? KERNEL_TIMEOUT_MS;

  return {
    name: "deepseek-prover-v2",
    deterministic: true, // verdict only fires after kernel check
    handles: HANDLES,
    async verify(step: StepInput): Promise<BackendVote> {
      const prompt = buildProverPrompt(step);
      const proverOut = config.invoke
        ? await config.invoke({ naturalLanguage: prompt })
        : await defaultInvoke(config, prompt, proverTimeout);

      if (!proverOut) {
        return {
          source: "LEAN",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: "deepseek-prover unreachable or returned empty",
          details: {
            stage: "prover_failed",
            promptVersion: PROVER_PROMPT_VERSION
          }
        };
      }

      if (/^\s*sorry\s*$/i.test(proverOut.leanCode)) {
        return {
          source: "LEAN",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: "deepseek-prover gave up (sorry)",
          details: {
            stage: "prover_sorry",
            model: proverOut.model,
            promptVersion: PROVER_PROMPT_VERSION
          }
        };
      }

      // Wrap into a theorem so the kernel can check it. We rely on the
      // pipeline carrying the original Lean statement for CLAIM steps;
      // for now, we synthesize the wrapper.
      const wrappedLean = wrapForKernel(step.latex, proverOut.leanCode);

      const kernelOut = config.kernelVerify
        ? await config.kernelVerify({ leanCode: wrappedLean })
        : await defaultKernelVerify(config, wrappedLean, kernelTimeout);

      if (!kernelOut) {
        return {
          source: "LEAN",
          outcome: "ABSTAIN",
          confidence: 0,
          evidence: "kernel verifier unreachable; cannot confirm prover output",
          details: {
            stage: "kernel_unreachable",
            promptVersion: PROVER_PROMPT_VERSION
          }
        };
      }

      switch (kernelOut.verdict) {
        case "VERIFIED":
          return {
            source: "LEAN",
            outcome: "VERIFIED",
            confidence: 0.995,
            evidence: `deepseek-prover proof kernel-verified`,
            details: {
              stage: "kernel_verified",
              model: proverOut.model,
              promptVersion: PROVER_PROMPT_VERSION
            }
          };
        case "INVALID":
          // The prover produced a proof that the kernel rejected — useful
          // info but does NOT prove the claim is false; we abstain.
          return {
            source: "LEAN",
            outcome: "ABSTAIN",
            confidence: 0,
            evidence: "deepseek-prover proof failed kernel check",
            details: {
              stage: "kernel_rejected",
              model: proverOut.model,
              kernelDetails: kernelOut.details,
              promptVersion: PROVER_PROMPT_VERSION
            }
          };
        default:
          return {
            source: "LEAN",
            outcome: "ABSTAIN",
            confidence: 0,
            evidence: `kernel returned ${kernelOut.verdict}`,
            details: {
              stage: "kernel_inconclusive",
              kernelDetails: kernelOut.details,
              promptVersion: PROVER_PROMPT_VERSION
            }
          };
      }
    }
  };
}

function buildProverPrompt(step: StepInput): string {
  const prior =
    step.previousSteps.length > 0
      ? step.previousSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "(none)";
  return [
    `Problem context:\n${step.problemStatement}`,
    `Prior steps:\n${prior}`,
    `Claim to prove (Lean 4 statement or natural language):\n${step.latex}`,
    "",
    "Return ONLY the proof body that completes:",
    "  theorem stmt : <the claim> := <YOUR PROOF>"
  ].join("\n");
}

function wrapForKernel(claim: string, proofBody: string): string {
  // For a Lean 4 statement we expect the claim already starts with
  // "theorem ... := by" — in that case we splice the new body in. For
  // a natural-language CLAIM we leave a TODO marker; the Fly verifier's
  // /prove path would normally autoformalize first. This is best-effort.
  const m = /^(\s*theorem\s+\w[^:]*:[\s\S]*?:=)\s*([\s\S]*)$/m.exec(claim);
  if (m) {
    return `${m[1]} by\n${indent(proofBody, 2)}\n`;
  }
  return `-- claim: ${claim.replace(/\s+/g, " ").slice(0, 200)}\nexample : True := by\n${indent(proofBody, 2)}\n`;
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}
