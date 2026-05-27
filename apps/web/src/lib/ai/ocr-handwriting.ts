import { z } from "zod";

/**
 * Handwriting → LaTeX OCR via GPT-4o vision.
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
 * Why GPT-4o (not gpt-4.1-mini): mini doesn't have vision; full 4o
 * does. We already have the API key and retry/backoff infra, so cost
 * is the only real lever. Sprint 1 keeps it simple — flat call,
 * no caching, single retry on network error. Sprint 2 can add
 * de-duplication if the same student re-uploads the same photo.
 *
 * UX promise: this is a BEST-EFFORT shortcut. The result always lands
 * in MathLive where the student can edit before submitting. We never
 * auto-submit OCR output — that's the entire point of keeping the
 * typed input box as the primary flow.
 */

const OPENAI_VISION_URL =
  process.env.OPENAI_VISION_URL ?? "https://api.openai.com/v1/chat/completions";
// 4o is the cheapest model with reliable handwriting OCR. 4o-mini
// vision is cheaper but its math handwriting accuracy is noticeably
// worse in our spot tests. Override via env if needed.
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";
// Tight budget — the JSON we want back is tiny. Bumping this won't
// help quality; it just lets the model ramble in `notes`.
const MAX_OUTPUT_TOKENS = 400;
const missingApiKeyWarnings = new Set<string>();

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

  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(params.imageDataUrl)) {
    console.warn(`[${scope}] image not a recognized data URL; refusing to send.`);
    return null;
  }

  // Token budget — multi-step can need more than single-step.
  // 8 steps × ~80 tokens of latex + metadata each ≈ 800-1200 tokens.
  // 1500 covers comfortably without enabling rambling notes.
  const MULTI_STEP_MAX_TOKENS = 1500;

  const requestBody = {
    model: OPENAI_VISION_MODEL,
    max_tokens: MULTI_STEP_MAX_TOKENS,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "handwriting_ocr_multi_step",
        strict: true,
        schema: MULTI_STEP_JSON_SCHEMA
      }
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildMultiStepPrompt(params.uiLocale) },
          {
            type: "image_url",
            image_url: { url: params.imageDataUrl, detail: "high" }
          }
        ]
      }
    ]
  };

  const NETWORK_BACKOFFS_MS = [350, 1200];
  for (let attempt = 0; attempt < NETWORK_BACKOFFS_MS.length + 1; attempt += 1) {
    if (attempt > 0) {
      const base = NETWORK_BACKOFFS_MS[attempt - 1];
      const jitter = base * (0.7 + Math.random() * 0.6);
      await new Promise((r) => setTimeout(r, jitter));
    }

    try {
      const response = await fetch(OPENAI_VISION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        if (response.status !== 429 && response.status < 500) {
          console.error(`[${scope}] vision request failed with hard error`, {
            status: response.status,
            statusText: response.statusText
          });
          return null;
        }
        console.warn(`[${scope}] vision request transient failure; retrying`, {
          status: response.status,
          attempt
        });
        continue;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== "string" || text.trim().length === 0) {
        console.error(`[${scope}] vision returned empty content`, { attempt });
        return null;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch (parseError) {
        console.error(`[${scope}] vision response not valid JSON`, {
          attempt,
          textTail: text.slice(-200),
          error:
            parseError instanceof Error ? parseError.message : String(parseError)
        });
        return null;
      }

      const validated = multiStepResultSchema.safeParse(parsedJson);
      if (!validated.success) {
        console.error(`[${scope}] vision response failed schema`, {
          attempt,
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown";
      if (attempt >= NETWORK_BACKOFFS_MS.length) {
        console.error(`[${scope}] vision request gave up after retries`, {
          error: msg
        });
        return null;
      }
      console.warn(`[${scope}] vision request network error; retrying`, {
        attempt,
        error: msg
      });
    }
  }

  return null;
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
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(params.imageDataUrl)) {
    console.warn(`[${scope}] image not a recognized data URL; refusing to send.`);
    return null;
  }

  const prompt = buildOcrPrompt(params.uiLocale);

  // Chat Completions API for vision (Responses API also supports
  // images but the format is more brittle as of writing). We use the
  // documented multimodal `content` array.
  const requestBody = {
    model: OPENAI_VISION_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "handwriting_ocr_result",
        strict: true,
        schema: OCR_JSON_SCHEMA
      }
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: params.imageDataUrl, detail: "high" }
          }
        ]
      }
    ]
  };

  // Single retry on network error. We don't bump tokens here — if 400
  // chars isn't enough for one OCR'd step, something is wrong with the
  // image, not the budget.
  const NETWORK_BACKOFFS_MS = [350, 1200]; // ~1.5s total worst case
  for (let attempt = 0; attempt < NETWORK_BACKOFFS_MS.length + 1; attempt += 1) {
    if (attempt > 0) {
      const base = NETWORK_BACKOFFS_MS[attempt - 1];
      const jitter = base * (0.7 + Math.random() * 0.6);
      await new Promise((r) => setTimeout(r, jitter));
    }

    try {
      const response = await fetch(OPENAI_VISION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        // Common transient failures: 429 (rate limit), 5xx. Retry.
        // Hard failures (4xx other than 429): give up immediately, no
        // amount of retrying will fix a bad request.
        if (response.status !== 429 && response.status < 500) {
          console.error(`[${scope}] vision request failed with hard error`, {
            status: response.status,
            statusText: response.statusText
          });
          return null;
        }
        console.warn(`[${scope}] vision request transient failure; retrying`, {
          status: response.status,
          attempt
        });
        continue;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== "string" || text.trim().length === 0) {
        console.error(`[${scope}] vision returned empty content`, { attempt });
        return null;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch (parseError) {
        console.error(`[${scope}] vision response not valid JSON`, {
          attempt,
          textTail: text.slice(-200),
          error:
            parseError instanceof Error ? parseError.message : String(parseError)
        });
        return null;
      }

      const validated = ocrResultSchema.safeParse(parsedJson);
      if (!validated.success) {
        console.error(`[${scope}] vision response failed schema`, {
          attempt,
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown";
      if (attempt >= NETWORK_BACKOFFS_MS.length) {
        console.error(`[${scope}] vision request gave up after retries`, {
          error: msg
        });
        return null;
      }
      console.warn(`[${scope}] vision request network error; retrying`, {
        attempt,
        error: msg
      });
    }
  }

  return null;
}
