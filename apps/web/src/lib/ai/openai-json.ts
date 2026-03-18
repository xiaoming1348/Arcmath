import { z } from "zod";

const OPENAI_RESPONSES_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const missingApiKeyWarnings = new Set<string>();

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
        max_output_tokens: params.maxOutputTokens ?? 220,
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
        model: OPENAI_MODEL
      });
      return null;
    }

    const payload = (await response.json()) as unknown;
    const outputText = extractOutputText(payload);

    if (!outputText) {
      console.error(`[${params.scope}] OpenAI response missing output text`, {
        schemaName: params.schemaName,
        model: OPENAI_MODEL
      });
      return null;
    }

    const parsedJson = JSON.parse(outputText) as unknown;
    const parsed = params.schema.safeParse(parsedJson);

    if (!parsed.success) {
      console.error(`[${params.scope}] OpenAI response failed schema validation`, {
        schemaName: params.schemaName,
        model: OPENAI_MODEL,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code
        }))
      });
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error(`[${params.scope}] OpenAI request threw`, {
      schemaName: params.schemaName,
      model: OPENAI_MODEL,
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return null;
  }
}
