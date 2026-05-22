import { z } from "zod";

const OPENAI_RESPONSES_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
// Hard ceiling on the retry-bumped token budget. Even when the model
// truncates, doubling forever can cost a lot if the prompt is poorly
// formed. 2048 covers every legitimate Arcmath JSON schema we use today.
const MAX_OUTPUT_TOKENS_CEILING = 2048;
const missingApiKeyWarnings = new Set<string>();

/** True if the OpenAI Responses API said the response was truncated by
 *  max_output_tokens. The API can surface this two ways depending on
 *  status: `status === "incomplete"` with `incomplete_details.reason
 *  === "max_output_tokens"`, OR a per-output `finish_reason === "length"`.
 *  We check both so this stays robust across response-shape changes. */
function wasTruncatedByLength(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as {
    status?: unknown;
    incomplete_details?: unknown;
    output?: Array<{ finish_reason?: unknown }>;
  };
  if (record.status === "incomplete") {
    const details = record.incomplete_details;
    if (
      details &&
      typeof details === "object" &&
      "reason" in details &&
      (details as { reason?: unknown }).reason === "max_output_tokens"
    ) {
      return true;
    }
  }
  if (Array.isArray(record.output)) {
    for (const item of record.output) {
      if (item && (item.finish_reason === "length" || item.finish_reason === "max_output_tokens")) {
        return true;
      }
    }
  }
  return false;
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        type?: unknown;
        text?: unknown;
      }>;
    }>;
  };

  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) {
    return record.output_text;
  }

  if (!Array.isArray(record.output)) {
    return null;
  }

  const parts: string[] = [];

  for (const item of record.output) {
    if (!item || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (!content || (content.type !== "output_text" && content.type !== "text")) {
        continue;
      }

      if (typeof content.text === "string" && content.text.trim().length > 0) {
        parts.push(content.text);
        continue;
      }

      if (
        content.text &&
        typeof content.text === "object" &&
        "value" in content.text &&
        typeof (content.text as { value?: unknown }).value === "string"
      ) {
        parts.push((content.text as { value: string }).value);
      }
    }
  }

  return parts.length > 0 ? parts.join("\n").trim() : null;
}

export async function callOpenAIJson<T>(params: {
  scope: string;
  schemaName: string;
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (!missingApiKeyWarnings.has(params.scope)) {
      missingApiKeyWarnings.add(params.scope);
      console.warn(`[${params.scope}] OPENAI_API_KEY is not set; falling back to safe local responses.`);
    }
    return null;
  }

  // Retry strategy. The two recoverable failure modes we see most often:
  //   1. The model writes valid JSON but hits max_output_tokens before
  //      closing the last string → JSON.parse throws "Unterminated string".
  //   2. The model truncates within a string and the API marks the
  //      response as `status: "incomplete"` (no parse error needed; we
  //      can detect it before parsing).
  // Both are fixed by retrying once with a doubled token budget. Cost
  // impact is small because (a) it's per-call, not per-session, and (b)
  // capped at MAX_OUTPUT_TOKENS_CEILING.
  const initialBudget = params.maxOutputTokens ?? 220;
  const retryBudget = Math.min(initialBudget * 2, MAX_OUTPUT_TOKENS_CEILING);

  // First attempt, then optional retry with bumped tokens.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const isRetry = attempt === 1;
    const tokenBudget = isRetry ? retryBudget : initialBudget;
    // Skip the retry if we're already at the ceiling — no point spending
    // more API calls when the budget can't grow.
    if (isRetry && tokenBudget === initialBudget) break;

    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: params.prompt,
          max_output_tokens: tokenBudget,
          text: {
            format: {
              type: "json_schema",
              name: params.schemaName,
              strict: true,
              schema: params.jsonSchema
            }
          }
        })
      });

      if (!response.ok) {
        console.error(`[${params.scope}] OpenAI request failed`, {
          status: response.status,
          statusText: response.statusText,
          schemaName: params.schemaName,
          model: OPENAI_MODEL,
          attempt
        });
        // 5xx → worth retrying with the same budget; 4xx → no point.
        // We're already in the retry loop, so let the outer loop decide.
        if (response.status >= 500 && !isRetry) continue;
        return null;
      }

      const payload = (await response.json()) as unknown;

      // Detect API-reported truncation up front so we don't waste a
      // JSON.parse on something we know is unparseable.
      if (wasTruncatedByLength(payload) && !isRetry) {
        console.warn(`[${params.scope}] OpenAI response truncated by max_output_tokens; retrying with bumped budget`, {
          schemaName: params.schemaName,
          initialBudget,
          retryBudget
        });
        continue;
      }

      const outputText = extractOutputText(payload);

      if (!outputText) {
        console.error(`[${params.scope}] OpenAI response missing output text`, {
          schemaName: params.schemaName,
          model: OPENAI_MODEL,
          attempt
        });
        return null;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(outputText);
      } catch (parseError) {
        // JSON.parse usually fails on mid-string truncation. If we
        // haven't retried yet, give it one more shot with more tokens.
        // After the retry, surface as a real failure.
        if (!isRetry) {
          console.warn(`[${params.scope}] OpenAI JSON parse failed; retrying with bumped budget`, {
            schemaName: params.schemaName,
            initialBudget,
            retryBudget,
            error: parseError instanceof Error ? parseError.message : String(parseError)
          });
          continue;
        }
        console.error(`[${params.scope}] OpenAI JSON parse failed after retry`, {
          schemaName: params.schemaName,
          model: OPENAI_MODEL,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          // Help debugging: log just the tail (where truncation tends
          // to land), capped to avoid filling logs with megabytes.
          outputTextTail: outputText.slice(-200)
        });
        return null;
      }

      const parsed = params.schema.safeParse(parsedJson);

      if (!parsed.success) {
        console.error(`[${params.scope}] OpenAI response failed schema validation`, {
          schemaName: params.schemaName,
          model: OPENAI_MODEL,
          attempt,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            code: issue.code
          }))
        });
        return null;
      }

      return parsed.data;
    } catch (error) {
      // Network-level failure (fetch failed / DNS / RST / TLS) — these
      // are common on flaky local networks AND when OpenAI rate-limits
      // by closing the TCP socket. We do a small bounded exponential
      // backoff with jitter so parallel callers (e.g. our two LLM
      // judges firing simultaneously) don't pile back into a
      // synchronized retry storm.
      const msg = error instanceof Error ? error.message : "Unknown error";
      const NETWORK_MAX_ATTEMPTS = 4;
      // Base delays per attempt: 0 (the initial call already failed)
      // then 200ms / 800ms / 2000ms, with ±30% jitter.
      const BASE_DELAYS = [200, 800, 2000];

      let networkAttempt = 0;
      let recovered: { ok: true; value: T } | { ok: false } | null = null;
      while (networkAttempt < NETWORK_MAX_ATTEMPTS - 1) {
        networkAttempt += 1;
        const baseDelay = BASE_DELAYS[networkAttempt - 1] ?? 2000;
        const jitter = baseDelay * (0.7 + Math.random() * 0.6); // 0.7x..1.3x
        await new Promise((r) => setTimeout(r, jitter));
        console.warn(`[${params.scope}] OpenAI request threw; retrying`, {
          schemaName: params.schemaName,
          tokenAttempt: attempt,
          networkAttempt,
          delayMs: Math.round(jitter),
          error: msg
        });
        try {
          const retryResponse = await fetch(OPENAI_RESPONSES_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: OPENAI_MODEL,
              input: params.prompt,
              max_output_tokens: tokenBudget,
              text: {
                format: {
                  type: "json_schema",
                  name: params.schemaName,
                  strict: true,
                  schema: params.jsonSchema
                }
              }
            })
          });
          if (!retryResponse.ok) {
            if (retryResponse.status >= 500) continue; // keep trying on 5xx
            recovered = { ok: false };
            break;
          }
          const retryPayload = (await retryResponse.json()) as unknown;
          if (wasTruncatedByLength(retryPayload) && !isRetry) {
            // Stop the network retry loop; let the outer token-budget
            // retry pick this up by `continue`-ing the outer for loop.
            recovered = null;
            break;
          }
          const retryText = extractOutputText(retryPayload);
          if (!retryText) {
            recovered = { ok: false };
            break;
          }
          let retryParsedJson: unknown;
          try {
            retryParsedJson = JSON.parse(retryText);
          } catch {
            if (!isRetry) {
              recovered = null;
              break;
            }
            recovered = { ok: false };
            break;
          }
          const retryParsed = params.schema.safeParse(retryParsedJson);
          if (!retryParsed.success) {
            recovered = { ok: false };
            break;
          }
          recovered = { ok: true, value: retryParsed.data };
          break;
        } catch (retryError) {
          // Stay in the loop — try again with longer backoff.
          if (networkAttempt >= NETWORK_MAX_ATTEMPTS - 1) {
            console.error(
              `[${params.scope}] OpenAI request gave up after ${networkAttempt} network retries`,
              {
                schemaName: params.schemaName,
                error:
                  retryError instanceof Error ? retryError.message : "Unknown"
              }
            );
          }
        }
      }

      if (recovered === null) {
        // Either we never recovered, or the response was truncated and
        // we want the outer token-budget retry to take over. If we did
        // exhaust the inner loop and never set `recovered`, treat as
        // hard failure.
        if (!isRetry) continue;
        return null;
      }
      if (recovered.ok) return recovered.value;
      return null;
    }
  }

  return null;
}
