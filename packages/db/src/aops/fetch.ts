import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { importProblemSetSchema, type Contest, type ImportProblemSetInput } from "@arcmath/shared";

const AOPS_BASE = "https://artofproblemsolving.com";
const DEFAULT_CATEGORY_URL = `${AOPS_BASE}/community/c13_contests`;
const MAX_PROBLEM_NUMBER = 30;
const FETCH_TIMEOUT_MS = 20_000;

export type ContestTopic = {
  topicId: number;
  title: string;
  url: string;
  contest: Contest;
  year: number;
  exam: string | null;
};

export type ResolvedSingleTopicMetadata = {
  topicId: number | null;
  title: string;
  topicUrl: string;
  contest: Contest;
  year: number;
  exam: string | null;
};

export type SingleTopicFetchResult = {
  payload: ImportProblemSetInput;
  metadata: ResolvedSingleTopicMetadata;
  extraction: TopicContentExtraction;
};

export type TopicContentExtraction = {
  strategy:
    | "bootstrap.preload_posts"
    | "bootstrap.preload_topics"
    | "bootstrap.other_field"
    | "dom.fallback"
    | "wiki.fallback";
  attemptedStrategies: string[];
};

export type FetchOptions = {
  source?: "auto" | "community" | "wiki";
  categoryUrl?: string;
  pages?: number;
  allPages?: boolean;
  maxPages?: number;
  limit?: number;
  includeContests?: Contest[];
  yearFrom?: number;
  yearTo?: number;
  delayMs?: number;
  topicIds?: number[];
  includeStatements?: boolean;
  skipExisting?: boolean;
  outputDir: string;
  dryRun?: boolean;
};

export type FetchSummary = {
  discovered: number;
  attempted: number;
  written: number;
  skipped: number;
  failed: number;
  outputs: string[];
  errors: string[];
};

type AnswerToken = {
  value: string;
  format: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeTitleForInference(value: string): string {
  return value
    .replace(/\bAMC\s*12([AB])HSME\b/gi, "AMC 12 $1 HSME")
    .replace(/\bAMC12([AB])HSME\b/gi, "AMC 12 $1 HSME")
    .replace(/\bAMC\s*10([AB])HSME\b/gi, "AMC 10 $1 HSME")
    .replace(/\bAMC10([AB])HSME\b/gi, "AMC 10 $1 HSME");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
}

function htmlToText(html: string): string {
  return normalizeWhitespace(
    decodeEntities(
      html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<li>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
    ).replace(/\n+/g, "\n")
  );
}

function extractBootstrapJson(html: string): unknown {
  const marker = "AoPS.bootstrap_data = ";
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error("Unable to locate AoPS bootstrap data");
  }

  const afterMarker = html.slice(start + marker.length);
  const endMarker = ";\n\tAoPS.bd";
  const end = afterMarker.indexOf(endMarker);
  if (end < 0) {
    throw new Error("Unable to parse AoPS bootstrap payload");
  }

  const jsonText = afterMarker.slice(0, end);
  return JSON.parse(jsonText);
}

function parseYear(value: string, fallbackYear?: number): number | null {
  const fromTitle = value.match(/\b(19\d{2}|20\d{2})\b/);
  if (fromTitle) {
    return Number(fromTitle[1]);
  }

  if (fallbackYear && fallbackYear >= 1950 && fallbackYear <= new Date().getFullYear() + 1) {
    return fallbackYear;
  }

  return null;
}

function parseAmc10ExamForText(textUpper: string): string | null {
  const examMatch =
    textUpper.match(/\bAMC\s*10\s*([AB])\b/) ??
    textUpper.match(/\bAMC10([AB])\b/) ??
    textUpper.match(/\b([AB])\s*AMC\s*10\b/);
  return examMatch?.[1] ?? null;
}

function parseAmc12ExamForText(textUpper: string): string | null {
  const examMatch =
    textUpper.match(/\bAMC\s*12\s*([AB])\b/) ??
    textUpper.match(/\bAMC12([AB])\b/) ??
    textUpper.match(/\b([AB])\s*AMC\s*12\b/);
  return examMatch?.[1] ?? null;
}

function parseExamForContest(titleUpper: string, contest: Contest): string | null {
  if (contest === "AMC8") {
    return null;
  }

  if (contest === "AMC10" || contest === "AMC12") {
    return contest === "AMC10" ? parseAmc10ExamForText(titleUpper) : parseAmc12ExamForText(titleUpper);
  }

  const aimeRomanMatch = titleUpper.match(/\bAIME\s*(I|II)\b/);
  if (aimeRomanMatch) {
    return aimeRomanMatch[1];
  }

  const aimeNumberMatch = titleUpper.match(/\bAIME\s*(1|2)\b/);
  if (aimeNumberMatch) {
    return aimeNumberMatch[1] === "1" ? "I" : "II";
  }

  return null;
}

function parseAmc10ExamMention(textUpper: string): string | null | "AMBIGUOUS" {
  const hasA = /\bAMC\s*10\s*A\b/.test(textUpper) || /\bAMC10A\b/.test(textUpper);
  const hasB = /\bAMC\s*10\s*B\b/.test(textUpper) || /\bAMC10B\b/.test(textUpper);

  if (hasA && hasB) {
    return "AMBIGUOUS";
  }

  if (hasA) {
    return "A";
  }
  if (hasB) {
    return "B";
  }

  return null;
}

function parseAmc12ExamMention(textUpper: string): string | null | "AMBIGUOUS" {
  const hasA = /\bAMC\s*12\s*A\b/.test(textUpper) || /\bAMC12A\b/.test(textUpper);
  const hasB = /\bAMC\s*12\s*B\b/.test(textUpper) || /\bAMC12B\b/.test(textUpper);

  if (hasA && hasB) {
    return "AMBIGUOUS";
  }

  if (hasA) {
    return "A";
  }
  if (hasB) {
    return "B";
  }

  return null;
}

function parseAimeExamMention(textUpper: string): string | null | "AMBIGUOUS" {
  const hasI = /\bAIME\s*I\b/.test(textUpper) || /\bAIME\s*1\b/.test(textUpper);
  const hasII = /\bAIME\s*II\b/.test(textUpper) || /\bAIME\s*2\b/.test(textUpper);

  if (hasI && hasII) {
    return "AMBIGUOUS";
  }
  if (hasI) {
    return "I";
  }
  if (hasII) {
    return "II";
  }
  return null;
}

export function parseContestFromTitle(title: string, fallbackYear?: number): Omit<ContestTopic, "topicId" | "url"> | null {
  const normalized = normalizeTitleForInference(title.toUpperCase());
  let contest: Contest | null = null;

  if (/\bAMC\s*8\b/.test(normalized)) {
    contest = "AMC8";
  } else if (/\bAMC\s*10(?:\s*[AB])?\b|\bAMC10[AB]?\b/.test(normalized)) {
    contest = "AMC10";
  } else if (/\bAMC\s*12(?:\s*[AB])?\b|\bAMC12[AB]?\b/.test(normalized)) {
    contest = "AMC12";
  } else if (/\bAIME\b/.test(normalized)) {
    contest = "AIME";
  }

  if (!contest) {
    return null;
  }

  const year = parseYear(title, fallbackYear);
  if (!year) {
    return null;
  }

  const exam = parseExamForContest(normalized, contest);
  if ((contest === "AMC10" || contest === "AMC12") && !exam) {
    return null;
  }
  if (contest === "AIME" && !exam) {
    return null;
  }

  return {
    title,
    contest,
    year,
    exam
  };
}

function extractTopicIdFromUrlPath(pathname: string): number | null {
  const normalized = pathname.trim();
  const cMatch = normalized.match(/\/community\/c(\d+)(?:_|$)/i);
  if (cMatch) {
    return Number(cMatch[1]);
  }

  const hMatch = normalized.match(/\/community\/h(\d+)(?:\/|$)?/i);
  if (hMatch) {
    return Number(hMatch[1]);
  }

  return null;
}

export function parseAoPSCommunityTopicUrl(topicUrl: string): { canonicalUrl: string; topicId: number | null } {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(topicUrl);
  } catch {
    throw new Error("Invalid topic URL.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Topic URL must use http or https.");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname !== "artofproblemsolving.com" && hostname !== "www.artofproblemsolving.com") {
    throw new Error("Topic URL must be on artofproblemsolving.com.");
  }

  if (!parsedUrl.pathname.startsWith("/community/")) {
    throw new Error("Topic URL must point to an AoPS community topic page.");
  }

  const topicId = extractTopicIdFromUrlPath(parsedUrl.pathname);
  if (!topicId) {
    throw new Error("Topic URL must point to a direct AoPS topic page, not a category listing.");
  }

  parsedUrl.hash = "";
  return {
    canonicalUrl: parsedUrl.toString(),
    topicId
  };
}

export function resolveSingleTopicMetadata(input: {
  title: string;
  contentText?: string;
  fallbackYear?: number;
  topicId?: number | null;
  topicUrl: string;
}): ResolvedSingleTopicMetadata {
  const direct = parseContestFromTitle(input.title, input.fallbackYear);
  if (direct) {
    return {
      topicId: input.topicId ?? null,
      title: direct.title,
      topicUrl: input.topicUrl,
      contest: direct.contest,
      year: direct.year,
      exam: direct.exam
    };
  }

  const titleUpper = input.title.toUpperCase();
  const normalizedTitleUpper = normalizeTitleForInference(titleUpper);
  const normalizedBodyUpper = normalizeTitleForInference((input.contentText ?? "").toUpperCase());
  const combinedText = [input.title, input.contentText ?? ""].join("\n");
  const year = parseYear(input.title, input.fallbackYear) ?? parseYear(input.contentText ?? "", input.fallbackYear);
  if (!year) {
    throw new Error("Could not resolve supported contest/year/exam from topic title/content: missing year.");
  }

  const titleContainsAhsme =
    /\bAHSME\b/.test(normalizedTitleUpper) || /\bAMC\s*12\s*AHSME\b/.test(normalizedTitleUpper);
  const bodyContainsAhsme =
    /\bAHSME\b/.test(normalizedBodyUpper) || /\bAMC\s*12\s*AHSME\b/.test(normalizedBodyUpper);
  const titleAmc12Exam = parseAmc12ExamMention(normalizedTitleUpper);
  const bodyAmc12Exam = parseAmc12ExamMention(normalizedBodyUpper);
  const titleAmc10Exam = parseAmc10ExamMention(normalizedTitleUpper);
  const bodyAmc10Exam = parseAmc10ExamMention(normalizedBodyUpper);
  const titleAimeExam = parseAimeExamMention(normalizedTitleUpper);
  const bodyAimeExam = parseAimeExamMention(normalizedBodyUpper);
  const titleMentionsAmc12 = /\bAMC\s*12\b|\bAMC12\b/.test(normalizedTitleUpper);
  const bodyMentionsAmc12 = /\bAMC\s*12\b|\bAMC12\b/.test(normalizedBodyUpper);
  const titleMentionsAmc10 = /\bAMC\s*10\b|\bAMC10\b/.test(normalizedTitleUpper);
  const bodyMentionsAmc10 = /\bAMC\s*10\b|\bAMC10\b/.test(normalizedBodyUpper);
  const titleMentionsAime = /\bAIME\b/.test(normalizedTitleUpper);
  const bodyMentionsAime = /\bAIME\b/.test(normalizedBodyUpper);
  const titleMentionsAmc8 = /\bAMC\s*8\b|\bAMC8\b/.test(normalizedTitleUpper);
  const bodyMentionsAmc8 = /\bAMC\s*8\b|\bAMC8\b/.test(normalizedBodyUpper);

  if (titleContainsAhsme || bodyContainsAhsme) {
    const ahsmeExam = titleAmc12Exam === "A" || titleAmc12Exam === "B" ? titleAmc12Exam : bodyAmc12Exam;
    if (titleAmc12Exam === "AMBIGUOUS" || bodyAmc12Exam === "AMBIGUOUS") {
      throw new Error("Unsupported/ambiguous topic: page references both AMC12A and AMC12B.");
    }
    if (ahsmeExam === "A" || ahsmeExam === "B") {
      return {
        topicId: input.topicId ?? null,
        title: input.title,
        topicUrl: input.topicUrl,
        contest: "AMC12",
        year,
        exam: ahsmeExam
      };
    }

    throw new Error('Unsupported/ambiguous topic: "AHSME" does not map cleanly to AMC12A or AMC12B.');
  }

  if (titleMentionsAmc12 || (!titleMentionsAmc10 && !titleMentionsAime && !titleMentionsAmc8 && bodyMentionsAmc12)) {
    const exam = titleAmc12Exam === "A" || titleAmc12Exam === "B" ? titleAmc12Exam : bodyAmc12Exam;
    if (titleAmc12Exam === "AMBIGUOUS" || bodyAmc12Exam === "AMBIGUOUS") {
      throw new Error("Unsupported/ambiguous topic: page references both AMC12A and AMC12B.");
    }
    if (exam === "A" || exam === "B") {
      return {
        topicId: input.topicId ?? null,
        title: input.title,
        topicUrl: input.topicUrl,
        contest: "AMC12",
        year,
        exam
      };
    }
  }

  if (titleMentionsAmc10 || (!titleMentionsAmc12 && !titleMentionsAime && !titleMentionsAmc8 && bodyMentionsAmc10)) {
    const exam = titleAmc10Exam === "A" || titleAmc10Exam === "B" ? titleAmc10Exam : bodyAmc10Exam;
    if (titleAmc10Exam === "AMBIGUOUS" || bodyAmc10Exam === "AMBIGUOUS") {
      throw new Error("Unsupported/ambiguous topic: page references both AMC10A and AMC10B.");
    }
    if (exam === "A" || exam === "B") {
      return {
        topicId: input.topicId ?? null,
        title: input.title,
        topicUrl: input.topicUrl,
        contest: "AMC10",
        year,
        exam
      };
    }
  }

  if (titleMentionsAime || (!titleMentionsAmc12 && !titleMentionsAmc10 && !titleMentionsAmc8 && bodyMentionsAime)) {
    const exam = titleAimeExam === "I" || titleAimeExam === "II" ? titleAimeExam : bodyAimeExam;
    if (titleAimeExam === "AMBIGUOUS" || bodyAimeExam === "AMBIGUOUS") {
      throw new Error("Unsupported/ambiguous topic: page references both AIME I and AIME II.");
    }
    if (exam === "I" || exam === "II") {
      return {
        topicId: input.topicId ?? null,
        title: input.title,
        topicUrl: input.topicUrl,
        contest: "AIME",
        year,
        exam
      };
    }
  }

  if (titleMentionsAmc8 || (!titleMentionsAmc12 && !titleMentionsAmc10 && !titleMentionsAime && bodyMentionsAmc8)) {
    return {
      topicId: input.topicId ?? null,
      title: input.title,
      topicUrl: input.topicUrl,
      contest: "AMC8",
      year,
      exam: null
    };
  }

  throw new Error("Could not resolve supported contest/year/exam from topic title/content.");
}

function toAbsoluteUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    return `${AOPS_BASE}${value}`;
  }

  return `${AOPS_BASE}/${value}`;
}

function parseFallbackYear(topic: Record<string, unknown>): number | undefined {
  const unixCandidates = [
    topic.last_post_time,
    topic.post_time,
    topic.time,
    topic.posted
  ].filter((value): value is number => typeof value === "number");

  for (const unix of unixCandidates) {
    const date = new Date(unix * 1000);
    const year = date.getUTCFullYear();
    if (year >= 1950 && year <= new Date().getFullYear() + 1) {
      return year;
    }
  }

  return undefined;
}

export function parseContestTopicsFromCategoryHtml(html: string, includeContests?: Contest[]): ContestTopic[] {
  const data = extractBootstrapJson(html) as { preload_topics?: unknown[] };
  const topics = Array.isArray(data.preload_topics) ? data.preload_topics : [];
  const allowed = includeContests ? new Set(includeContests) : null;

  const parsed = topics
    .map((topicRaw) => topicRaw as Record<string, unknown>)
    .map((topic) => {
      const title = typeof topic.topic_title === "string" ? topic.topic_title : null;
      const topicId = typeof topic.topic_id === "number" ? topic.topic_id : null;
      const topicUrl = toAbsoluteUrl(typeof topic.topic_url === "string" ? topic.topic_url : undefined);
      const fallbackYear = parseFallbackYear(topic);

      if (!title || !topicId) {
        return null;
      }

      const parsedContest = parseContestFromTitle(title, fallbackYear);
      if (!parsedContest) {
        return null;
      }

      if (allowed && !allowed.has(parsedContest.contest)) {
        return null;
      }

      return {
        topicId,
        title,
        contest: parsedContest.contest,
        year: parsedContest.year,
        exam: parsedContest.exam,
        url: topicUrl ?? `${AOPS_BASE}/community/h${topicId}`
      } satisfies ContestTopic;
    })
    .filter((topic): topic is ContestTopic => topic !== null);

  const dedup = new Map<number, ContestTopic>();
  for (const topic of parsed) {
    dedup.set(topic.topicId, topic);
  }

  return [...dedup.values()];
}

function parseAnswerToken(raw: string): AnswerToken {
  const token = raw.trim().toUpperCase();
  if (/^[A-E]$/.test(token)) {
    return { value: token, format: "MULTIPLE_CHOICE" };
  }
  if (/^-?\d+$/.test(token)) {
    return { value: token, format: "INTEGER" };
  }
  return { value: token, format: "EXPRESSION" };
}

export function extractAnswerMap(text: string): Map<number, AnswerToken> {
  const answerMap = new Map<number, AnswerToken>();
  const densePattern = /(?:^|\s)(\d{1,2})\s*[:.)-]\s*([A-E]|-?\d+|[A-Za-z0-9+\-*/^()]+)/g;
  for (const match of text.matchAll(densePattern)) {
    const number = Number(match[1]);
    if (!Number.isInteger(number) || number < 1 || number > MAX_PROBLEM_NUMBER) {
      continue;
    }
    answerMap.set(number, parseAnswerToken(match[2]));
  }

  return answerMap;
}

type ExtractedProblem = {
  number: number;
  statement?: string;
  answer?: string;
  answerFormat?: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
};

function cleanupStatement(statement: string): string {
  return normalizeWhitespace(
    statement
      .replace(/^Problem\s*\d+\s*[:.)-]?\s*/i, "")
      .replace(/\bAnswer\s*[:\-]\s*[A-Za-z0-9+\-*/^()]+\b/gi, "")
  );
}

export function extractProblemBlocks(text: string): ExtractedProblem[] {
  const problems: ExtractedProblem[] = [];
  const bodyText = text.split(/\n\s*(?:Answer Key|Answers)\b/i)[0] ?? text;
  const blockPattern =
    /(?:^|\n)\s*(?:Problem\s*)?(\d{1,2})\s*[:.)-]\s*([\s\S]*?)(?=\n\s*(?:Problem\s*)?\d{1,2}\s*[:.)-]\s*|\n\s*(?:Answer Key|Answers?)\b|$)/gi;

  for (const match of bodyText.matchAll(blockPattern)) {
    const number = Number(match[1]);
    if (!Number.isInteger(number) || number < 1 || number > MAX_PROBLEM_NUMBER) {
      continue;
    }

    const rawBody = match[2];
    const answerInline = rawBody.match(/\bAnswer\s*[:\-]\s*([A-E]|-?\d+|[A-Za-z0-9+\-*/^()]+)/i);
    const parsedAnswer = answerInline ? parseAnswerToken(answerInline[1]) : null;
    const statement = cleanupStatement(rawBody);

    problems.push({
      number,
      statement: statement.length > 0 ? statement : undefined,
      answer: parsedAnswer?.value,
      answerFormat: parsedAnswer?.format
    });
  }

  return problems;
}

type ParsedTopicBootstrap = {
  title: string | null;
  topicUrl: string | null;
  fallbackYear: number | undefined;
  postHtml: string;
  extraction: TopicContentExtraction;
};

function decodeHtmlAttributeValue(value: string): string {
  return decodeEntities(value)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"');
}

function stripOuterContainer(fragment: string): string {
  const trimmed = fragment.trim();
  const openTagEnd = trimmed.indexOf(">");
  const closeTagStart = trimmed.lastIndexOf("</");
  if (trimmed.startsWith("<div") && openTagEnd >= 0 && closeTagStart > openTagEnd) {
    return trimmed.slice(openTagEnd + 1, closeTagStart).trim();
  }
  return trimmed;
}

function appendUniqueFragments(target: string[], fragments: string[]): void {
  for (const fragment of fragments) {
    const normalized = fragment.trim();
    if (!normalized || target.includes(normalized)) {
      continue;
    }
    target.push(normalized);
  }
}

function collectStringsFromBootstrapField(
  value: unknown,
  pathLabel: string,
  fragments: string[],
  attempted: string[]
): boolean {
  attempted.push(pathLabel);
  let matched = false;
  const candidateKeys = new Set([
    "post_html",
    "post_content",
    "raw_post",
    "content_html",
    "cmty_post_html",
    "post_rendered"
  ]);

  const visit = (candidate: unknown, pathHint: string) => {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (
        trimmed.length > 0 &&
        (/<[a-z][\s\S]*>/i.test(trimmed) || /Problem\s+\d+/i.test(trimmed) || /Answer Key/i.test(trimmed))
      ) {
        appendUniqueFragments(fragments, [trimmed]);
        matched = true;
      }
      return;
    }

    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) {
        visit(candidate[index], `${pathHint}[${index}]`);
      }
      return;
    }

    if (!candidate || typeof candidate !== "object") {
      return;
    }

    for (const [key, nested] of Object.entries(candidate as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();
      if (keyLower === "global_announcements" || keyLower === "community_inactive_message") {
        continue;
      }
      if (candidateKeys.has(keyLower)) {
        visit(nested, `${pathHint}.${key}`);
        continue;
      }
      visit(nested, `${pathHint}.${key}`);
    }
  };

  visit(value, pathLabel);
  return matched;
}

function extractTopicContentFromBootstrap(data: unknown): {
  postHtml: string;
  extraction: TopicContentExtraction;
} | null {
  const attempted: string[] = [];
  const fragments: string[] = [];
  const record = (strategy: TopicContentExtraction["strategy"]): {
    postHtml: string;
    extraction: TopicContentExtraction;
  } | null => {
    if (fragments.length === 0) {
      return null;
    }
    return {
      postHtml: fragments.join("\n"),
      extraction: {
        strategy,
        attemptedStrategies: [...attempted]
      }
    };
  };

  const bootstrap = data as {
    preload_posts?: Array<{ post_data?: string }>;
    preload_topics?: Array<{ topic_title?: string; topic_url?: string; post_data?: string; last_post_time?: number }>;
  };

  attempted.push("bootstrap.preload_posts");
  if (Array.isArray(bootstrap.preload_posts)) {
    for (const post of bootstrap.preload_posts) {
      if (typeof post.post_data === "string" && post.post_data.trim().length > 0) {
        appendUniqueFragments(fragments, [post.post_data]);
      }
    }
  }
  const preloadPostsResult = record("bootstrap.preload_posts");
  if (preloadPostsResult) {
    return preloadPostsResult;
  }

  attempted.push("bootstrap.preload_topics");
  if (Array.isArray(bootstrap.preload_topics)) {
    for (const topic of bootstrap.preload_topics) {
      if (typeof topic.post_data === "string" && topic.post_data.trim().length > 0) {
        appendUniqueFragments(fragments, [topic.post_data]);
      }
    }
  }
  const preloadTopicsResult = record("bootstrap.preload_topics");
  if (preloadTopicsResult) {
    return preloadTopicsResult;
  }

  fragments.length = 0;
  const matchedOtherField = collectStringsFromBootstrapField(data, "bootstrap.other_field", fragments, attempted);
  if (matchedOtherField) {
    const otherFieldResult = record("bootstrap.other_field");
    if (otherFieldResult) {
      return otherFieldResult;
    }
  }

  return {
    postHtml: "",
    extraction: {
      strategy: "bootstrap.other_field",
      attemptedStrategies: [...attempted]
    }
  };
}

function extractDomFallbackPostHtml(topicHtml: string): string[] {
  const results: string[] = [];

  for (const match of topicHtml.matchAll(
    /<(div|article|section)[^>]*(?:class|id)="[^"]*(cmty-post-html|cmty-post-body|cmty-post-content|post-body)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi
  )) {
    const normalized = stripOuterContainer(match[0]) || (match[3] ?? "");
    appendUniqueFragments(results, [normalized]);
  }

  for (const match of topicHtml.matchAll(/data-post-html="([^"]+)"/gi)) {
    appendUniqueFragments(results, [decodeHtmlAttributeValue(match[1])]);
  }

  for (const match of topicHtml.matchAll(/data-raw-post="([^"]+)"/gi)) {
    appendUniqueFragments(results, [decodeHtmlAttributeValue(match[1])]);
  }

  const directArticle = topicHtml.match(
    /<div[^>]*class="[^"]*cmty-topic-posts[^"]*"[^>]*>[\s\S]*?(<div[^>]*class="[^"]*cmty-post[^"]*"[^>]*>[\s\S]*?)<\/div>\s*<\/div>/i
  );
  if (directArticle?.[1]) {
    appendUniqueFragments(results, [stripOuterContainer(directArticle[1])]);
  }

  return results.filter((fragment) => fragment.trim().length > 0);
}

export function parseTopicBootstrap(topicHtml: string): ParsedTopicBootstrap {
  const data = extractBootstrapJson(topicHtml) as {
    preload_posts?: Array<{ post_data?: string }>;
    preload_topics?: Array<{ topic_title?: string; topic_url?: string; post_data?: string; last_post_time?: number }>;
  };

  const firstTopic = Array.isArray(data.preload_topics) ? data.preload_topics[0] : undefined;
  const bootstrapExtraction = extractTopicContentFromBootstrap(data);
  let postHtml = bootstrapExtraction?.postHtml ?? "";
  let extraction = bootstrapExtraction?.extraction ?? {
    strategy: "bootstrap.other_field",
    attemptedStrategies: ["bootstrap.preload_posts", "bootstrap.preload_topics", "bootstrap.other_field"]
  };

  if (!postHtml.trim()) {
    const attemptedStrategies = [...extraction.attemptedStrategies, "dom.fallback"];
    const domFragments = extractDomFallbackPostHtml(topicHtml);
    if (domFragments.length > 0) {
      postHtml = domFragments.join("\n");
      extraction = {
        strategy: "dom.fallback",
        attemptedStrategies
      };
    } else {
      throw new Error(`No post content found after attempting: ${attemptedStrategies.join(", ")}`);
    }
  }

  return {
    title: typeof firstTopic?.topic_title === "string" ? firstTopic.topic_title : null,
    topicUrl: toAbsoluteUrl(typeof firstTopic?.topic_url === "string" ? firstTopic.topic_url : undefined),
    fallbackYear: firstTopic ? parseFallbackYear(firstTopic as Record<string, unknown>) : undefined,
    postHtml,
    extraction
  };
}

function extractHtmlTitle(topicHtml: string): string | null {
  const ogTitle = topicHtml.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1];
  if (ogTitle) {
    const decoded = decodeEntities(ogTitle).trim();
    if (decoded.length > 0) {
      return decoded;
    }
  }

  const titleMatch = topicHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (!titleMatch) {
    return null;
  }

  const decoded = decodeEntities(titleMatch).trim();
  if (decoded.length === 0) {
    return null;
  }

  if (/Math Message Boards FAQ/i.test(decoded)) {
    return null;
  }

  return decoded.replace(/\s*\|\s*AoPS\s*$/i, "").trim();
}

function extractCanonicalTopicSlugTitle(topicHtml: string, fallbackUrl: string): string | null {
  const canonicalHref =
    topicHtml.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] ??
    fallbackUrl;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(canonicalHref, AOPS_BASE);
  } catch {
    return null;
  }

  const slugMatch = parsedUrl.pathname.match(/\/community\/c\d+_([^/?#]+)/i);
  if (!slugMatch?.[1]) {
    return null;
  }

  const title = decodeURIComponent(slugMatch[1]).replace(/[_-]+/g, " ").trim();
  return title.length > 0 ? title : null;
}

function resolveTopicTitle(topicHtml: string, fallbackUrl: string, bootstrapTitle: string | null): string | null {
  if (bootstrapTitle && bootstrapTitle.trim().length > 0) {
    return bootstrapTitle;
  }

  return extractHtmlTitle(topicHtml) ?? extractCanonicalTopicSlugTitle(topicHtml, fallbackUrl);
}

function resolveTopicFromBootstrap(topic: ContestTopic, parsedBootstrap: ParsedTopicBootstrap): ContestTopic {
  const resolved: ContestTopic = {
    ...topic,
    title: parsedBootstrap.title ?? topic.title,
    url: parsedBootstrap.topicUrl ?? topic.url
  };

  if (parsedBootstrap.title) {
    const parsed = parseContestFromTitle(parsedBootstrap.title, parsedBootstrap.fallbackYear);
    if (parsed) {
      return {
        ...resolved,
        title: parsed.title,
        contest: parsed.contest,
        year: parsed.year,
        exam: parsed.exam
      };
    }
  }

  if (topic.title.startsWith("AoPS Topic ")) {
    throw new Error("Could not infer contest metadata from topic title");
  }

  return resolved;
}

function buildImportPayloadFromTopic(topic: ContestTopic, postHtml: string): ImportProblemSetInput {
  const text = htmlToText(postHtml);
  const answerMap = extractAnswerMap(text);
  const extractedBlocks = extractProblemBlocks(text);

  const merged = new Map<number, ExtractedProblem>();
  for (const block of extractedBlocks) {
    merged.set(block.number, block);
  }

  for (const [number, answer] of answerMap.entries()) {
    const existing = merged.get(number);
    if (!existing) {
      merged.set(number, {
        number,
        answer: answer.value,
        answerFormat: answer.format
      });
      continue;
    }

    if (!existing.answer) {
      existing.answer = answer.value;
      existing.answerFormat = answer.format;
    }
  }

  const problems = [...merged.values()]
    .sort((a, b) => a.number - b.number)
    .map((problem) => {
      const question = {
        number: problem.number,
        statement: problem.statement,
        statementFormat: "MARKDOWN_LATEX" as const,
        answer: problem.answer,
        answerFormat: (problem.answerFormat ?? "MULTIPLE_CHOICE") as
          | "MULTIPLE_CHOICE"
          | "INTEGER"
          | "EXPRESSION",
        sourceUrl: topic.url
      };

      return question;
    });

  if (problems.length === 0) {
    throw new Error("No problems were extracted from topic content");
  }

  // Problems carry `statement`/`answer` that may be undefined when a page is
  // malformed. The downstream schema parse is what rejects those — we only
  // widen the type here so TS lets us hand the payload off to that validator.
  const payload = {
    problemSet: {
      contest: topic.contest,
      year: topic.year,
      exam: topic.exam,
      sourceUrl: topic.url
    },
    problems
  } as unknown as ImportProblemSetInput;

  return payload;
}

function makeOutputFilename(topic: ContestTopic): string {
  const examSegment = topic.exam ? `_${topic.exam}` : "";
  return `${topic.contest}_${topic.year}${examSegment}_h${topic.topicId}.json`;
}

function makeOutputFilenameForSet(set: { contest: Contest; year: number; exam: string | null }): string {
  const examSegment = set.exam ? `_${set.exam}` : "";
  return `${set.contest}_${set.year}${examSegment}.json`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildWikiExamTitleParam(input: { contest: Contest; year: number; exam: string | null }): string {
  if (input.contest === "AMC8") {
    return `${input.year}_AMC_8`;
  }

  if (input.contest === "AMC10" || input.contest === "AMC12") {
    if (!input.exam) {
      throw new Error(`Missing exam for ${input.contest}.`);
    }

    const contestNumber = input.contest === "AMC10" ? "10" : "12";
    return `${input.year}_AMC_${contestNumber}${input.exam}`;
  }

  if (!input.exam) {
    throw new Error("Missing exam for AIME.");
  }

  return `${input.year}_AIME_${input.exam}`;
}

function buildWikiExamSetFromResolvedMetadata(metadata: ResolvedSingleTopicMetadata): WikiExamSet {
  const titleParam = buildWikiExamTitleParam({
    contest: metadata.contest,
    year: metadata.year,
    exam: metadata.exam
  });

  return {
    contest: metadata.contest,
    year: metadata.year,
    exam: metadata.exam,
    title: titleParam.replace(/_/g, " "),
    examUrl: `${AOPS_BASE}/wiki/index.php?title=${encodeURIComponent(titleParam)}`
  };
}

function extractAttemptedStrategiesFromError(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = "No post content found after attempting: ";
  if (!message.startsWith(prefix)) {
    return [];
  }

  return message
    .slice(prefix.length)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "ArcMath-AoPS-Importer/0.1 (+https://localhost)"
      },
      signal: controller.signal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch ${url}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function buildTopicUrlFromId(topicId: number): string {
  return `${AOPS_BASE}/community/h${topicId}`;
}

const WIKI_INDEX_URLS: Array<{ contest: Contest; url: string }> = [
  { contest: "AMC8", url: `${AOPS_BASE}/wiki/index.php/AMC_8_Problems_and_Solutions` },
  { contest: "AMC10", url: `${AOPS_BASE}/wiki/index.php/AMC_10_Problems_and_Solutions` },
  { contest: "AMC12", url: `${AOPS_BASE}/wiki/index.php/AMC_12_Problems_and_Solutions` },
  { contest: "AIME", url: `${AOPS_BASE}/wiki/index.php/AIME_Problems_and_Solutions` }
];

type WikiExamSet = {
  contest: Contest;
  year: number;
  exam: string | null;
  title: string;
  examUrl: string;
};

function extractWikiLinks(html: string): Array<{ href: string; text: string }> {
  return [...html.matchAll(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    href: decodeEntities(match[1]),
    text: normalizeWhitespace(decodeEntities(match[2].replace(/<[^>]+>/g, " ")))
  }));
}

function toWikiAbsoluteUrl(href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  if (href.startsWith("/")) {
    return `${AOPS_BASE}${href}`;
  }
  return `${AOPS_BASE}/${href}`;
}

function parseWikiExamTitle(contest: Contest, titleParam: string): { year: number; exam: string | null } | null {
  const normalized = decodeURIComponent(titleParam).replace(/ /g, "_");

  if (contest === "AMC8") {
    const match = normalized.match(/^(\d{4})_AMC_8$/);
    if (!match) {
      return null;
    }
    return { year: Number(match[1]), exam: null };
  }

  if (contest === "AMC10") {
    const match = normalized.match(/^(\d{4})(?:_Fall)?_AMC_10([AB])$/);
    if (!match) {
      return null;
    }
    return { year: Number(match[1]), exam: match[2] };
  }

  if (contest === "AMC12") {
    const match = normalized.match(/^(\d{4})(?:_Fall)?_AMC_12([AB])$/);
    if (!match) {
      return null;
    }
    return { year: Number(match[1]), exam: match[2] };
  }

  const aimeSplit = normalized.match(/^(\d{4})_AIME_(I|II|1|2)$/);
  if (aimeSplit) {
    const exam = aimeSplit[2] === "1" ? "I" : aimeSplit[2] === "2" ? "II" : aimeSplit[2];
    return { year: Number(aimeSplit[1]), exam };
  }

  const aimeSingle = normalized.match(/^(\d{4})_AIME$/);
  if (aimeSingle) {
    return { year: Number(aimeSingle[1]), exam: "I" };
  }

  return null;
}

function parseWikiExamSetsFromIndex(contest: Contest, html: string): WikiExamSet[] {
  const links = extractWikiLinks(html);
  const sets: WikiExamSet[] = [];

  for (const link of links) {
    if (!link.href.includes("/wiki/index.php?title=")) {
      continue;
    }

    const absolute = toWikiAbsoluteUrl(link.href);
    const queryIndex = absolute.indexOf("title=");
    if (queryIndex < 0) {
      continue;
    }

    const titleParam = absolute.slice(queryIndex + "title=".length).split("&")[0];
    const parsed = parseWikiExamTitle(contest, titleParam);
    if (!parsed) {
      continue;
    }

    sets.push({
      contest,
      year: parsed.year,
      exam: parsed.exam,
      title: decodeURIComponent(titleParam).replace(/_/g, " "),
      examUrl: absolute
    });
  }

  const dedup = new Map<string, WikiExamSet>();
  for (const set of sets) {
    const key = `${set.contest}-${set.year}-${set.exam ?? "NONE"}`;
    dedup.set(key, set);
  }

  return [...dedup.values()].sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));
}

function extractWikiContentHtml(html: string): string {
  const match = html.match(/<div id="mw-content-text"[\s\S]*?<div class="printfooter"/i);
  if (!match) {
    return html;
  }

  return match[0];
}

function extractTitleParamFromWikiUrl(url: string): string | null {
  const queryIndex = url.indexOf("title=");
  if (queryIndex < 0) {
    return null;
  }

  const value = url.slice(queryIndex + "title=".length).split("&")[0];
  if (!value) {
    return null;
  }

  return decodeURIComponent(value).replace(/ /g, "_");
}

function cleanHtmlFragmentToText(fragment: string): string {
  const withAltText = fragment.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, " $1 ");
  return normalizeWhitespace(
    decodeEntities(withAltText.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function extractWikiAnswerMap(contest: Contest, answerKeyHtml: string): Map<number, AnswerToken> {
  const expected = contest === "AIME" ? 15 : 25;
  const contentHtml = extractWikiContentHtml(answerKeyHtml);
  const listCandidates = [...contentHtml.matchAll(/<ol[^>]*>([\s\S]*?)<\/ol>/gi)].map((match) => match[1]);

  const selectedList = listCandidates.find((candidate) => {
    const items = [...candidate.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    return items.length >= expected;
  });

  if (!selectedList) {
    return new Map<number, AnswerToken>();
  }

  const selected = [...selectedList.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => cleanHtmlFragmentToText(match[1]))
    .filter((value) => value.length > 0)
    .slice(0, expected);

  const map = new Map<number, AnswerToken>();
  selected.forEach((answer, index) => {
    map.set(index + 1, parseAnswerToken(answer));
  });
  return map;
}

function extractProblemSectionFromPage(contentHtml: string): string {
  const explicit = contentHtml.match(
    /<h2[^>]*>\s*<span[^>]*id="Problem"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?=<h2[^>]*>\s*<span[^>]*id="(?:Solution|Videos?|See_Also|Answer|References?)"|<div class="printfooter"|$)/i
  )?.[1];

  if (explicit) {
    return explicit;
  }

  const beforeSolution = contentHtml.split(
    /<h2[^>]*>\s*<span[^>]*id="(?:Solution|Videos?|See_Also|Answer|References?)"/i
  )[0];
  return beforeSolution ?? contentHtml;
}

function isLikelyNoiseLine(line: string): boolean {
  const lowered = line.trim().toLowerCase();
  return (
    lowered.length === 0 ||
    lowered === "contents" ||
    lowered.startsWith("video") ||
    lowered.startsWith("solution") ||
    lowered.startsWith("source") ||
    lowered.startsWith("see also")
  );
}

export function extractStatementFromProblemPage(problemHtml: string, problemNumber: number): string | undefined {
  const contentHtml = extractWikiContentHtml(problemHtml);
  const problemSection = extractProblemSectionFromPage(contentHtml)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<table[^>]*class="[^"]*navbox[^"]*"[\s\S]*?<\/table>/gi, " ");

  const blockTexts = [...problemSection.matchAll(/<(p|li|dd|td)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => cleanHtmlFragmentToText(match[2]))
    .map((text) =>
      text
        .replace(/==[^=]+==/g, " ")
        .replace(/https?:\/\/\S+/gi, " ")
        .replace(/^Problem\s*\d+\s*[:.)-]?\s*/i, "")
        .trim()
    )
    .filter((text) => text.length > 0)
    .filter((text) => !isLikelyNoiseLine(text));

  if (blockTexts.length > 0) {
    const merged = blockTexts.join("\n\n").trim();
    if (merged.length > 0) {
      return merged;
    }
  }

  const fallback = cleanHtmlFragmentToText(problemSection)
    .replace(/^Problem\s*\d+\s*[:.)-]?\s*/i, "")
    .replace(/^Problem\s*[:.)-]?\s*/i, "")
    .replace(new RegExp(`^${problemNumber}\\s*[:.)-]?\\s*`), "")
    .split(/\bSolution\b/i)[0]
    ?.trim();

  if (!fallback || isLikelyNoiseLine(fallback)) {
    return undefined;
  }

  return fallback;
}

/**
 * Best-effort parse of AMC-style `(A) ... (B) ... (C) ... (D) ... (E) ...`
 * choices embedded in a statement. Returns undefined when we can't find a
 * clean 5-up pattern so downstream schema validation surfaces the gap.
 */
export function extractChoicesFromStatement(statement: string): string[] | undefined {
  const normalized = statement.replace(/\s+/g, " ").trim();
  const pattern = /\(A\)\s*(.*?)\s*\(B\)\s*(.*?)\s*\(C\)\s*(.*?)\s*\(D\)\s*(.*?)\s*\(E\)\s*(.+?)(?:\s*\([F-Z]\)|\s*$)/s;
  const match = normalized.match(pattern);
  if (!match) {
    return undefined;
  }
  const [, a, b, c, d, e] = match;
  const choices = [a, b, c, d, e].map((value) => value.replace(/[\s,;.]+$/, "").trim());
  if (choices.some((value) => value.length === 0)) {
    return undefined;
  }
  return choices;
}

async function buildImportPayloadFromWikiExam(options: {
  examSet: WikiExamSet;
  includeStatements: boolean;
  delayMs: number;
  fetchHtmlImpl?: (url: string) => Promise<string>;
}): Promise<ImportProblemSetInput> {
  const fetchHtmlImpl = options.fetchHtmlImpl ?? fetchHtml;
  const examHtml = await fetchHtmlImpl(options.examSet.examUrl);
  const examLinks = extractWikiLinks(examHtml);
  const examTitleParam = extractTitleParamFromWikiUrl(options.examSet.examUrl);
  const expectedAnswerKeyFragment = examTitleParam ? `${examTitleParam}_Answer_Key` : null;

  const answerKeyLink =
    (expectedAnswerKeyFragment
      ? examLinks.find((link) => decodeURIComponent(link.href).includes(expectedAnswerKeyFragment))
      : null) ?? examLinks.find((link) => /_Answer_Key/i.test(link.href));
  if (!answerKeyLink) {
    throw new Error("No answer key link found on exam page");
  }

  const answerKeyUrl = toWikiAbsoluteUrl(answerKeyLink.href);
  const answerKeyHtml = await fetchHtmlImpl(answerKeyUrl);
  const answerMap = extractWikiAnswerMap(options.examSet.contest, answerKeyHtml);
  const expected = options.examSet.contest === "AIME" ? 15 : 25;
  const expectedProblemPrefix = examTitleParam ? `${examTitleParam}_Problems/Problem_` : null;

  const problemLinks = new Map<number, string>();
  for (const link of examLinks) {
    const numMatch = link.href.match(/Problem_(\d+)/i);
    if (!numMatch) {
      continue;
    }
    const number = Number(numMatch[1]);
    if (!Number.isInteger(number) || number < 1 || number > expected) {
      continue;
    }
    if (expectedProblemPrefix && !decodeURIComponent(link.href).includes(expectedProblemPrefix)) {
      continue;
    }
    problemLinks.set(number, toWikiAbsoluteUrl(link.href));
  }

  // Widened to tolerate per-problem undefineds during extraction; the schema
  // parse below is where partial rows get rejected with a precise error.
  const problems: Array<Record<string, unknown>> = [];
  const missingStatementProblems: number[] = [];
  for (let number = 1; number <= expected; number += 1) {
    let statement: string | undefined;
    const problemUrl = problemLinks.get(number);
    if (options.includeStatements && problemUrl) {
      try {
        const problemHtml = await fetchHtmlImpl(problemUrl);
        statement = extractStatementFromProblemPage(problemHtml, number);
        if (options.delayMs > 0) {
          await sleep(options.delayMs);
        }
      } catch {
        statement = undefined;
      }
    }

    if (options.includeStatements && (!statement || statement.trim().length < 20)) {
      missingStatementProblems.push(number);
    }

    const answer = answerMap.get(number);
    const answerFormat = answer?.format ?? "MULTIPLE_CHOICE";
    const extractedChoices =
      answerFormat === "MULTIPLE_CHOICE" && statement ? extractChoicesFromStatement(statement) : undefined;

    problems.push({
      number,
      statement,
      statementFormat: "MARKDOWN_LATEX",
      answer: answer?.value,
      answerFormat,
      choices: extractedChoices,
      sourceUrl: problemUrl ?? options.examSet.examUrl
    });
  }

  const payload = {
    problemSet: {
      contest: options.examSet.contest,
      year: options.examSet.year,
      exam: options.examSet.exam,
      sourceUrl: options.examSet.examUrl
    },
    problems
  } as unknown as ImportProblemSetInput;

  // Skeleton mode (`includeStatements: false`) writes metadata+answers
  // without per-problem statements, so the full import schema cannot hold.
  // Validation is the commit layer's job in that case — we only enforce
  // the schema when the payload is supposed to be complete.
  if (options.includeStatements && !isValidParsedPayload(payload)) {
    throw new Error("Wiki payload failed schema validation");
  }

  if (options.includeStatements && missingStatementProblems.length > 0) {
    throw new Error(
      `Missing/short statements for problems: ${missingStatementProblems.slice(0, 8).join(", ")}${missingStatementProblems.length > 8 ? "..." : ""}`
    );
  }

  return payload;
}

async function discoverWikiExamSets(options: FetchOptions): Promise<WikiExamSet[]> {
  const include = options.includeContests ? new Set(options.includeContests) : null;
  const all: WikiExamSet[] = [];

  for (const index of WIKI_INDEX_URLS) {
    if (include && !include.has(index.contest)) {
      continue;
    }

    const html = await fetchHtml(index.url);
    const sets = parseWikiExamSetsFromIndex(index.contest, html);
    all.push(...sets);

    if ((options.delayMs ?? 250) > 0) {
      await sleep(options.delayMs ?? 250);
    }
  }

  const dedup = new Map<string, WikiExamSet>();
  for (const set of all) {
    const key = `${set.contest}-${set.year}-${set.exam ?? "NONE"}`;
    dedup.set(key, set);
  }

  return [...dedup.values()].sort((a, b) => b.year - a.year || a.contest.localeCompare(b.contest));
}

async function discoverTopics(options: FetchOptions): Promise<ContestTopic[]> {
  const categoryUrl = options.categoryUrl ?? DEFAULT_CATEGORY_URL;
  const pages = Math.max(1, options.pages ?? 1);
  const maxPages = Math.max(1, options.maxPages ?? 80);
  const includeContests = options.includeContests;

  if (options.topicIds && options.topicIds.length > 0) {
    return options.topicIds.map((topicId) => ({
      topicId,
      title: `AoPS Topic ${topicId}`,
      url: buildTopicUrlFromId(topicId),
      contest: "AMC8",
      year: new Date().getFullYear(),
      exam: null
    }));
  }

  const allTopics: ContestTopic[] = [];
  const seenTopicIds = new Set<number>();

  for (let page = 1; options.allPages ? page <= maxPages : page <= pages; page += 1) {
    const pageUrl = page === 1 ? categoryUrl : `${categoryUrl}?page=${page}`;
    const html = await fetchHtml(pageUrl);
    const topics = parseContestTopicsFromCategoryHtml(html, includeContests);
    let addedUnique = 0;
    for (const topic of topics) {
      if (!seenTopicIds.has(topic.topicId)) {
        seenTopicIds.add(topic.topicId);
        allTopics.push(topic);
        addedUnique += 1;
      }
    }

    if (options.allPages && (topics.length === 0 || addedUnique === 0)) {
      break;
    }

    if ((options.delayMs ?? 250) > 0) {
      await sleep(options.delayMs ?? 250);
    }
  }

  return allTopics.sort((a, b) => b.year - a.year || a.contest.localeCompare(b.contest));
}

function parseTopicOverridesFromCsv(value: string | undefined): number[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function isValidParsedPayload(payload: ImportProblemSetInput): boolean {
  return importProblemSetSchema.safeParse(payload).success;
}

function withTopicMetadataOverride(
  payload: ImportProblemSetInput,
  topic: ContestTopic
): ImportProblemSetInput {
  return {
    problemSet: {
      ...payload.problemSet,
      contest: topic.contest,
      year: topic.year,
      exam: topic.exam
    },
    problems: payload.problems
  };
}

function parseMetadataFromPayload(payload: ImportProblemSetInput, fallbackTitle: string): Omit<ContestTopic, "topicId" | "url"> {
  return {
    title: fallbackTitle,
    contest: payload.problemSet.contest,
    year: payload.problemSet.year,
    exam: payload.problemSet.exam ?? null
  };
}

function tryInferMetadataFromPayload(payload: ImportProblemSetInput, current: ContestTopic): ContestTopic {
  const inferred = parseMetadataFromPayload(payload, current.title);
  return {
    ...current,
    ...inferred
  };
}

function buildValidatedTopicPayload(topic: ContestTopic, topicHtml: string): ImportProblemSetInput {
  const parsedBootstrap = parseTopicBootstrap(topicHtml);
  const resolvedTopic = resolveTopicFromBootstrap(topic, parsedBootstrap);
  const extracted = buildImportPayloadFromTopic(resolvedTopic, parsedBootstrap.postHtml);
  const overridden = withTopicMetadataOverride(extracted, resolvedTopic);
  const inferredTopic = tryInferMetadataFromPayload(overridden, topic);
  const corrected = withTopicMetadataOverride(overridden, inferredTopic);

  if (!isValidParsedPayload(corrected)) {
    throw new Error("Extracted payload failed import schema validation");
  }

  return corrected;
}

export async function fetchAoPSContestImports(options: FetchOptions): Promise<FetchSummary> {
  const source = options.source ?? "auto";
  const limit = Math.max(1, options.limit ?? 20);
  let mode: "community" | "wiki" = source === "wiki" ? "wiki" : "community";

  let topics = mode === "community" ? await discoverTopics(options) : [];
  if (options.yearFrom !== undefined || options.yearTo !== undefined) {
    topics = topics.filter((topic) => {
      if (options.yearFrom !== undefined && topic.year < options.yearFrom) {
        return false;
      }
      if (options.yearTo !== undefined && topic.year > options.yearTo) {
        return false;
      }
      return true;
    });
  }
  if (source === "auto" && topics.length === 0) {
    mode = "wiki";
  }

  let wikiSets = mode === "wiki" ? await discoverWikiExamSets(options) : [];
  if (options.yearFrom !== undefined || options.yearTo !== undefined) {
    wikiSets = wikiSets.filter((set) => {
      if (options.yearFrom !== undefined && set.year < options.yearFrom) {
        return false;
      }
      if (options.yearTo !== undefined && set.year > options.yearTo) {
        return false;
      }
      return true;
    });
  }
  const selectedTopics = mode === "community" ? topics.slice(0, limit) : [];
  const selectedWikiSets = mode === "wiki" ? wikiSets.slice(0, limit) : [];
  const outputDir = path.resolve(options.outputDir);

  const summary: FetchSummary = {
    discovered: mode === "community" ? topics.length : wikiSets.length,
    attempted: mode === "community" ? selectedTopics.length : selectedWikiSets.length,
    written: 0,
    skipped: 0,
    failed: 0,
    outputs: [],
    errors: []
  };

  if (options.dryRun) {
    return summary;
  }

  await mkdir(outputDir, { recursive: true });

  if (mode === "community") {
    for (const topic of selectedTopics) {
      try {
        const filename = makeOutputFilename(topic);
        const fullPath = path.join(outputDir, filename);
        if (options.skipExisting && (await fileExists(fullPath))) {
          summary.skipped += 1;
          continue;
        }

        const topicHtml = await fetchHtml(topic.url);
        const payload = buildValidatedTopicPayload(topic, topicHtml);
        const json = `${JSON.stringify(payload, null, 2)}\n`;
        await writeFile(fullPath, json, "utf8");

        summary.written += 1;
        summary.outputs.push(fullPath);
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : "Unknown failure";
        summary.errors.push(`topic ${topic.topicId}: ${message}`);
      }

      if ((options.delayMs ?? 250) > 0) {
        await sleep(options.delayMs ?? 250);
      }
    }
  } else {
    for (const set of selectedWikiSets) {
      try {
        const filename = makeOutputFilenameForSet(set);
        const fullPath = path.join(outputDir, filename);
        if (options.skipExisting && (await fileExists(fullPath))) {
          summary.skipped += 1;
          continue;
        }

        const payload = await buildImportPayloadFromWikiExam({
          examSet: set,
          includeStatements: options.includeStatements ?? false,
          delayMs: options.delayMs ?? 250,
          fetchHtmlImpl: fetchHtml
        });

        const json = `${JSON.stringify(payload, null, 2)}\n`;
        await writeFile(fullPath, json, "utf8");

        summary.written += 1;
        summary.outputs.push(fullPath);
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : "Unknown failure";
        summary.errors.push(`${set.title}: ${message}`);
      }

      if ((options.delayMs ?? 250) > 0) {
        await sleep(options.delayMs ?? 250);
      }
    }
  }

  summary.skipped = Math.max(0, summary.attempted - summary.written - summary.failed);
  return summary;
}

export async function fetchAoPSTopicImportFromUrl(
  input: {
    topicUrl: string;
  },
  deps?: {
    fetchHtml?: (url: string) => Promise<string>;
  }
): Promise<SingleTopicFetchResult> {
  const parsedUrl = parseAoPSCommunityTopicUrl(input.topicUrl);
  const fetchTopicHtml = deps?.fetchHtml ?? fetchHtml;
  const topicHtml = await fetchTopicHtml(parsedUrl.canonicalUrl);
  let parsedBootstrap: ParsedTopicBootstrap | null = null;
  let attemptedStrategies: string[] = [];

  try {
    parsedBootstrap = parseTopicBootstrap(topicHtml);
    attemptedStrategies = parsedBootstrap.extraction.attemptedStrategies;
  } catch (error) {
    attemptedStrategies = extractAttemptedStrategiesFromError(error);
  }

  const resolvedTitle = resolveTopicTitle(topicHtml, parsedUrl.canonicalUrl, parsedBootstrap?.title ?? null);

  if (!resolvedTitle || resolvedTitle.trim().length === 0) {
    throw new Error("Topic page did not expose a usable title.");
  }

  const contentText = parsedBootstrap ? htmlToText(parsedBootstrap.postHtml) : "";

  const resolvedMetadata = resolveSingleTopicMetadata({
    title: resolvedTitle,
    contentText,
    fallbackYear: parsedBootstrap?.fallbackYear,
    topicId: parsedUrl.topicId,
    topicUrl: parsedBootstrap?.topicUrl ?? parsedUrl.canonicalUrl
  });

  let payload: ImportProblemSetInput;
  let extraction: TopicContentExtraction;
  if (contentText.trim().length > 0 && parsedBootstrap) {
    const topic: ContestTopic = {
      topicId: resolvedMetadata.topicId ?? parsedUrl.topicId ?? 0,
      title: resolvedMetadata.title,
      url: resolvedMetadata.topicUrl,
      contest: resolvedMetadata.contest,
      year: resolvedMetadata.year,
      exam: resolvedMetadata.exam
    };

    payload = withTopicMetadataOverride(buildImportPayloadFromTopic(topic, parsedBootstrap.postHtml), topic);
    extraction = parsedBootstrap.extraction;
  } else {
    const examSet = buildWikiExamSetFromResolvedMetadata(resolvedMetadata);
    payload = await buildImportPayloadFromWikiExam({
      examSet,
      includeStatements: true,
      delayMs: 0,
      fetchHtmlImpl: fetchTopicHtml
    });
    extraction = {
      strategy: "wiki.fallback",
      attemptedStrategies:
        attemptedStrategies.length > 0
          ? [...attemptedStrategies, "wiki.fallback"]
          : ["bootstrap.preload_posts", "bootstrap.preload_topics", "bootstrap.other_field", "dom.fallback", "wiki.fallback"]
    };
  }

  const parsedPayload = importProblemSetSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new Error(
      `Extracted payload failed import schema validation: ${parsedPayload.error.issues[0]?.message ?? "unknown issue"}`
    );
  }

  return {
    payload: parsedPayload.data,
    metadata: resolvedMetadata,
    extraction
  };
}

export function parseFetchArgs(args: string[]): FetchOptions {
  const parsed: FetchOptions = {
    source: "auto",
    outputDir: path.resolve(process.cwd(), "aops-imports"),
    pages: 1,
    limit: 10,
    delayMs: 250,
    maxPages: 80,
    includeStatements: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--output" && next) {
      parsed.outputDir = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--pages" && next) {
      parsed.pages = Number(next);
      index += 1;
      continue;
    }

    if (arg === "--limit" && next) {
      parsed.limit = Number(next);
      index += 1;
      continue;
    }

    if (arg === "--delay-ms" && next) {
      parsed.delayMs = Number(next);
      index += 1;
      continue;
    }

    if (arg === "--max-pages" && next) {
      parsed.maxPages = Number(next);
      index += 1;
      continue;
    }

    if (arg === "--source" && next) {
      if (next === "auto" || next === "community" || next === "wiki") {
        parsed.source = next;
      }
      index += 1;
      continue;
    }

    if (arg === "--category-url" && next) {
      parsed.categoryUrl = next;
      index += 1;
      continue;
    }

    if (arg === "--topic-ids" && next) {
      parsed.topicIds = parseTopicOverridesFromCsv(next);
      index += 1;
      continue;
    }

    if (arg === "--include" && next) {
      parsed.includeContests = next
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter((item): item is Contest => item === "AMC8" || item === "AMC10" || item === "AMC12" || item === "AIME");
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
    }

    if (arg === "--include-statements") {
      parsed.includeStatements = true;
    }

    if (arg === "--all") {
      parsed.allPages = true;
      parsed.limit = Number.MAX_SAFE_INTEGER;
    }
  }

  return parsed;
}
