import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  AOPS_WIKI_BASE_URL,
  checkAoPSOfficialPdfIdentity,
  extractAoPSOfficialPdfUrlFromHtml,
  importProblemSetSchema,
  type Contest,
  type ImportProblemSetInput
} from "@arcmath/shared";

const DEFAULT_CACHE_DIR = path.resolve(process.cwd(), ".cache");
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_BATCH_CONCURRENCY = 2;
const DEFAULT_DELAY_MS = 300;
const USER_AGENT = "ArcMath-Ingest-AoPS/0.1 (+http://localhost)";

type CommonCliFlags = {
  contest: Contest;
  year: number;
  exam: string | null;
  cacheDir: string;
  cacheOnly: boolean;
  refresh: boolean;
  delayMs: number;
};

type JsonCliFlags = CommonCliFlags & {
  outPath: string;
  concurrency: number;
  maxEmptyStatements: number;
};

export type OfficialPdfCliFlags = CommonCliFlags & {
  outDir: string;
  strictMatch: boolean;
};

export type OfficialPdfBatchManifestEntry = {
  contest: Contest;
  year: number;
  exam: string | null;
  label?: string;
};

export type OfficialPdfBatchCliFlags = {
  manifestPath: string;
  outDir: string;
  summaryOut: string;
  concurrency: number;
  limit?: number;
  strictMatch: boolean;
  continueOnError: boolean;
  skipExisting: boolean;
  cacheDir: string;
  cacheOnly: boolean;
  refresh: boolean;
  delayMs: number;
};

export type OfficialPdfBatchItemStatus = "succeeded" | "failed" | "skippedExisting";

export type OfficialPdfBatchSummaryItem = OfficialPdfBatchManifestEntry & {
  status: OfficialPdfBatchItemStatus;
  pdfPath?: string;
  metaPath?: string;
  error?: string;
};

export type OfficialPdfBatchSummary = {
  startedAt: string;
  finishedAt: string;
  totals: {
    requested: number;
    processed: number;
    succeeded: number;
    failed: number;
    skippedExisting: number;
  };
  items: OfficialPdfBatchSummaryItem[];
};

type ParsedArgs =
  | {
      command: "warm-cache";
      flags: JsonCliFlags;
    }
  | {
      command: "fetch";
      flags: JsonCliFlags;
    }
  | {
      command: "fetch-official-pdf";
      flags: OfficialPdfCliFlags;
    }
  | {
      command: "fetch-official-pdf-batch";
      flags: OfficialPdfBatchCliFlags;
    };

type AnswerToken = {
  value: string;
  format: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
};

type CachedBinaryResponse = {
  bytes: Buffer;
  contentType: string | null;
};

export type OfficialPdfArtifactMetadata = {
  contest: Contest;
  year: number;
  exam: string | null;
  baseTitle: string;
  examWikiUrl: string;
  discoveredFrom: string;
  pdfUrl: string;
  sha256: string;
  size: number;
  fetchedAt: string;
};

export type OfficialPdfArtifactResult = {
  pdfPath: string;
  metaPath: string;
  metadata: OfficialPdfArtifactMetadata;
};

class CachedFetcher {
  readonly cacheDir: string;
  readonly cacheOnly: boolean;
  readonly refresh: boolean;
  readonly delayMs: number;

  constructor(options: { cacheDir: string; cacheOnly: boolean; refresh: boolean; delayMs: number }) {
    this.cacheDir = options.cacheDir;
    this.cacheOnly = options.cacheOnly;
    this.refresh = options.refresh;
    this.delayMs = options.delayMs;
  }

  private hashForUrl(url: string): string {
    return createHash("sha1").update(url).digest("hex");
  }

  bodyPathForUrl(url: string): string {
    return path.join(this.cacheDir, `${this.hashForUrl(url)}.body.html`);
  }

  private bytesPathForUrl(url: string): string {
    return path.join(this.cacheDir, `${this.hashForUrl(url)}.body.bin`);
  }

  private textMetaPathForUrl(url: string): string {
    return path.join(this.cacheDir, `${this.hashForUrl(url)}.meta.json`);
  }

  private binaryMetaPathForUrl(url: string): string {
    return path.join(this.cacheDir, `${this.hashForUrl(url)}.binary.meta.json`);
  }

  async fetchText(url: string): Promise<string> {
    await mkdir(this.cacheDir, { recursive: true });
    const bodyPath = this.bodyPathForUrl(url);
    const metaPath = this.textMetaPathForUrl(url);

    if (!this.refresh) {
      try {
        await stat(bodyPath);
        return await readFile(bodyPath, "utf8");
      } catch {
        // cache miss
      }
    }

    if (this.cacheOnly) {
      throw new Error(`cache miss in --cache-only mode for ${url}`);
    }

    if (this.delayMs > 0) {
      await sleep(this.delayMs);
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`request failed ${response.status} ${response.statusText} for ${url}`);
    }

    const text = await response.text();
    await writeFile(bodyPath, text, "utf8");
    await writeFile(
      metaPath,
      JSON.stringify(
        {
          url,
          fetchedAt: new Date().toISOString()
        },
        null,
        2
      ),
      "utf8"
    );

    return text;
  }

  async fetchBytes(url: string): Promise<CachedBinaryResponse> {
    await mkdir(this.cacheDir, { recursive: true });
    const bodyPath = this.bytesPathForUrl(url);
    const metaPath = this.binaryMetaPathForUrl(url);

    if (!this.refresh) {
      try {
        await stat(bodyPath);
        const bytes = Buffer.from(await readFile(bodyPath));
        let contentType: string | null = null;
        try {
          const metaRaw = await readFile(metaPath, "utf8");
          const meta = JSON.parse(metaRaw) as { contentType?: string | null };
          contentType = meta.contentType ?? null;
        } catch {
          // ignore missing/corrupt meta
        }
        return { bytes, contentType };
      } catch {
        // cache miss
      }
    }

    if (this.cacheOnly) {
      throw new Error(`cache miss in --cache-only mode for ${url}`);
    }

    if (this.delayMs > 0) {
      await sleep(this.delayMs);
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT
      },
      cache: "no-store",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`request failed ${response.status} ${response.statusText} for ${url}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type");
    await writeFile(bodyPath, bytes);
    await writeFile(
      metaPath,
      JSON.stringify(
        {
          url,
          contentType,
          fetchedAt: new Date().toISOString()
        },
        null,
        2
      ),
      "utf8"
    );

    return {
      bytes,
      contentType
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function normalizeWhitespace(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function toWikiUrl(title: string): string {
  return `${AOPS_WIKI_BASE_URL}${encodeURIComponent(title)}`;
}

function expectedProblemCount(contest: Contest): number {
  return contest === "AIME" ? 15 : 25;
}

function normalizeExam(contest: Contest, exam: string | null): string | null {
  if (!exam) {
    return null;
  }
  const normalized = exam.trim().toUpperCase();
  if (contest === "AMC8") {
    return null;
  }
  return normalized;
}

function validateExam(contest: Contest, exam: string | null): void {
  if (contest === "AMC8" && exam !== null) {
    throw new Error("AMC8 does not use exam. Omit --exam.");
  }
  if ((contest === "AMC10" || contest === "AMC12") && exam !== "A" && exam !== "B") {
    throw new Error(`${contest} requires --exam A or --exam B.`);
  }
  if (contest === "AIME" && exam !== "I" && exam !== "II") {
    throw new Error("AIME requires --exam I or --exam II.");
  }
}

function isContest(value: string): value is Contest {
  return value === "AMC8" || value === "AMC10" || value === "AMC12" || value === "AIME";
}

function yearUpperBound(): number {
  return new Date().getFullYear() + 1;
}

function parseLimitFlag(raw: string | undefined, flagName: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flagName} must be an integer >= 1`);
  }
  return value;
}

export function validateManifestEntry(raw: unknown, index: number): OfficialPdfBatchManifestEntry {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Manifest entry #${index + 1} must be an object.`);
  }

  const record = raw as Record<string, unknown>;
  const contestRaw = String(record.contest ?? "").trim().toUpperCase();
  if (!isContest(contestRaw)) {
    throw new Error(`Manifest entry #${index + 1} has invalid contest. Expected AMC8|AMC10|AMC12|AIME.`);
  }

  const year = Number(record.year);
  if (!Number.isInteger(year) || year < 1950 || year > yearUpperBound()) {
    throw new Error(`Manifest entry #${index + 1} has invalid year. Expected 1950..${yearUpperBound()}.`);
  }

  const examInput =
    record.exam === null || record.exam === undefined ? null : typeof record.exam === "string" ? record.exam : String(record.exam);
  const exam = normalizeExam(contestRaw, examInput);
  try {
    validateExam(contestRaw, exam);
  } catch (error) {
    throw new Error(`Manifest entry #${index + 1} exam validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (record.label !== undefined && typeof record.label !== "string") {
    throw new Error(`Manifest entry #${index + 1} label must be a string when provided.`);
  }

  return {
    contest: contestRaw,
    year,
    exam,
    ...(typeof record.label === "string" && record.label.trim().length > 0 ? { label: record.label.trim() } : {})
  };
}

function baseTitleCandidates(contest: Contest, year: number, exam: string | null): string[] {
  if (contest === "AMC8") {
    return [`${year}_AMC_8`];
  }
  if (contest === "AMC10") {
    return [`${year}_AMC_10${exam}`];
  }
  if (contest === "AMC12") {
    return [`${year}_AMC_12${exam}`];
  }
  if (exam === "I") {
    return [`${year}_AIME_I`, `${year}_AIME`];
  }
  return [`${year}_AIME_II`];
}

function answerKeyTitle(baseTitle: string): string {
  return `${baseTitle}_Answer_Key`;
}

function problemTitle(baseTitle: string, number: number): string {
  return `${baseTitle}_Problems/Problem_${number}`;
}

function extractWikiContentHtml(html: string): string {
  const match = html.match(/<div id="mw-content-text"[\s\S]*?<div class="printfooter"/i);
  if (!match) {
    return html;
  }
  return match[0];
}

function seemsUnavailable(html: string): boolean {
  const lowered = html.toLowerCase();
  return (
    lowered.includes("web server is down") ||
    lowered.includes("cloudflare") ||
    lowered.includes("always online") ||
    lowered.includes("there is currently no text in this page")
  );
}

function cleanHtmlFragmentToText(fragment: string): string {
  const withMathAlt = fragment.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, " $1 ");
  return normalizeWhitespace(
    decodeEntities(
      withMathAlt
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    ).replace(/\n+/g, "\n")
  );
}

function extractProblemSection(contentHtml: string): string {
  const explicitProblemSection = contentHtml.match(
    /<h2[^>]*>\s*<span[^>]*id="Problem"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?=<h2[^>]*>\s*<span[^>]*id="(?:Solution|Videos?|See_Also|Answer|References?)"|<div class="printfooter"|$)/i
  );
  if (explicitProblemSection?.[1]) {
    return explicitProblemSection[1];
  }

  const untilSolution = contentHtml.split(
    /<h2[^>]*>\s*<span[^>]*id="(?:Solution|Videos?|See_Also|Answer|References?)"/i
  )[0];

  return untilSolution ?? contentHtml;
}

function isNoiseLine(line: string): boolean {
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

function extractStatementText(problemHtml: string, number: number): string | undefined {
  const contentHtml = extractWikiContentHtml(problemHtml);
  const problemSection = extractProblemSection(contentHtml)
    .replace(/<table[^>]*class="[^"]*navbox[^"]*"[\s\S]*?<\/table>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const blockMatches = [...problemSection.matchAll(/<(p|li|dd|td)[^>]*>([\s\S]*?)<\/\1>/gi)];
  const paragraphs = blockMatches
    .map((match) => cleanHtmlFragmentToText(match[2]))
    .map((line) => line.replace(/^Problem\s*\d+\s*[:.)-]?\s*/i, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isNoiseLine(line));

  if (paragraphs.length === 0) {
    const fallback = cleanHtmlFragmentToText(problemSection)
      .replace(/^Problem\s*\d+\s*[:.)-]?\s*/i, "")
      .replace(/^Problem\s*[:.)-]?\s*/i, "")
      .replace(new RegExp(`^${number}\\s*[:.)-]?\\s*`), "")
      .split(/\bSolution\b/i)[0]
      ?.trim();
    if (!fallback || fallback.length === 0 || isNoiseLine(fallback)) {
      return undefined;
    }
    return fallback;
  }

  const merged = paragraphs.join("\n\n").trim();
  if (merged.length === 0) {
    return undefined;
  }

  const cleaned = merged.replace(new RegExp(`^${number}\\s*[:.)-]?\\s*`), "").trim();
  return cleaned.length > 0 ? cleaned : merged;
}

function extractChoices(statement: string): { stem: string; choices?: string[] } {
  const labels = ["(A)", "(B)", "(C)", "(D)", "(E)"];
  const starts = labels.map((label) => statement.indexOf(label));
  const hasAllLabels = starts.every((index) => index >= 0);
  const strictlyIncreasing = starts.every((index, i) => i === 0 || index > starts[i - 1]);
  if (!hasAllLabels || !strictlyIncreasing) {
    return { stem: statement };
  }

  const parsedChoices: string[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const start = starts[index] + labels[index].length;
    const end = index + 1 < labels.length ? starts[index + 1] : statement.length;
    parsedChoices.push(statement.slice(start, end).trim());
  }

  if (parsedChoices.some((choice) => choice.length === 0)) {
    return { stem: statement };
  }

  const stem = statement.slice(0, starts[0]).trim();
  return {
    stem: stem.length > 0 ? stem : statement,
    choices: parsedChoices
  };
}

function parseAnswerToken(raw: string): AnswerToken {
  const trimmed = normalizeWhitespace(raw);
  if (/^[A-E]$/i.test(trimmed)) {
    return {
      value: trimmed.toUpperCase(),
      format: "MULTIPLE_CHOICE"
    };
  }
  if (/^-?\d+$/.test(trimmed)) {
    return {
      value: trimmed,
      format: "INTEGER"
    };
  }
  return {
    value: trimmed,
    format: "EXPRESSION"
  };
}

function extractAnswerMap(answerKeyHtml: string, expectedCount: number): Map<number, AnswerToken> {
  const contentHtml = extractWikiContentHtml(answerKeyHtml);
  const listCandidates = [...contentHtml.matchAll(/<ol[^>]*>([\s\S]*?)<\/ol>/gi)].map((match) => match[1]);
  if (listCandidates.length === 0) {
    return new Map<number, AnswerToken>();
  }

  const selected = listCandidates
    .map((candidate) => [...candidate.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)])
    .sort((a, b) => b.length - a.length)[0];

  if (!selected || selected.length === 0) {
    return new Map<number, AnswerToken>();
  }

  const answers = selected
    .map((match) => cleanHtmlFragmentToText(match[1]))
    .filter((value) => value.length > 0)
    .slice(0, expectedCount);

  const map = new Map<number, AnswerToken>();
  answers.forEach((answer, index) => {
    map.set(index + 1, parseAnswerToken(answer));
  });
  return map;
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  let next = 0;
  const width = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: width }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function resolveBaseTitle(flags: CommonCliFlags, fetcher: CachedFetcher): Promise<string> {
  const candidates = baseTitleCandidates(flags.contest, flags.year, flags.exam);
  let lastError: Error | null = null;

  for (const title of candidates) {
    const url = toWikiUrl(title);
    try {
      const html = await fetcher.fetchText(url);
      if (seemsUnavailable(html)) {
        lastError = new Error(`AoPS returned an unavailable page for ${url}`);
        continue;
      }
      return title;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Could not resolve a valid AoPS exam page.");
}

function parseCommonFlags(pairs: Map<string, string>, booleans: Set<string>): CommonCliFlags {
  const contestRaw = (pairs.get("--contest") ?? "").toUpperCase();
  const contestSet = new Set<Contest>(["AMC8", "AMC10", "AMC12", "AIME"]);
  if (!contestSet.has(contestRaw as Contest)) {
    throw new Error("--contest must be one of AMC8, AMC10, AMC12, AIME");
  }
  const contest = contestRaw as Contest;

  const year = Number(pairs.get("--year"));
  if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) {
    throw new Error("--year must be an integer between 1950 and currentYear+1");
  }

  const examRaw = pairs.get("--exam") ?? null;
  const exam = normalizeExam(contest, examRaw);
  validateExam(contest, exam);

  const cacheDir = path.resolve(process.cwd(), pairs.get("--cache-dir") ?? DEFAULT_CACHE_DIR);
  const cacheOnly = booleans.has("--cache-only");
  const refresh = booleans.has("--refresh");
  const delayMs = Number(pairs.get("--delay-ms") ?? DEFAULT_DELAY_MS);

  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 10_000) {
    throw new Error("--delay-ms must be between 0 and 10000");
  }

  return {
    contest,
    year,
    exam,
    cacheDir,
    cacheOnly,
    refresh,
    delayMs
  };
}

export function parseArgs(raw: string[]): ParsedArgs {
  const [commandRaw, ...args] = raw;
  const command =
    commandRaw === "warm-cache" ||
    commandRaw === "fetch" ||
    commandRaw === "fetch-official-pdf" ||
    commandRaw === "fetch-official-pdf-batch"
      ? commandRaw
      : null;

  if (!command) {
    throw new Error(
      'First argument must be "warm-cache", "fetch", "fetch-official-pdf", or "fetch-official-pdf-batch".'
    );
  }

  const pairs = new Map<string, string>();
  const booleans = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) {
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      booleans.add(key);
      continue;
    }
    pairs.set(key, value);
    index += 1;
  }

  if (command === "fetch-official-pdf-batch") {
    const manifestRaw = pairs.get("--manifest");
    if (!manifestRaw) {
      throw new Error("--manifest is required for fetch-official-pdf-batch");
    }

    const outDirRaw = pairs.get("--out-dir");
    if (!outDirRaw) {
      throw new Error("--out-dir is required for fetch-official-pdf-batch");
    }

    const outDir = path.resolve(process.cwd(), outDirRaw);
    const summaryOut = path.resolve(process.cwd(), pairs.get("--summary-out") ?? path.join(outDir, "official-pdf-batch-summary.json"));
    const concurrency = Number(pairs.get("--concurrency") ?? DEFAULT_BATCH_CONCURRENCY);
    if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 5) {
      throw new Error("--concurrency must be between 1 and 5 for fetch-official-pdf-batch");
    }

    const limit = parseLimitFlag(pairs.get("--limit"), "--limit");
    const cacheDir = path.resolve(process.cwd(), pairs.get("--cache-dir") ?? DEFAULT_CACHE_DIR);
    const cacheOnly = booleans.has("--cache-only");
    const refresh = booleans.has("--refresh");
    const delayMs = Number(pairs.get("--delay-ms") ?? DEFAULT_DELAY_MS);
    if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 10_000) {
      throw new Error("--delay-ms must be between 0 and 10000");
    }

    return {
      command,
      flags: {
        manifestPath: path.resolve(process.cwd(), manifestRaw),
        outDir,
        summaryOut,
        concurrency,
        limit,
        strictMatch: booleans.has("--strict-match"),
        continueOnError: booleans.has("--continue-on-error"),
        skipExisting: booleans.has("--skip-existing"),
        cacheDir,
        cacheOnly,
        refresh,
        delayMs
      }
    };
  }

  const common = parseCommonFlags(pairs, booleans);

  if (command === "fetch-official-pdf") {
    const outDirRaw = pairs.get("--out-dir");
    if (!outDirRaw) {
      throw new Error("--out-dir is required for fetch-official-pdf");
    }

    return {
      command,
      flags: {
        ...common,
        outDir: path.resolve(process.cwd(), outDirRaw),
        strictMatch: booleans.has("--strict-match")
      }
    };
  }

  const outPath = path.resolve(
    process.cwd(),
    pairs.get("--out") ?? `ingest/json/${common.contest}_${common.year}${common.exam ? `_${common.exam}` : ""}.json`
  );

  const concurrency = Number(pairs.get("--concurrency") ?? DEFAULT_CONCURRENCY);
  const maxEmptyStatements = Number(pairs.get("--max-empty-statements") ?? 0);

  if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 10) {
    throw new Error("--concurrency must be between 1 and 10");
  }
  if (!Number.isFinite(maxEmptyStatements) || maxEmptyStatements < 0) {
    throw new Error("--max-empty-statements must be >= 0");
  }

  return {
    command,
    flags: {
      ...common,
      outPath,
      concurrency,
      maxEmptyStatements
    }
  };
}

function buildTargetUrls(baseTitle: string, count: number): { examUrl: string; answerKeyUrl: string; problemUrls: string[] } {
  const examUrl = toWikiUrl(baseTitle);
  const answerKeyUrl = toWikiUrl(answerKeyTitle(baseTitle));
  const problemUrls = Array.from({ length: count }, (_, index) => toWikiUrl(problemTitle(baseTitle, index + 1)));
  return {
    examUrl,
    answerKeyUrl,
    problemUrls
  };
}

async function warmCache(flags: JsonCliFlags): Promise<void> {
  const fetcher = new CachedFetcher({
    cacheDir: flags.cacheDir,
    cacheOnly: flags.cacheOnly,
    refresh: flags.refresh,
    delayMs: flags.delayMs
  });
  const baseTitle = await resolveBaseTitle(flags, fetcher);
  const count = expectedProblemCount(flags.contest);
  const urls = buildTargetUrls(baseTitle, count);

  const allUrls = [urls.examUrl, urls.answerKeyUrl, ...urls.problemUrls];
  await runWithConcurrency(
    allUrls,
    async (url) => {
      await fetcher.fetchText(url);
    },
    flags.concurrency
  );

  console.log(`cache warmed for ${flags.contest} ${flags.year}${flags.exam ? ` ${flags.exam}` : ""}`);
  console.log(`base title: ${baseTitle}`);
  console.log(`cached urls: ${allUrls.length}`);
  console.log(`cache dir: ${flags.cacheDir}`);
}

async function fetchToJson(flags: JsonCliFlags): Promise<void> {
  const fetcher = new CachedFetcher({
    cacheDir: flags.cacheDir,
    cacheOnly: flags.cacheOnly,
    refresh: flags.refresh,
    delayMs: flags.delayMs
  });

  const baseTitle = await resolveBaseTitle(flags, fetcher);
  const problemCount = expectedProblemCount(flags.contest);
  const urls = buildTargetUrls(baseTitle, problemCount);
  const allUrls = [urls.examUrl, urls.answerKeyUrl, ...urls.problemUrls];

  await runWithConcurrency(
    allUrls,
    async (url) => {
      await fetcher.fetchText(url);
    },
    flags.concurrency
  );

  const answerKeyHtml = await fetcher.fetchText(urls.answerKeyUrl);
  if (seemsUnavailable(answerKeyHtml)) {
    throw new Error(`Could not parse answer key page for ${urls.answerKeyUrl}`);
  }
  const answers = extractAnswerMap(answerKeyHtml, problemCount);

  const emptyStatementErrors: string[] = [];
  // Problems are built loosely during extraction — statements or answers may be
  // empty if the source page is broken. The schema-validation step below
  // catches those with a precise error. We widen the list type here to match
  // that intent (rather than casting at every push site).
  const problems: Array<ImportProblemSetInput["problems"][number] | Record<string, unknown>> = [];

  for (let number = 1; number <= problemCount; number += 1) {
    const pageUrl = urls.problemUrls[number - 1];
    const html = await fetcher.fetchText(pageUrl);
    const statement = extractStatementText(html, number);
    const answer = answers.get(number);

    let statementText = statement;
    let choices: string[] | undefined;
    if (statementText) {
      const parsed = extractChoices(statementText);
      statementText = parsed.stem;
      choices = parsed.choices;
    }

    if (!statementText || statementText.length < 20) {
      const cachePath = fetcher.bodyPathForUrl(pageUrl);
      emptyStatementErrors.push(
        `Problem ${number} has short/empty statement (len=${statementText?.length ?? 0}). page=${pageUrl} cache=${cachePath}`
      );
    }

    problems.push({
      number,
      statement: statementText,
      statementFormat: "MARKDOWN_LATEX",
      choices,
      answer: answer?.value,
      answerFormat: answer?.format ?? "MULTIPLE_CHOICE",
      sourceUrl: pageUrl
    });
  }

  const payload = {
    problemSet: {
      contest: flags.contest,
      year: flags.year,
      exam: flags.exam,
      sourceUrl: urls.examUrl
    },
    problems
  } as unknown as ImportProblemSetInput;

  const validated = importProblemSetSchema.safeParse(payload);
  if (!validated.success) {
    const issues = validated.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`generated payload failed schema validation: ${issues.join(" | ")}`);
  }

  if (emptyStatementErrors.length > flags.maxEmptyStatements) {
    throw new Error(
      `empty statement count ${emptyStatementErrors.length} exceeds max ${flags.maxEmptyStatements}. ${emptyStatementErrors[0] ?? ""}`
    );
  }

  const outDir = path.dirname(flags.outPath);
  await mkdir(outDir, { recursive: true });
  await writeFile(flags.outPath, `${JSON.stringify(validated.data, null, 2)}\n`, "utf8");

  console.log(`json written: ${flags.outPath}`);
  console.log(`contest: ${flags.contest} ${flags.year}${flags.exam ? ` ${flags.exam}` : ""}`);
  console.log(`problems: ${validated.data.problems.length}`);
  console.log(`empty statements: ${emptyStatementErrors.length}`);
  if (emptyStatementErrors.length > 0) {
    console.log(`first empty statement issue: ${emptyStatementErrors[0]}`);
  }
}

function isLikelyPdf(contentType: string | null, bytes: Buffer): boolean {
  if ((contentType ?? "").toLowerCase().includes("application/pdf")) {
    return true;
  }
  if (bytes.length < 5) {
    return false;
  }
  return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

function officialArtifactBaseName(contest: Contest, year: number, exam: string | null): string {
  return `${contest}_${year}_${exam ?? "none"}_official`;
}

export function getOfficialPdfArtifactPaths(input: {
  outDir: string;
  contest: Contest;
  year: number;
  exam: string | null;
}): { pdfPath: string; metaPath: string } {
  const baseName = officialArtifactBaseName(input.contest, input.year, input.exam);
  return {
    pdfPath: path.join(input.outDir, `${baseName}.pdf`),
    metaPath: path.join(input.outDir, `${baseName}.meta.json`)
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function fetchOfficialPdfArtifact(flags: OfficialPdfCliFlags): Promise<OfficialPdfArtifactResult> {
  const fetcher = new CachedFetcher({
    cacheDir: flags.cacheDir,
    cacheOnly: flags.cacheOnly,
    refresh: flags.refresh,
    delayMs: flags.delayMs
  });

  const baseTitle = await resolveBaseTitle(flags, fetcher);
  const examWikiUrl = toWikiUrl(baseTitle);

  const discoveryCandidates = Array.from(new Set([examWikiUrl, toWikiUrl(`${baseTitle}_Problems`)]));
  let discoveredFrom: string | null = null;
  let pdfUrl: string | null = null;

  for (const candidateUrl of discoveryCandidates) {
    const html = await fetcher.fetchText(candidateUrl);
    const extracted = extractAoPSOfficialPdfUrlFromHtml(html);
    if (extracted) {
      discoveredFrom = candidateUrl;
      pdfUrl = extracted;
      break;
    }
  }

  if (!pdfUrl || !discoveredFrom) {
    throw new Error(`Could not find official AoPS PDF link from exam wiki pages for baseTitle=${baseTitle}.`);
  }

  if (flags.strictMatch) {
    const strictCheck = checkAoPSOfficialPdfIdentity({
      contest: flags.contest,
      year: flags.year,
      exam: flags.exam,
      pdfUrl,
      references: [examWikiUrl, discoveredFrom]
    });

    if (!strictCheck.ok) {
      throw new Error(`Strict match failed for resolved PDF URL: ${strictCheck.reasons.join(" | ")}`);
    }
  }

  const downloaded = await fetcher.fetchBytes(pdfUrl);
  if (!isLikelyPdf(downloaded.contentType, downloaded.bytes)) {
    throw new Error(
      `Resolved URL did not return a valid PDF (content-type=${downloaded.contentType ?? "n/a"}, size=${downloaded.bytes.length}).`
    );
  }

  const sha256 = createHash("sha256").update(downloaded.bytes).digest("hex");
  const size = downloaded.bytes.length;
  const fetchedAt = new Date().toISOString();

  const { pdfPath, metaPath } = getOfficialPdfArtifactPaths({
    outDir: flags.outDir,
    contest: flags.contest,
    year: flags.year,
    exam: flags.exam
  });

  const metadata: OfficialPdfArtifactMetadata = {
    contest: flags.contest,
    year: flags.year,
    exam: flags.exam,
    baseTitle,
    examWikiUrl,
    discoveredFrom,
    pdfUrl,
    sha256,
    size,
    fetchedAt
  };

  await mkdir(flags.outDir, { recursive: true });
  await writeFile(pdfPath, downloaded.bytes);
  await writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  console.log(`official pdf written: ${pdfPath}`);
  console.log(`metadata written: ${metaPath}`);
  console.log(`resolved from: ${discoveredFrom}`);
  console.log(`pdf url: ${pdfUrl}`);
  console.log(`sha256: ${sha256}`);
  console.log(`size: ${size}`);

  return {
    pdfPath,
    metaPath,
    metadata
  };
}

async function loadManifestEntries(manifestPath: string): Promise<OfficialPdfBatchManifestEntry[]> {
  const raw = await readFile(manifestPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Manifest must be a JSON array.");
  }

  return parsed.map((entry, index) => validateManifestEntry(entry, index));
}

export async function fetchOfficialPdfBatch(flags: OfficialPdfBatchCliFlags): Promise<OfficialPdfBatchSummary> {
  const entries = await loadManifestEntries(flags.manifestPath);
  const requestedEntries = flags.limit ? entries.slice(0, flags.limit) : entries;

  const startedAt = new Date().toISOString();
  const summary: OfficialPdfBatchSummary = {
    startedAt,
    finishedAt: startedAt,
    totals: {
      requested: requestedEntries.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skippedExisting: 0
    },
    items: []
  };

  if (requestedEntries.length === 0) {
    summary.finishedAt = new Date().toISOString();
    await mkdir(path.dirname(flags.summaryOut), { recursive: true });
    await writeFile(flags.summaryOut, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    return summary;
  }

  let nextIndex = 0;
  let stopScheduling = false;
  let firstFailureMessage: string | null = null;
  const workerCount = Math.max(1, Math.min(flags.concurrency, requestedEntries.length));

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (stopScheduling) {
        return;
      }

      const index = nextIndex;
      nextIndex += 1;
      if (index >= requestedEntries.length) {
        return;
      }

      const entry = requestedEntries[index];
      const { pdfPath, metaPath } = getOfficialPdfArtifactPaths({
        outDir: flags.outDir,
        contest: entry.contest,
        year: entry.year,
        exam: entry.exam
      });

      if (flags.skipExisting) {
        const [pdfExists, metaExists] = await Promise.all([pathExists(pdfPath), pathExists(metaPath)]);
        if (pdfExists && metaExists) {
          summary.items[index] = {
            ...entry,
            status: "skippedExisting",
            pdfPath,
            metaPath
          };
          summary.totals.processed += 1;
          summary.totals.skippedExisting += 1;
          continue;
        }
      }

      try {
        const result = await fetchOfficialPdfArtifact({
          contest: entry.contest,
          year: entry.year,
          exam: entry.exam,
          outDir: flags.outDir,
          strictMatch: flags.strictMatch,
          cacheDir: flags.cacheDir,
          cacheOnly: flags.cacheOnly,
          refresh: flags.refresh,
          delayMs: flags.delayMs
        });

        summary.items[index] = {
          ...entry,
          status: "succeeded",
          pdfPath: result.pdfPath,
          metaPath: result.metaPath
        };
        summary.totals.processed += 1;
        summary.totals.succeeded += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        summary.items[index] = {
          ...entry,
          status: "failed",
          error: errorMessage
        };
        summary.totals.processed += 1;
        summary.totals.failed += 1;

        if (!flags.continueOnError) {
          stopScheduling = true;
          if (!firstFailureMessage) {
            firstFailureMessage = errorMessage;
          }
        }
      }
    }
  });

  await Promise.all(workers);

  summary.items = summary.items.filter(
    (item): item is OfficialPdfBatchSummaryItem => item !== undefined && item !== null
  );
  summary.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(flags.summaryOut), { recursive: true });
  await writeFile(flags.summaryOut, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (firstFailureMessage) {
    throw new Error(`Batch aborted on first failure: ${firstFailureMessage}`);
  }

  return summary;
}

function printHelp(): void {
  console.log("AoPS ingest tool");
  console.log("");
  console.log("Commands:");
  console.log("  warm-cache --contest AMC12 --year 2025 --exam A [--cache-dir .cache] [--refresh] [--cache-only]");
  console.log("  fetch --contest AMC12 --year 2025 --exam A --out ingest/json/amc12_2025_a.json");
  console.log(
    "  fetch-official-pdf --contest AMC12 --year 2025 --exam A --out-dir ingest/artifacts [--strict-match]"
  );
  console.log(
    "  fetch-official-pdf-batch --manifest ingest/official-pdf-manifest.json --out-dir ingest/artifacts [--summary-out path] [--concurrency 2] [--strict-match] [--continue-on-error] [--skip-existing]"
  );
  console.log("");
  console.log("Flags:");
  console.log("  --contest AMC8|AMC10|AMC12|AIME");
  console.log("  --year <year>");
  console.log("  --exam <A|B|I|II> (not used by AMC8)");
  console.log("  --out <path> (fetch only)");
  console.log("  --out-dir <path> (fetch-official-pdf and batch)");
  console.log("  --manifest <path> (fetch-official-pdf-batch only)");
  console.log("  --summary-out <path> (default: <out-dir>/official-pdf-batch-summary.json)");
  console.log("  --cache-dir <path>");
  console.log("  --cache-only");
  console.log("  --refresh");
  console.log("  --concurrency <1..10> (default 3, warm-cache/fetch)");
  console.log("  --concurrency <1..5> (default 2, fetch-official-pdf-batch)");
  console.log("  --delay-ms <0..10000> (default 300)");
  console.log("  --limit <n> (batch only)");
  console.log("  --continue-on-error (batch only)");
  console.log("  --skip-existing (batch only)");
  console.log("  --max-empty-statements <n> (default 0, fetch only)");
  console.log("  --strict-match (fetch-official-pdf and batch)");
}

export async function main(rawArgs: string[] = process.argv.slice(2)): Promise<void> {
  if (rawArgs.length === 0 || rawArgs.includes("--help") || rawArgs.includes("-h")) {
    printHelp();
    return;
  }

  const parsed = parseArgs(rawArgs);

  if (parsed.command === "warm-cache") {
    await warmCache(parsed.flags);
    return;
  }

  if (parsed.command === "fetch") {
    await fetchToJson(parsed.flags);
    return;
  }

  if (parsed.command === "fetch-official-pdf") {
    await fetchOfficialPdfArtifact(parsed.flags);
    return;
  }

  await fetchOfficialPdfBatch(parsed.flags);
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ingest-aops failed: ${message}`);
    process.exitCode = 1;
  });
}
