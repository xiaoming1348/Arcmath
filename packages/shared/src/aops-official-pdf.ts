import type { Contest } from "./import-schema";

export const AOPS_HOSTNAME = "artofproblemsolving.com";
export const AOPS_OFFICIAL_DOWNLOAD_PATH = "/community/contest/download/";
export const AOPS_WIKI_BASE_URL = `https://${AOPS_HOSTNAME}/wiki/index.php?title=`;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function normalizeAoPSOfficialPdfUrl(raw: string): string | null {
  const decoded = decodeHtmlEntities(raw).trim();
  const withProtocol = decoded.startsWith("/") ? `https://${AOPS_HOSTNAME}${decoded}` : decoded;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  if (!parsed.hostname.endsWith(AOPS_HOSTNAME)) {
    return null;
  }

  if (!parsed.pathname.startsWith(AOPS_OFFICIAL_DOWNLOAD_PATH)) {
    return null;
  }

  return parsed.toString();
}

export function extractAoPSOfficialPdfUrlFromHtml(html: string): string | null {
  const regex = /href=["']([^"']*\/community\/contest\/download\/[^"']+)["']/gi;
  for (const match of html.matchAll(regex)) {
    const normalized = normalizeAoPSOfficialPdfUrl(match[1]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function extractAoPSWikiTitleParam(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!parsed.hostname.endsWith(AOPS_HOSTNAME)) {
    return null;
  }

  const title = parsed.searchParams.get("title");
  if (!title) {
    return null;
  }

  return title.replace(/ /g, "_").trim();
}

export function buildAoPSWikiCandidateUrlsFromSource(sourceUrl: string): string[] {
  const candidates = new Set<string>();
  candidates.add(sourceUrl);

  const title = extractAoPSWikiTitleParam(sourceUrl);
  if (!title) {
    return [...candidates];
  }

  let baseTitle = title;
  baseTitle = baseTitle.replace(/_Answer_Key$/i, "");
  baseTitle = baseTitle.replace(/_Problems\/Problem_\d+$/i, "");
  baseTitle = baseTitle.replace(/\/Problem_\d+$/i, "");

  candidates.add(`${AOPS_WIKI_BASE_URL}${encodeURIComponent(baseTitle)}`);

  if (!/_Problems$/i.test(baseTitle)) {
    candidates.add(`${AOPS_WIKI_BASE_URL}${encodeURIComponent(`${baseTitle}_Problems`)}`);
  }

  return [...candidates];
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function contestTokens(contest: Contest): string[] {
  if (contest === "AIME") {
    return ["aime"];
  }
  if (contest === "AMC8") {
    return ["amc", "8"];
  }
  if (contest === "AMC10") {
    return ["amc", "10"];
  }
  return ["amc", "12"];
}

function examTokenCandidates(exam: string | null): string[] {
  if (!exam) {
    return [];
  }

  const normalized = exam.trim().toUpperCase();
  if (normalized === "II") {
    return ["ii", "2"];
  }
  if (normalized === "I") {
    return ["i", "1"];
  }
  return [normalized.toLowerCase()];
}

function matchesExamByPattern(input: {
  contest: Contest;
  exam: string | null;
  combinedText: string;
}): boolean {
  const exam = input.exam?.trim().toUpperCase();
  if (!exam) {
    return true;
  }

  const text = input.combinedText.toLowerCase();
  if (input.contest === "AMC10" && (exam === "A" || exam === "B")) {
    const examLower = exam.toLowerCase();
    return (
      new RegExp(`amc[^a-z0-9]*10[^a-z0-9]*${examLower}`).test(text) ||
      new RegExp(`\\b10${examLower}\\b`).test(text)
    );
  }

  if (input.contest === "AMC12" && (exam === "A" || exam === "B")) {
    const examLower = exam.toLowerCase();
    return (
      new RegExp(`amc[^a-z0-9]*12[^a-z0-9]*${examLower}`).test(text) ||
      new RegExp(`\\b12${examLower}\\b`).test(text)
    );
  }

  if (input.contest === "AIME" && (exam === "I" || exam === "II")) {
    const examLower = exam.toLowerCase();
    return (
      new RegExp(`aime[^a-z0-9]*${examLower}`).test(text) ||
      (exam === "I" && /\\baime[^a-z0-9]*1\\b/.test(text)) ||
      (exam === "II" && /\\baime[^a-z0-9]*2\\b/.test(text))
    );
  }

  return false;
}

export type AoPSOfficialPdfIdentityCheckInput = {
  contest: Contest;
  year: number;
  exam: string | null;
  pdfUrl: string;
  references?: string[];
};

export type AoPSOfficialPdfIdentityCheckResult = {
  ok: boolean;
  reasons: string[];
  urlTokens: string[];
  filenameTokens: string[];
  referenceTokens: string[];
};

export function checkAoPSOfficialPdfIdentity(
  input: AoPSOfficialPdfIdentityCheckInput
): AoPSOfficialPdfIdentityCheckResult {
  const reasons: string[] = [];

  let parsed: URL;
  try {
    parsed = new URL(input.pdfUrl);
  } catch {
    return {
      ok: false,
      reasons: ["pdfUrl is not a valid URL."],
      urlTokens: [],
      filenameTokens: [],
      referenceTokens: []
    };
  }

  const urlTokens = tokenize(`${parsed.hostname} ${parsed.pathname} ${parsed.search}`);
  const filename = parsed.pathname.split("/").pop() ?? "";
  const filenameTokens = tokenize(filename);
  const referenceTokens = tokenize((input.references ?? []).join(" "));
  const allTokens = new Set<string>([...urlTokens, ...filenameTokens, ...referenceTokens]);
  const combinedText = `${input.pdfUrl} ${filename} ${(input.references ?? []).join(" ")}`;

  for (const token of contestTokens(input.contest)) {
    if (!allTokens.has(token)) {
      reasons.push(`Missing contest token \"${token}\" in URL/filename/reference tokens.`);
    }
  }

  const yearToken = String(input.year);
  if (!allTokens.has(yearToken)) {
    reasons.push(`Missing year token \"${yearToken}\" in URL/filename/reference tokens.`);
  }

  const examCandidates = examTokenCandidates(input.exam);
  if (examCandidates.length > 0) {
    const examMatched =
      examCandidates.some((candidate) => allTokens.has(candidate)) ||
      matchesExamByPattern({
        contest: input.contest,
        exam: input.exam,
        combinedText
      });
    if (!examMatched) {
      reasons.push(
        `Missing exam token for \"${input.exam}\" (accepted: ${examCandidates.join(", " )}) in URL/filename/reference tokens.`
      );
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    urlTokens,
    filenameTokens,
    referenceTokens
  };
}
