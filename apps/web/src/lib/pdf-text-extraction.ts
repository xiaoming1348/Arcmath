import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_OUTPUT_BYTES = 2_000_000;

export class PdfTextExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfTextExtractionError";
  }
}

function pdftotextBinary(): string {
  return process.env.PDFTOTEXT_BINARY?.trim() || "pdftotext";
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function extractPdfPageText(params: {
  pdfBytes: Buffer;
  pageStart: number;
  pageEnd: number;
  maxOutputBytes?: number;
}): Promise<string> {
  if (!Number.isInteger(params.pageStart) || params.pageStart <= 0) {
    throw new PdfTextExtractionError("Start page must be a positive integer.");
  }
  if (!Number.isInteger(params.pageEnd) || params.pageEnd < params.pageStart) {
    throw new PdfTextExtractionError("End page must be greater than or equal to start page.");
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "arcmath-pdf-extract-"));
  const pdfPath = path.join(tempDir, "source.pdf");

  try {
    await writeFile(pdfPath, params.pdfBytes);
    const { stdout } = await execFileAsync(
      pdftotextBinary(),
      [
        "-f",
        String(params.pageStart),
        "-l",
        String(params.pageEnd),
        "-layout",
        "-enc",
        "UTF-8",
        pdfPath,
        "-"
      ],
      {
        timeout: 20_000,
        maxBuffer: params.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
      }
    );
    const text = normalizeExtractedText(stdout);
    if (!text) {
      throw new PdfTextExtractionError(
        "No selectable text was found on those pages. This PDF may be scanned; upload a searchable PDF or paste the selected text manually."
      );
    }
    return text;
  } catch (error) {
    if (error instanceof PdfTextExtractionError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr.trim()
        : "";
    throw new PdfTextExtractionError(
      stderr
        ? `Could not extract text from the selected PDF pages: ${stderr}`
        : `Could not extract text from the selected PDF pages: ${message}`
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
