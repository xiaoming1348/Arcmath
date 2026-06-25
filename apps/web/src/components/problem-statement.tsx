import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
// IMPORTANT: import the pure sanitizer from the standalone module, not
// from `generated-problem-set-pdf`. The PDF helper imports `playwright`
// at module top-level, which webpack then tries to bundle into any
// client component that transitively imports it (e.g. ExamWorkspace).
// The standalone module has no Node-only imports and is browser-safe.
import { sanitizeProblemStatement } from "@/lib/sanitize-problem-statement";

type ProblemStatementProps = {
  statement: string | null;
  statementFormat: "MARKDOWN_LATEX" | "HTML" | "PLAIN";
  compact?: boolean;
  className?: string;
  /**
   * When true, treat the input as an MC choice — runs through
   * `normalizeChoiceForDisplay` instead of `normalizeStatementForDisplay`.
   * That helper auto-wraps short pure-math strings (e.g. `\frac{3}{5}`,
   * `64\pi`) in `$...$` so KaTeX actually fires; without this many AMC
   * choices showed the raw LaTeX command as text.
   */
  choice?: boolean;
};

export function normalizeStatementForDisplay(raw: string | null): string {
  const sanitized = sanitizeProblemStatement(raw);

  return sanitized
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]])/g, "$1")
    .trim();
}

export function normalizeChoiceForDisplay(raw: string | null): string {
  const normalized = normalizeStatementForDisplay(raw);

  if (normalized.includes("$")) {
    return normalized;
  }

  const looksLikeCompactMath =
    normalized.length <= 80 &&
    /^[0-9a-zA-Z\\^_{}()+\-<>=.,/%:\s]+$/u.test(normalized) &&
    !/[.!?]$/u.test(normalized);

  if (!looksLikeCompactMath) {
    return normalized;
  }

  const latex = normalized
    .replace(/\(([^()]+)\)\/\(([^()]+)\)/gu, "\\frac{$1}{$2}")
    .replace(/sqrt\(([^()]+)\)/gu, "\\sqrt{$1}")
    .replace(/\bpi\b/gu, "\\pi")
    .replace(/(\d)\s*\\sqrt\{/gu, "$1\\sqrt{")
    .replace(/\}\s+\\sqrt\{/gu, "}\\sqrt{");

  return `$${latex}$`;
}

export function ProblemStatement({
  statement,
  statementFormat,
  compact = false,
  className = "text-sm leading-7 text-slate-800",
  choice = false
}: ProblemStatementProps) {
  const normalizedStatement = choice
    ? normalizeChoiceForDisplay(statement)
    : normalizeStatementForDisplay(statement);

  if (statementFormat !== "MARKDOWN_LATEX") {
    return <p className={`whitespace-pre-wrap ${className}`}>{normalizedStatement}</p>;
  }

  return (
    <div className={`problem-statement ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className={compact ? "mb-0" : "mb-4 last:mb-0"}>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className={compact ? "list-disc pl-6" : "mb-4 list-disc space-y-2 pl-6 last:mb-0"}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className={compact ? "list-decimal pl-6" : "mb-4 list-decimal space-y-2 pl-6 last:mb-0"}>
              {children}
            </ol>
          ),
          li: ({ children }) => <li>{children}</li>
        }}
      >
        {normalizedStatement}
      </ReactMarkdown>
    </div>
  );
}
