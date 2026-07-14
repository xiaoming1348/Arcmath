import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";

const verifierHealthSchema = z.object({
  status: z.literal("ok"),
  version: z.string()
});

const autoformalizeResponseSchema = z.object({
  status: z.enum(["OK", "NO_API_KEY", "LLM_FAIL", "EMPTY"]),
  lean_code: z.string().default(""),
  model: z.string().default(""),
  raw_reason: z.string().default("")
});

const leanCompleteResponseSchema = z.object({
  status: z.enum(["OK", "NO_API_KEY", "LLM_FAIL", "EMPTY"]),
  lean_code: z.string().default(""),
  still_has_sorry: z.boolean().default(false),
  model: z.string().default(""),
  raw_reason: z.string().default("")
});

const verifyResponseSchema = z.object({
  verdict: z.enum(["VERIFIED", "PLAUSIBLE", "UNKNOWN", "INVALID", "ERROR"]),
  backend: z.enum(["SYMPY", "LEAN", "LLM_JUDGE", "GEOGEBRA", "CLASSIFIER_ONLY", "NONE"]),
  confidence: z.number().min(0).max(1),
  details: z.record(z.string(), z.unknown()).default({})
});

const proveResponseSchema = z.object({
  status: z.enum(["VERIFIED", "INVALID", "UNKNOWN", "LLM_FAIL", "NO_API_KEY"]),
  autoformalized: z.string().default(""),
  completed: z.string().default(""),
  verifier_verdict: z.enum(["VERIFIED", "PLAUSIBLE", "UNKNOWN", "INVALID", "ERROR"]).nullable().default(null),
  verifier_details: z.record(z.string(), z.unknown()).default({}),
  retries_used: z.number().int().nonnegative().default(0),
  model: z.string().default(""),
  notes: z.string().default("")
});

export const leanExplanationSchema = z.object({
  title: z.string().min(1).max(160),
  naturalLanguageStatement: z.string().min(1).max(1200),
  latexStatement: z.string().min(1).max(1200),
  proofOutline: z.array(z.string().min(1).max(400)).min(1).max(8),
  keyIdeas: z.array(z.string().min(1).max(300)).min(1).max(8),
  leanDependencies: z.array(z.string().min(1).max(120)).max(12),
  cautionNotes: z.array(z.string().min(1).max(300)).max(6)
});

export const leanExplanationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "naturalLanguageStatement",
    "latexStatement",
    "proofOutline",
    "keyIdeas",
    "leanDependencies",
    "cautionNotes"
  ],
  properties: {
    title: { type: "string" },
    naturalLanguageStatement: { type: "string" },
    latexStatement: { type: "string" },
    proofOutline: {
      type: "array",
      items: { type: "string" }
    },
    keyIdeas: {
      type: "array",
      items: { type: "string" }
    },
    leanDependencies: {
      type: "array",
      items: { type: "string" }
    },
    cautionNotes: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;

export const researchLeanActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("health")
  }),
  z.object({
    action: z.literal("nl_to_lean_draft"),
    domain: z.string().trim().min(1).max(64).default("math"),
    naturalLanguageStatement: z.string().trim().min(1).max(4000),
    plannerAssumptions: z.array(z.string().trim().min(1).max(240)).max(32).default([]),
    openaiModel: z.string().trim().min(1).max(80).optional()
  }),
  z.object({
    action: z.literal("lean_draft_to_final"),
    leanDraft: z.string().trim().min(1).max(20000),
    openaiModel: z.string().trim().min(1).max(80).optional()
  }),
  z.object({
    action: z.literal("verify_lean"),
    leanCode: z.string().trim().min(1).max(20000)
  }),
  z.object({
    action: z.literal("prove"),
    domain: z.string().trim().min(1).max(64).default("math"),
    naturalLanguageStatement: z.string().trim().min(1).max(4000),
    plannerAssumptions: z.array(z.string().trim().min(1).max(240)).max(32).default([]),
    maxCompletionRetries: z.number().int().min(0).max(3).default(1),
    openaiModel: z.string().trim().min(1).max(80).optional()
  }),
  z.object({
    action: z.literal("explain"),
    leanCode: z.string().trim().min(1).max(20000),
    naturalLanguageStatement: z.string().trim().max(4000).optional(),
    language: z.enum(["en", "zh"]).default("en")
  })
]);

export type LeanExplanation = z.infer<typeof leanExplanationSchema>;
export type ResearchLeanAction = z.infer<typeof researchLeanActionSchema>;

export type ResearchLeanHealth = {
  configured: boolean;
  reachable: boolean;
  version?: string;
  error?: string;
};

function verifierBaseUrl(): string | null {
  const url = process.env.PROOF_VERIFIER_URL?.trim();
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

function normalizeOpenAIChatEndpoint(raw: string): string {
  const endpoint = raw.trim().replace(/\/+$/, "");
  if (endpoint.endsWith("/chat/completions")) return endpoint;
  if (endpoint.endsWith("/responses")) {
    return `${endpoint.slice(0, -"/responses".length)}/chat/completions`;
  }
  return `${endpoint}/chat/completions`;
}

function researchOpenAIChatEndpoint(): string | undefined {
  const raw =
    process.env.RESEARCH_OPENAI_CHAT_COMPLETIONS_URL ??
    process.env.OPENAI_CHAT_COMPLETIONS_URL ??
    process.env.OPENAI_BASE_URL;
  if (!raw?.trim()) return undefined;
  return normalizeOpenAIChatEndpoint(raw);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function postVerifier<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  timeoutMs = 90000
): Promise<T> {
  const baseUrl = verifierBaseUrl();
  if (!baseUrl) {
    throw new Error("PROOF_VERIFIER_URL is not configured for the web app.");
  }

  const response = await fetchWithTimeout(
    `${baseUrl}${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    timeoutMs
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Verifier ${path} failed with ${response.status}: ${detail.slice(0, 500)}`);
  }

  const raw = (await response.json()) as unknown;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Verifier ${path} returned an unexpected response shape.`);
  }
  return parsed.data;
}

export async function getResearchLeanHealth(): Promise<ResearchLeanHealth> {
  const baseUrl = verifierBaseUrl();
  if (!baseUrl) {
    return {
      configured: false,
      reachable: false,
      error: "PROOF_VERIFIER_URL is not configured."
    };
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/health`,
      { method: "GET" },
      5000
    );
    if (!response.ok) {
      return {
        configured: true,
        reachable: false,
        error: `Verifier health returned HTTP ${response.status}.`
      };
    }
    const parsed = verifierHealthSchema.safeParse(await response.json());
    if (!parsed.success) {
      return {
        configured: true,
        reachable: false,
        error: "Verifier health returned an unexpected response shape."
      };
    }
    return {
      configured: true,
      reachable: true,
      version: parsed.data.version
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function naturalLanguageToLeanDraft(params: {
  domain: string;
  naturalLanguageStatement: string;
  plannerAssumptions: string[];
  openaiModel?: string;
}) {
  return postVerifier(
    "/autoformalize",
    {
      domain: params.domain,
      natural_language_statement: params.naturalLanguageStatement,
      planner_assumptions: params.plannerAssumptions,
      openai_endpoint: researchOpenAIChatEndpoint(),
      openai_model: params.openaiModel ?? process.env.RESEARCH_PROVER_MODEL ?? "gpt-4.1"
    },
    autoformalizeResponseSchema
  );
}

export async function leanDraftToFinal(params: {
  leanDraft: string;
  openaiModel?: string;
}) {
  return postVerifier(
    "/complete-lean",
    {
      lean_draft: params.leanDraft,
      openai_endpoint: researchOpenAIChatEndpoint(),
      openai_model: params.openaiModel ?? process.env.RESEARCH_PROVER_MODEL ?? "gpt-4.1"
    },
    leanCompleteResponseSchema
  );
}

export async function verifyLeanCode(leanCode: string) {
  return postVerifier(
    "/verify/lean",
    { lean_code: leanCode },
    verifyResponseSchema,
    180000
  );
}

export async function proveNaturalStatement(params: {
  domain: string;
  naturalLanguageStatement: string;
  plannerAssumptions: string[];
  maxCompletionRetries: number;
  openaiModel?: string;
}) {
  return postVerifier(
    "/prove",
    {
      domain: params.domain,
      natural_language_statement: params.naturalLanguageStatement,
      planner_assumptions: params.plannerAssumptions,
      openai_endpoint: researchOpenAIChatEndpoint(),
      max_completion_retries: params.maxCompletionRetries,
      openai_model: params.openaiModel ?? process.env.RESEARCH_PROVER_MODEL ?? "gpt-4.1"
    },
    proveResponseSchema,
    240000
  );
}

export async function explainLeanProof(params: {
  leanCode: string;
  naturalLanguageStatement?: string;
  language: "en" | "zh";
}): Promise<LeanExplanation> {
  const zh = params.language === "zh";
  const prompt = [
    "You are ArcMath Research Mode's Lean explanation engine.",
    "Convert a completed Lean 4 proof into readable mathematical writing.",
    "Do not claim the proof is verified unless the caller separately reports a Lean VERIFIED status.",
    "If the code contains `sorry`, `admit`, or obvious placeholder logic, include that as a caution note.",
    zh
      ? "Write natural-language fields in Simplified Chinese. Keep Lean identifiers unchanged. Write LaTeX formulas where useful."
      : "Write natural-language fields in English. Keep Lean identifiers unchanged. Write LaTeX formulas where useful.",
    "",
    params.naturalLanguageStatement
      ? `Original natural-language statement:\n${params.naturalLanguageStatement}`
      : "Original natural-language statement: not provided.",
    "",
    "Lean code:",
    params.leanCode
  ].join("\n");

  const generated = await callOpenAIJson({
    scope: "research-lean-explanation",
    schemaName: "research_lean_explanation",
    prompt,
    schema: leanExplanationSchema,
    jsonSchema: leanExplanationJsonSchema,
    maxOutputTokens: 1200
  });

  if (generated) return generated;

  return {
    title: zh ? "Lean 证明说明" : "Lean proof explanation",
    naturalLanguageStatement:
      params.naturalLanguageStatement?.slice(0, 1200) ||
      (zh
        ? "该证明的自然语言原题尚未提供。"
        : "No original natural-language statement was provided."),
    latexStatement: params.naturalLanguageStatement?.slice(0, 1200) || "\\text{statement unavailable}",
    proofOutline: [
      zh
        ? "OpenAI 解释暂不可用；请先参考 Lean 代码和验证状态。"
        : "OpenAI explanation is unavailable; inspect the Lean code and verifier status directly."
    ],
    keyIdeas: [
      zh
        ? "只有 Lean 内核返回 VERIFIED 时，才能把该证明称为机器验证完成。"
        : "Only a Lean VERIFIED result should be treated as a machine-checked proof."
    ],
    leanDependencies: [],
    cautionNotes: [
      zh
        ? "这是安全降级说明，不是完整数学讲解。"
        : "This is a safe fallback, not a full mathematical explanation."
    ]
  };
}
