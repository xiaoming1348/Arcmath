import { chromium } from "playwright";

export type GeneratedPdfVariant = "problems" | "answers";

type RenderProblemInput = {
  number: number;
  statement: string | null;
  choices: unknown;
  answer: string | null;
};

export type RenderProblemSetPdfInput = {
  contest: string;
  year: number;
  exam: string | null;
  title: string;
  variant?: GeneratedPdfVariant;
  problems: RenderProblemInput[];
};

export type SanitizedProblemForRender = {
  number: number;
  statement: string;
  choices: string[];
  answer: string;
};

type ChoiceExtractionResult = {
  statement: string;
  choices: string[];
};

const POLLUTED_LINE_PATTERN =
  /\b(?:minor edits?|latex edits?|video solution|pi academy|education, the study of everything|thesmartgreekmathdude)\b/i;
const SOLUTION_SECTION_PATTERN = /(?:^|\n)\s*(?:Solution|Answer Key|Official Solution|Video Solution)\b/i;
const ASY_BLOCK_PATTERN = /\[asy\][\s\S]*?\[\/asy\]/gi;

const TEX_COMMAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\cdot\b/g, "·"],
  [/\\times\b/g, "×"],
  [/\\leq?\b/g, "≤"],
  [/\\geq?\b/g, "≥"],
  [/\\neq\b/g, "≠"],
  [/\\pi\b/g, "pi"],
  [/\\theta\b/g, "theta"],
  [/\\alpha\b/g, "alpha"],
  [/\\beta\b/g, "beta"],
  [/\\gamma\b/g, "gamma"],
  [/\\lambda\b/g, "lambda"],
  [/\\infty\b/g, "infinity"]
];

function normalizeWhitespace(value: string): string {
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeChoiceText(value: string): string {
  return normalizeWhitespace(value)
    .replace(/^[\s\-:;,.]+/, "")
    .replace(/\\(?:qquad|quad)/g, " ")
    .trim();
}

export function normalizeMathText(value: string): string {
  let text = value;

  text = text.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  text = text.replace(/\$([^$]+)\$/g, "$1");
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, "$1");
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, "$1");

  for (let depth = 0; depth < 6; depth += 1) {
    text = text.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
    text = text.replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)");
    text = text.replace(/\\(?:textbf|textit|mathrm|mathbf|boxed|text)\s*\{([^{}]*)\}/g, "$1");
  }

  for (const [pattern, replacement] of TEX_COMMAND_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(/\\(?:left|right)\b/g, "");
  text = text.replace(/\$/g, "");
  text = text.replace(/~/g, " ");
  text = text.replace(/[{}]/g, "");
  text = text.replace(/\\[a-zA-Z]+/g, "");
  text = text.replace(/\\(?=[0-9])/g, "");
  text = text.replace(/\\([\\{}[\]()])/g, "$1");
  text = text.replace(/\\\\/g, "\n");

  return normalizeWhitespace(text);
}

function normalizeChoiceArray(choices: unknown): string[] {
  if (!choices) {
    return [];
  }

  if (Array.isArray(choices)) {
    return choices
      .map((value) => normalizeChoiceText(typeof value === "string" ? value : String(value ?? "")))
      .filter((line) => line.length > 0);
  }

  if (typeof choices === "object") {
    return Object.entries(choices as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => normalizeChoiceText(`${key}. ${typeof value === "string" ? value : String(value ?? "")}`))
      .filter((line) => line.length > 0);
  }

  return [];
}

function extractInlineMultipleChoice(statement: string): ChoiceExtractionResult {
  const markerPatterns = ["A", "B", "C", "D", "E"].map((marker) => new RegExp(`\\(\\s*${marker}\\s*\\)`, "i"));
  const markerIndexes: number[] = [];
  let cursor = 0;

  for (const pattern of markerPatterns) {
    const scoped = statement.slice(cursor);
    const match = scoped.match(pattern);
    if (!match || match.index === undefined) {
      return { statement, choices: [] };
    }
    const absoluteIndex = cursor + match.index;
    markerIndexes.push(absoluteIndex);
    cursor = absoluteIndex + match[0].length;
  }

  if (markerIndexes.some((value, index) => index > 0 && value <= markerIndexes[index - 1])) {
    return { statement, choices: [] };
  }

  const afterLastMarker = markerIndexes[4];
  const tail = statement.slice(afterLastMarker);
  const stoppingMatches = [tail.search(/\n\s*\n/), tail.search(/\n\s*~/), tail.search(/\n\s*(?:Solution|Answer)\b/i)].filter(
    (index) => index >= 0
  );
  const blockRelativeEnd = stoppingMatches.length > 0 ? Math.min(...stoppingMatches) : tail.length;
  const blockAbsoluteEnd = afterLastMarker + blockRelativeEnd;

  const choices: string[] = [];
  const markers = ["A", "B", "C", "D", "E"];
  for (let index = 0; index < markers.length; index += 1) {
    const markerStart = markerIndexes[index];
    const markerEnd = index === markers.length - 1 ? blockAbsoluteEnd : markerIndexes[index + 1];
    const marker = markers[index];
    const content = statement
      .slice(markerStart, markerEnd)
      .replace(new RegExp(`^\\s*\\(\\s*${marker}\\s*\\)`, "i"), "")
      .trim();
    const normalized = normalizeChoiceText(content);
    if (!normalized) {
      return { statement, choices: [] };
    }
    choices.push(normalized);
  }

  return {
    statement: normalizeWhitespace(statement.slice(0, markerIndexes[0])),
    choices
  };
}

export function sanitizeProblemStatement(raw: string | null): string {
  if (!raw) {
    return "Statement not available.";
  }

  let statement = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(ASY_BLOCK_PATTERN, "");

  const sectionMatch = statement.match(SOLUTION_SECTION_PATTERN);
  if (sectionMatch?.index !== undefined) {
    statement = statement.slice(0, sectionMatch.index);
  }

  const cleanedLines = statement
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\s*~/.test(line))
    .filter((line) => !POLLUTED_LINE_PATTERN.test(line));

  statement = normalizeWhitespace(cleanedLines.join("\n"));
  if (!statement) {
    return "Statement not available.";
  }

  const paragraphs = statement.split(/\n\s*\n/).map((part) => part.trim()).filter((part) => part.length > 0);
  if (paragraphs.length > 2 && statement.length > 1200) {
    statement = `${paragraphs[0]}\n\n${paragraphs[1]}`;
  }

  return normalizeWhitespace(statement);
}

export function sanitizeProblemForRender(problem: RenderProblemInput): SanitizedProblemForRender {
  const baseStatement = sanitizeProblemStatement(problem.statement);
  const explicitChoices = normalizeChoiceArray(problem.choices);
  const inferredChoicesResult =
    explicitChoices.length > 0
      ? { statement: baseStatement, choices: explicitChoices }
      : extractInlineMultipleChoice(baseStatement);

  return {
    number: problem.number,
    statement: normalizeMathText(inferredChoicesResult.statement || "Statement not available."),
    choices: inferredChoicesResult.choices
      .map((choice) => normalizeChoiceText(normalizeMathText(choice)))
      .filter((choice) => choice.length > 0),
    answer: normalizeWhitespace(normalizeMathText(problem.answer ?? ""))
  };
}

function formatTextToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

function buildProblemsBody(problems: SanitizedProblemForRender[]): string {
  return problems
    .map((problem) => {
      const choicesHtml =
        problem.choices.length > 0
          ? `<ol class="choices">${problem.choices
              .map((choice) => `<li>${formatTextToHtml(choice)}</li>`)
              .join("")}</ol>`
          : "";
      return `<article class="problem">
  <h2>Problem ${problem.number}</h2>
  <div class="statement">${formatTextToHtml(problem.statement)}</div>
  ${choicesHtml}
</article>`;
    })
    .join("\n");
}

function buildAnswersBody(problems: SanitizedProblemForRender[]): string {
  const rows = problems
    .filter((problem) => problem.answer.length > 0)
    .sort((left, right) => left.number - right.number)
    .map(
      (problem) => `<li><span class="answer-problem">Problem ${problem.number}:</span> <span class="answer-value">${escapeHtml(problem.answer)}</span></li>`
    )
    .join("\n");

  const body =
    rows.length > 0
      ? rows
      : `<li class="empty">No answers available.</li>`;

  return `<section class="answer-key">
  <h2>Answer Key</h2>
  <ol class="answer-list">
    ${body}
  </ol>
</section>`;
}

function buildRenderHtml(input: {
  title: string;
  contest: string;
  year: number;
  exam: string | null;
  variant: GeneratedPdfVariant;
  problems: SanitizedProblemForRender[];
}): string {
  const variantLabel = input.variant === "problems" ? "Problems" : "Answers";
  const metadata = `${input.contest} ${input.year}${input.exam ? ` ${input.exam}` : ""}`;
  const body = input.variant === "problems" ? buildProblemsBody(input.problems) : buildAnswersBody(input.problems);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)} ${escapeHtml(variantLabel)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Times New Roman", Georgia, "Nimbus Roman", serif;
      font-size: 12pt;
      line-height: 1.35;
      color: #111827;
      background: #ffffff;
    }
    main { padding: 0; }
    header.paper {
      text-align: center;
      border-bottom: 1px solid #d1d5db;
      margin-bottom: 14px;
      padding-bottom: 8px;
    }
    header.paper h1 {
      font-size: 22px;
      margin: 0 0 4px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    header.paper .meta {
      margin: 0;
      color: #374151;
      font-size: 11pt;
    }
    article.problem {
      margin-bottom: 16px;
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    article.problem h2,
    section.answer-key h2 {
      font-size: 15px;
      margin: 0 0 6px;
      font-weight: 700;
    }
    .statement p {
      margin: 0 0 8px;
      text-align: left;
    }
    .choices {
      margin: 6px 0 0 20px;
      padding: 0;
      list-style-type: upper-alpha;
    }
    .choices li {
      margin: 3px 0;
      padding-left: 2px;
    }
    .choices li p {
      margin: 0;
    }
    .answer-list {
      margin: 8px 0 0 20px;
      padding: 0;
    }
    .answer-list li {
      margin: 2px 0;
    }
    .answer-problem {
      font-weight: 700;
    }
    .empty {
      color: #6b7280;
      font-style: italic;
      text-align: center;
    }
    mjx-container { font-size: 1em !important; }
  </style>
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
        processEscapes: true
      },
      options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
      },
      chtml: {
        scale: 0.98
      }
    };
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
</head>
<body>
  <main>
    <header class="paper">
      <h1>${escapeHtml(input.title)}</h1>
      <p class="meta">${escapeHtml(metadata)} • ${escapeHtml(variantLabel)}</p>
    </header>
    ${body}
  </main>
</body>
</html>`;
}

export async function renderProblemSetPdf(input: RenderProblemSetPdfInput): Promise<Buffer> {
  const variant: GeneratedPdfVariant = input.variant ?? "problems";
  const normalizedProblems = input.problems
    .map((problem) => sanitizeProblemForRender(problem))
    .sort((left, right) => left.number - right.number);

  const html = buildRenderHtml({
    title: input.title,
    contest: input.contest,
    year: input.year,
    exam: input.exam,
    variant,
    problems: normalizedProblems
  });

  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 1600 }
    });
    await page.setContent(html, {
      waitUntil: "networkidle",
      timeout: 30_000
    });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    await page.evaluate(async () => {
      const mathJax = (window as any).MathJax;
      if (mathJax?.startup?.promise) {
        await mathJax.startup.promise;
      }
      if (mathJax?.typesetPromise) {
        await mathJax.typesetPromise();
      }
    });

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        "<div style=\"font-size:9px; width:100%; text-align:center; color:#6b7280; padding-right:20px;\">Page <span class=\"pageNumber\"></span> of <span class=\"totalPages\"></span></div>",
      margin: {
        top: "0.7in",
        right: "0.7in",
        bottom: "0.75in",
        left: "0.7in"
      }
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
