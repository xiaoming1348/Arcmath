import { z } from "zod";

/**
 * Handwriting → LaTeX OCR via a vision-capable OpenAI model.
 *
 * Why a separate file (vs reusing `openai-json.ts`):
 *  - openai-json.ts is for text-only prompts using the Responses API
 *    with `input: string`. Vision requires multimodal input (an array
 *    of content items including image_url). Different request shape.
 *  - We want a sharper failure model: OCR can succeed but with low
 *    confidence — we surface that to the UI so the student knows to
 *    double-check, instead of silently committing a possibly-wrong
 *    transcription.
 *  - Cost shape is different: vision calls are 5-10x more expensive
 *    than text. Quota tracking and request logging belongs here, not
 *    smeared across the general LLM call helper.
 *
 * We already have the API key and retry/backoff infra, so cost is the
 * main lever. Sprint 1 kept it simple — flat call, no caching, single
 * retry on network error. Sprint 2 can add de-duplication if the same
 * student re-uploads the same photo.
 *
 * UX promise: this is a BEST-EFFORT shortcut. The result always lands
 * in MathLive where the student can edit before submitting. We never
 * auto-submit OCR output — that's the entire point of keeping the
 * typed input box as the primary flow.
 */

const OPENAI_RESPONSES_URL =
  process.env.OPENAI_VISION_RESPONSES_URL ??
  process.env.OPENAI_BASE_URL ??
  "https://api.openai.com/v1/responses";
// Backward-compatible fallback: older deployments/mocks may still expect
// the Chat Completions vision request shape and can point OPENAI_VISION_URL
// at a compatible endpoint.
const OPENAI_CHAT_COMPLETIONS_URL =
  process.env.OPENAI_VISION_URL ?? "https://api.openai.com/v1/chat/completions";
const PREFER_CHAT_COMPLETIONS =
  Boolean(process.env.OPENAI_VISION_URL) &&
  !process.env.OPENAI_VISION_RESPONSES_URL &&
  !process.env.OPENAI_BASE_URL;
// Override via env if needed.
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";
// Tight budget — the JSON we want back is tiny. Bumping this won't
// help quality; it just lets the model ramble in `notes`.
const MAX_OUTPUT_TOKENS = 400;
const NETWORK_BACKOFFS_MS = [350, 1200];
const OCR_IMAGE_DATA_URL_RE =
  /^data:(image\/(?:png|jpe?g|webp|gif))(?:;[^,]*)?;base64,([a-z0-9+/=\s]+)$/i;
const missingApiKeyWarnings = new Set<string>();

type JsonSchema = Record<string, unknown>;
type VisionEndpoint = "responses" | "chat_completions";

type VisionTextResult =
  | { ok: true; text: string }
  | { ok: false; canFallback: boolean };

export function normalizeOcrImageDataUrl(imageDataUrl: string): string | null {
  const match = OCR_IMAGE_DATA_URL_RE.exec(imageDataUrl.trim());
  if (!match) return null;

  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;

  return `data:${mime};base64,${base64}`;
}

function buildResponsesVisionRequestBody(params: {
  prompt: string;
  imageDataUrl: string;
  schemaName: string;
  schema: JsonSchema;
  maxTokens: number;
}) {
  return {
    model: OPENAI_VISION_MODEL,
    max_output_tokens: params.maxTokens,
    text: {
      format: {
        type: "json_schema",
        name: params.schemaName,
        strict: true,
        schema: params.schema
      }
    },
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: params.prompt },
          {
            type: "input_image",
            image_url: params.imageDataUrl,
            detail: "high"
          }
        ]
      }
    ]
  };
}

function buildChatCompletionsVisionRequestBody(params: {
  prompt: string;
  imageDataUrl: string;
  schemaName: string;
  schema: JsonSchema;
  maxTokens: number;
}) {
  return {
    model: OPENAI_VISION_MODEL,
    max_tokens: params.maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: params.schemaName,
        strict: true,
        schema: params.schema
      }
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: params.prompt },
          {
            type: "image_url",
            image_url: { url: params.imageDataUrl, detail: "high" }
          }
        ]
      }
    ]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTextFromContentParts(content: unknown): string | null {
  if (typeof content === "string" && content.trim().length > 0) return content;
  if (!Array.isArray(content)) return null;

  for (const part of content) {
    if (!isRecord(part)) continue;
    if (typeof part.text === "string" && part.text.trim().length > 0) {
      return part.text;
    }
  }

  return null;
}

function extractVisionText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!isRecord(item)) continue;
      const text = extractTextFromContentParts(item.content);
      if (text) return text;
    }
  }

  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      if (!isRecord(choice) || !isRecord(choice.message)) continue;
      const text = extractTextFromContentParts(choice.message.content);
      if (text) return text;
    }
  }

  return null;
}

async function postVisionEndpoint(params: {
  endpoint: VisionEndpoint;
  url: string;
  apiKey: string;
  body: unknown;
  scope: string;
  canFallback: boolean;
}): Promise<VisionTextResult> {
  const label =
    params.endpoint === "responses" ? "Responses" : "Chat Completions";

  for (let attempt = 0; attempt < NETWORK_BACKOFFS_MS.length + 1; attempt += 1) {
    if (attempt > 0) {
      const base = NETWORK_BACKOFFS_MS[attempt - 1];
      const jitter = base * (0.7 + Math.random() * 0.6);
      await new Promise((r) => setTimeout(r, jitter));
    }

    try {
      const response = await fetch(params.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.apiKey}`
        },
        body: JSON.stringify(params.body)
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) {
          console.error(`[${params.scope}] ${label} vision request failed with hard error`, {
            status: response.status,
            statusText: response.statusText
          });
          return {
            ok: false,
            canFallback:
              params.canFallback && response.status !== 401 && response.status !== 403
          };
        }
        if (attempt >= NETWORK_BACKOFFS_MS.length) {
          console.error(`[${params.scope}] ${label} vision request gave up after retries`, {
            status: response.status,
            statusText: response.statusText
          });
          return { ok: false, canFallback: params.canFallback };
        }
        console.warn(`[${params.scope}] ${label} vision request transient failure; retrying`, {
          status: response.status,
          attempt
        });
        continue;
      }

      const payload = await response.json();
      const text = extractVisionText(payload);
      if (typeof text !== "string" || text.trim().length === 0) {
        console.error(`[${params.scope}] ${label} vision returned empty content`, {
          attempt
        });
        return { ok: false, canFallback: params.canFallback };
      }

      return { ok: true, text };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown";
      if (attempt >= NETWORK_BACKOFFS_MS.length) {
        console.error(`[${params.scope}] ${label} vision request gave up after retries`, {
          error: msg
        });
        return { ok: false, canFallback: params.canFallback };
      }
      console.warn(`[${params.scope}] ${label} vision request network error; retrying`, {
        attempt,
        error: msg
      });
    }
  }

  return { ok: false, canFallback: params.canFallback };
}

async function requestVisionJson(params: {
  apiKey: string;
  scope: string;
  prompt: string;
  imageDataUrl: string;
  schemaName: string;
  schema: JsonSchema;
  maxTokens: number;
}): Promise<unknown | null> {
  if (PREFER_CHAT_COMPLETIONS) {
    const chatBody = buildChatCompletionsVisionRequestBody(params);
    const chatResult = await postVisionEndpoint({
      endpoint: "chat_completions",
      url: OPENAI_CHAT_COMPLETIONS_URL,
      apiKey: params.apiKey,
      body: chatBody,
      scope: params.scope,
      canFallback: false
    });
    if (!chatResult.ok) return null;

    try {
      return JSON.parse(chatResult.text);
    } catch (parseError) {
      console.error(`[${params.scope}] vision response not valid JSON`, {
        textTail: chatResult.text.slice(-200),
        error: parseError instanceof Error ? parseError.message : String(parseError)
      });
      return null;
    }
  }

  const responsesBody = buildResponsesVisionRequestBody(params);
  const responsesResult = await postVisionEndpoint({
    endpoint: "responses",
    url: OPENAI_RESPONSES_URL,
    apiKey: params.apiKey,
    body: responsesBody,
    scope: params.scope,
    canFallback: true
  });

  let text: string | null = null;
  if (responsesResult.ok) {
    text = responsesResult.text;
  } else if (responsesResult.canFallback) {
    const chatBody = buildChatCompletionsVisionRequestBody(params);
    const chatResult = await postVisionEndpoint({
      endpoint: "chat_completions",
      url: OPENAI_CHAT_COMPLETIONS_URL,
      apiKey: params.apiKey,
      body: chatBody,
      scope: params.scope,
      canFallback: false
    });
    if (!chatResult.ok) return null;
    text = chatResult.text;
  } else {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (parseError) {
    console.error(`[${params.scope}] vision response not valid JSON`, {
      textTail: text.slice(-200),
      error: parseError instanceof Error ? parseError.message : String(parseError)
    });
    return null;
  }
}

// Confidence taxonomy returned to UI. We deliberately keep this
// coarse — three buckets the student can act on:
//   high   → looks reliable, glance and submit
//   medium → check carefully, OCR may have flipped a sign or subscript
//   low    → probably needs re-typing; only commit if you've verified
//   none   → couldn't read at all (e.g. blank photo, blur)
const confidenceSchema = z.enum(["high", "medium", "low", "none"]);

const ocrResultSchema = z.object({
  // The transcribed LaTeX. Empty string if confidence === "none".
  latex: z.string(),
  confidence: confidenceSchema,
  // Optional natural-language warning ("the second term is ambiguous —
  // could be x^2 or x_2"). Surfaces in the UI to focus the student's
  // review on the risky spot.
  notes: z.string().nullable()
});

export type HandwritingOcrResult = z.infer<typeof ocrResultSchema>;

// ---------------------------------------------------------------------
// Sprint 2: multi-step OCR. Same prompt scaffolding, but the schema is
// an array of per-step results so the model can split a photo of an
// entire worked-out solution into N labeled chunks. The per-step
// confidence + notes are returned so the review UI can render each
// step's flag distinctly.
// ---------------------------------------------------------------------

const multiStepResultSchema = z.object({
  // The model may emit 0 steps if the image is unreadable / empty.
  // The UI treats this the same as confidence === "none" — show a
  // "couldn't read it" message rather than refilling anything.
  steps: z.array(
    z.object({
      // 1-indexed position the model thinks this step occupies in the
      // overall solution. We don't rely on it for the saved step
      // ordering (the UI re-numbers based on visual order) but it's
      // useful for the review modal to label "Step 1" etc.
      stepNumber: z.number().int().min(1),
      latex: z.string(),
      confidence: confidenceSchema,
      notes: z.string().nullable()
    })
  ),
  // Optional whole-image confidence — useful when the model can read
  // most of the steps but flags general image quality issues
  // (e.g. "the bottom of the page is cut off"). Surfaces above the
  // step list in the review UI.
  imageNotes: z.string().nullable()
});

export type HandwritingMultiStepOcrResult = z.infer<typeof multiStepResultSchema>;

const MULTI_STEP_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          stepNumber: { type: "integer", minimum: 1 },
          latex: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
          notes: { type: ["string", "null"] }
        },
        required: ["stepNumber", "latex", "confidence", "notes"]
      }
    },
    imageNotes: { type: ["string", "null"] }
  },
  required: ["steps", "imageNotes"]
};

function buildMultiStepPrompt(uiLocale: "en" | "zh"): string {
  const noteLanguage = uiLocale === "zh" ? "Chinese (Simplified)" : "English";
  return [
    "You are a careful math handwriting OCR.",
    "The image shows a student's handwritten work — typically multiple consecutive STEPS of a solution.",
    "Identify each visually distinct step (a step is a separate equation/sentence/derivation; if the student numbered them 1) 2) 3), use that). Transcribe each step independently.",
    "",
    "Rules:",
    "- Output a JSON object with shape { steps: [{stepNumber, latex, confidence, notes}], imageNotes }.",
    "- steps: ordered top-to-bottom as they appear on the page. If the page has only one step, return an array with one entry.",
    "- stepNumber: 1-indexed sequential. If the student wrote their own numbers (1), 2), …) keep that ordering.",
    "- latex: the LaTeX string. Wrap variables in math mode naturally; do NOT add surrounding $ or \\[ \\] delimiters. If the step mixes prose with math, keep the prose verbatim but wrap math in single dollar signs.",
    "- confidence: per-step. 'high' if every symbol is unambiguous, 'medium' if 1-2 spots are borderline, 'low' if substantial guessing was needed, 'none' if that step is unreadable.",
    "- notes: per-step short note (under 30 words) in " +
      noteLanguage +
      " calling out ambiguities. null when confidence is 'high'.",
    "- imageNotes: a short note in " +
      noteLanguage +
      " about the overall image (e.g. 'top of page cut off', 'low contrast'). null if no issues.",
    "- If the image is empty, blurry beyond reading, or shows no math, return { steps: [], imageNotes: '…brief reason…' }.",
    "- Never invent steps that aren't visually present. Errors of omission are better than fabrication."
  ].join("\n");
}

/**
 * Multi-step variant. Same model + retry pattern as single-step OCR
 * but returns a list of structured per-step results. The UI is
 * expected to show a confirmation modal where the student can
 * accept/edit/skip each step before they're committed via the normal
 * `addStep` flow.
 *
 * Like `ocrHandwritingToLatex` this returns `null` on hard failure;
 * the UI should fall back to typing or to single-step mode.
 *
 * Cost note: a multi-step call uses the same per-image token cost as
 * single-step (the image is the dominant cost), so the per-step
 * cost-per-result is significantly lower when the photo contains
 * several steps. The quota meter charges 1 call regardless.
 */
export async function ocrHandwritingMultiStep(params: {
  imageDataUrl: string;
  uiLocale: "en" | "zh";
  scope?: string;
}): Promise<HandwritingMultiStepOcrResult | null> {
  const scope = params.scope ?? "ocr-handwriting-multi";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (!missingApiKeyWarnings.has(scope)) {
      missingApiKeyWarnings.add(scope);
      console.warn(`[${scope}] OPENAI_API_KEY is not set; OCR disabled.`);
    }
    return null;
  }

  const imageDataUrl = normalizeOcrImageDataUrl(params.imageDataUrl);
  if (!imageDataUrl) {
    console.warn(`[${scope}] image not a recognized data URL; refusing to send.`);
    return null;
  }

  // Token budget — multi-step can need more than single-step.
  // 8 steps × ~80 tokens of latex + metadata each ≈ 800-1200 tokens.
  // 1500 covers comfortably without enabling rambling notes.
  const MULTI_STEP_MAX_TOKENS = 1500;

  const parsedJson = await requestVisionJson({
    apiKey,
    scope,
    prompt: buildMultiStepPrompt(params.uiLocale),
    imageDataUrl,
    schemaName: "handwriting_ocr_multi_step",
    schema: MULTI_STEP_JSON_SCHEMA,
    maxTokens: MULTI_STEP_MAX_TOKENS
  });
  if (!parsedJson) return null;

  const validated = multiStepResultSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error(`[${scope}] vision response failed schema`, {
      issues: validated.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code
      }))
    });
    return null;
  }

  // Defensive sanitisation — trim and length-cap each step's
  // latex + notes, plus cap total step count. The schema doesn't
  // bound these, so a runaway model could in theory emit dozens
  // of empty steps.
  const MAX_STEPS = 20;
  const MAX_LATEX_LENGTH = 4000;
  const cleanedSteps = validated.data.steps
    .slice(0, MAX_STEPS)
    .map((s, i) => ({
      stepNumber: s.stepNumber > 0 ? s.stepNumber : i + 1,
      latex: s.latex.trim().slice(0, MAX_LATEX_LENGTH),
      confidence: s.confidence,
      notes: s.notes?.trim().slice(0, 240) || null
    }))
    .filter((s) => s.latex.length > 0 || s.confidence === "none");

  return {
    steps: cleanedSteps,
    imageNotes: validated.data.imageNotes?.trim().slice(0, 320) || null
  };
}

const OCR_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    latex: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
    notes: { type: ["string", "null"] }
  },
  required: ["latex", "confidence", "notes"]
};

// Locale-aware prompt. The student's UI locale affects only the
// `notes` field language — the LaTeX itself is locale-free. We pin
// the prompt in English because GPT-4o reasons more reliably about
// math notation in English, then translate just the note for display.
function buildOcrPrompt(uiLocale: "en" | "zh"): string {
  const noteLanguage = uiLocale === "zh" ? "Chinese (Simplified)" : "English";
  return [
    "You are a careful math handwriting OCR.",
    "The image shows ONE step of a student's solution to a math problem.",
    "Transcribe the math content into a single LaTeX expression suitable for MathLive.",
    "",
    "Rules:",
    "- Output a JSON object with fields { latex, confidence, notes }.",
    "- latex: the LaTeX string. Wrap variables in math mode naturally; do NOT add surrounding $ or \\[ \\] delimiters.",
    "- If the step mixes prose with math, keep the prose verbatim but wrap math expressions in single dollar signs, e.g. \"Suppose $n \\geq 2$\".",
    "- confidence: 'high' if every symbol is unambiguous, 'medium' if 1-2 spots are borderline (e.g. subscript vs superscript, x vs ×), 'low' if substantial guessing was needed, 'none' if the image is unreadable or empty.",
    "- notes: a SHORT note (under 30 words) in " +
      noteLanguage +
      " calling out specific ambiguities the student should check. If confidence is 'high', set notes to null.",
    "- Never invent content beyond what's clearly written. If a step is partially cut off, transcribe only the visible portion and lower confidence.",
    "- Do not include explanations of the math; just transcribe."
  ].join("\n");
}

/**
 * Call GPT-4o vision to transcribe a single handwriting image into
 * LaTeX. Returns `null` if the API key is missing or the call fails
 * after retries. The UI treats null as "OCR unavailable — fall back to
 * typing" rather than as an error.
 *
 * `imageDataUrl` must be a data: URL (`data:image/<type>;base64,...`).
 * The frontend resizes + base64-encodes before sending so we don't
 * need to manage server-side temp files in Sprint 1.
 *
 * `uiLocale` controls the language of the `notes` field only.
 */
export async function ocrHandwritingToLatex(params: {
  imageDataUrl: string;
  uiLocale: "en" | "zh";
  scope?: string;
}): Promise<HandwritingOcrResult | null> {
  const scope = params.scope ?? "ocr-handwriting";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (!missingApiKeyWarnings.has(scope)) {
      missingApiKeyWarnings.add(scope);
      console.warn(`[${scope}] OPENAI_API_KEY is not set; OCR disabled.`);
    }
    return null;
  }

  // Cheap shape validation — saves an API call if the frontend
  // forgot to encode properly. We allow png / jpeg / webp / gif.
  const imageDataUrl = normalizeOcrImageDataUrl(params.imageDataUrl);
  if (!imageDataUrl) {
    console.warn(`[${scope}] image not a recognized data URL; refusing to send.`);
    return null;
  }

  const prompt = buildOcrPrompt(params.uiLocale);

  const parsedJson = await requestVisionJson({
    apiKey,
    scope,
    prompt,
    imageDataUrl,
    schemaName: "handwriting_ocr_result",
    schema: OCR_JSON_SCHEMA,
    maxTokens: MAX_OUTPUT_TOKENS
  });
  if (!parsedJson) return null;

  const validated = ocrResultSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error(`[${scope}] vision response failed schema`, {
      issues: validated.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code
      }))
    });
    return null;
  }

  // Trim whitespace + cap length defensively — the schema doesn't
  // bound size and a runaway model could in theory return many KB.
  // 4000 matches MAX_STEP_LENGTH in unified-attempt router so we
  // never produce output the downstream rejects.
  const MAX_LATEX_LENGTH = 4000;
  const latex = validated.data.latex.trim().slice(0, MAX_LATEX_LENGTH);
  const notes = validated.data.notes?.trim().slice(0, 240) ?? null;

  return {
    latex,
    confidence: validated.data.confidence,
    notes: notes && notes.length > 0 ? notes : null
  };
}

const printedMathPageOcrSchema = z.object({
  text: z.string(),
  confidence: confidenceSchema,
  notes: z.string().nullable()
});

export type PrintedMathPageOcrResult = z.infer<typeof printedMathPageOcrSchema>;

const PRINTED_MATH_PAGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
    notes: { type: ["string", "null"] }
  },
  required: ["text", "confidence", "notes"]
};

function buildPrintedMathPagePrompt(params: {
  uiLocale: "en" | "zh";
  pageNumber?: number;
}): string {
  const noteLanguage = params.uiLocale === "zh" ? "Chinese (Simplified)" : "English";
  const pageLine =
    params.pageNumber != null
      ? `This image is page ${params.pageNumber} from a PDF.`
      : "This image is one page from a PDF.";

  return [
    "You are a careful OCR engine for printed or scanned math materials.",
    pageLine,
    "",
    "Task:",
    "- Transcribe only the visible page content into plain text with Markdown/LaTeX math where helpful.",
    "- Preserve problem numbers, subparts, labels, and line breaks when they help a teacher identify selected problems.",
    "- Preserve mathematical symbols and constraints accurately.",
    "- If a diagram or table is essential but not machine-readable, insert a short bracketed note such as [diagram shown in source PDF].",
    "",
    "Hard rules:",
    "- Do not solve any problem.",
    "- Do not add answers, hints, explanations, or commentary that is not visible on the page.",
    "- Do not invent missing text. If part of the page is unreadable, transcribe the readable parts and lower confidence.",
    "- Drop page headers/footers only when they are clearly unrelated to the problems.",
    `- Put notes in ${noteLanguage}.`,
    "- Output JSON with { text, confidence, notes }."
  ].join("\n");
}

export async function ocrPrintedMathPageToText(params: {
  imageDataUrl: string;
  uiLocale: "en" | "zh";
  pageNumber?: number;
  scope?: string;
}): Promise<PrintedMathPageOcrResult | null> {
  const scope = params.scope ?? "printed-math-page-ocr";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (!missingApiKeyWarnings.has(scope)) {
      missingApiKeyWarnings.add(scope);
      console.warn(`[${scope}] OPENAI_API_KEY is not set; PDF OCR disabled.`);
    }
    return null;
  }

  const imageDataUrl = normalizeOcrImageDataUrl(params.imageDataUrl);
  if (!imageDataUrl) {
    console.warn(`[${scope}] image not a recognized data URL; refusing to send.`);
    return null;
  }

  const parsedJson = await requestVisionJson({
    apiKey,
    scope,
    prompt: buildPrintedMathPagePrompt({
      uiLocale: params.uiLocale,
      pageNumber: params.pageNumber
    }),
    imageDataUrl,
    schemaName: "printed_math_page_ocr",
    schema: PRINTED_MATH_PAGE_JSON_SCHEMA,
    maxTokens: 2600
  });
  if (!parsedJson) return null;

  const validated = printedMathPageOcrSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error(`[${scope}] vision response failed schema`, {
      issues: validated.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code
      }))
    });
    return null;
  }

  return {
    text: validated.data.text.trim().slice(0, 12000),
    confidence: validated.data.confidence,
    notes: validated.data.notes?.trim().slice(0, 320) || null
  };
}
