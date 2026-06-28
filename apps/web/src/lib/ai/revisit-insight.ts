import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";

/**
 * On-demand "AI insight" for the /reports/revisit page.
 *
 * Separate from `generateLearningReport` because:
 *   - The main report is auto-generated on every /reports view; this
 *     one is triggered by an explicit student click on /reports/revisit.
 *     We don't want to pay tokens on every page load for an analysis
 *     the student may never read.
 *   - The framing is different. The main report is a forward-looking
 *     "what to do next." The revisit insight is a backward-looking
 *     "what your last wrong answers suggest about your weak points."
 *
 * Input shape: per-set wrong-attempt summaries + topic distribution.
 * We deliberately do NOT send the full problem statements — they are
 * long, multi-paragraph LaTeX, and the AI only needs the topic / pattern
 * signal to produce a useful insight. This keeps token cost low (~500
 * input tokens for a typical 5-set window) and the prompt focused.
 */

export const revisitInsightOutputSchema = z.object({
  insight: z
    .string()
    .min(1, "AI insight must be a non-empty paragraph.")
    .max(2000, "AI insight must not exceed 2000 characters.")
});

export const revisitInsightOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["insight"],
  properties: {
    insight: {
      type: "string",
      description:
        "One concise paragraph (3-6 sentences) summarising the student's weak-point pattern across the recent wrong-answered problems. Plain prose, no bullet lists."
    }
  }
} as const;

export type RevisitInsightInput = {
  language: "en" | "zh";
  perSet: Array<{
    problemSetTitle: string;
    problemSetLabel: string | null;
    completedAt: string;
    accuracy: number;
    totalSubmitted: number;
    totalCorrect: number;
    wrongTopics: Array<{ topicKey: string; count: number }>;
    sampleWrongStatements: string[];
  }>;
};

function formatTopicLabel(topicKey: string): string {
  return topicKey
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function buildPrompt(input: RevisitInsightInput): string {
  const langInstruction =
    input.language === "zh"
      ? "Respond in fluent Chinese (simplified, mainland conventions)."
      : "Respond in fluent English.";

  const setBlocks = input.perSet
    .map((set, i) => {
      const date = new Date(set.completedAt).toISOString().slice(0, 10);
      const topics = set.wrongTopics
        .slice(0, 5)
        .map((t) => `    ${formatTopicLabel(t.topicKey)}: ${t.count}`)
        .join("\n");
      const samples = set.sampleWrongStatements
        .slice(0, 3)
        .map((s) => `    - ${s.slice(0, 180)}${s.length > 180 ? "…" : ""}`)
        .join("\n");
      return [
        `Set ${i + 1}: ${set.problemSetTitle}${set.problemSetLabel ? ` (${set.problemSetLabel})` : ""}`,
        `  Completed: ${date}`,
        `  Accuracy: ${Math.round(set.accuracy * 100)}% (${set.totalCorrect}/${set.totalSubmitted})`,
        `  Wrong-answer topics:`,
        topics || "    (none)",
        samples ? `  Sample wrong-answer statements:\n${samples}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return [
    "You are an experienced math-olympiad coach reviewing a student's recent wrong-answer pattern.",
    "Based ONLY on the data below, identify the SPECIFIC weak points emerging across recent sets, and what they suggest about the student's next study focus.",
    "",
    "Rules:",
    "- One concise paragraph (3-6 sentences). No bullet lists.",
    "- Be specific about topics (e.g. 'similar-triangle recognition in geometry,' 'AM-GM equality conditions in inequalities'). Vague feedback like 'work on geometry' is unhelpful.",
    "- Acknowledge what the student is doing well if the data shows it, before naming the weak point.",
    "- Do NOT invent topics that aren't in the data.",
    "- Do NOT recommend specific problem sets — keep the focus on the pattern itself.",
    langInstruction,
    "",
    "Data (last 5 distinct practice sets, most recent first):",
    setBlocks
  ].join("\n");
}

/**
 * Build the AI insight. Returns `null` on any failure (network, parse,
 * empty response). The caller should fall back to a generic message.
 */
export async function generateRevisitInsight(
  input: RevisitInsightInput
): Promise<{ insight: string; generatedAt: string } | null> {
  const result = await callOpenAIJson({
    scope: "revisit-insight",
    schemaName: "revisit_insight",
    prompt: buildPrompt(input),
    schema: revisitInsightOutputSchema,
    jsonSchema: revisitInsightOutputJsonSchema,
    maxOutputTokens: 320
  });
  if (!result) return null;
  return {
    insight: result.insight,
    generatedAt: new Date().toISOString()
  };
}
