import { execFile } from "node:child_process";
import { readdir, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ocrPrintedMathPageToText } from "@/lib/ai/ocr-handwriting";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_OCR_PAGES = 6;
const DEFAULT_RENDER_DPI = 180;

export class PdfOcrExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfOcrExtractionError";
  }
}

export type PdfOcrExtractionResult = {
  text: string;
  pageCount: number;
  confidence: "high" | "medium" | "low";
  notes: string[];
};

function pdftoppmBinary(): string {
  return process.env.PDFTOPPM_BINARY?.trim() || "pdftoppm";
}

function configuredMaxPages(): number {
  const raw = process.env.PDF_OCR_MAX_PAGES;
  if (!raw) return DEFAULT_MAX_OCR_PAGES;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_OCR_PAGES;
}

function configuredRenderDpi(): number {
  const raw = process.env.PDF_OCR_RENDER_DPI;
  if (!raw) return DEFAULT_RENDER_DPI;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 96 && parsed <= 240
    ? parsed
    : DEFAULT_RENDER_DPI;
}

function validatePageRange(pageStart: number, pageEnd: number): number {
  if (!Number.isInteger(pageStart) || pageStart <= 0) {
    throw new PdfOcrExtractionError("Start page must be a positive integer.");
  }
  if (!Number.isInteger(pageEnd) || pageEnd < pageStart) {
    throw new PdfOcrExtractionError("End page must be greater than or equal to start page.");
  }
  const pageCount = pageEnd - pageStart + 1;
  const maxPages = configuredMaxPages();
  if (pageCount > maxPages) {
    throw new PdfOcrExtractionError(
      `OCR extraction is limited to ${maxPages} selected pages at a time. Choose a narrower page range.`
    );
  }
  return pageCount;
}

function renderedPageNumber(fileName: string): number | null {
  const match = /-(\d+)\.png$/i.exec(fileName);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function mergeConfidence(values: Array<"high" | "medium" | "low" | "none">): "high" | "medium" | "low" {
  if (values.includes("low") || values.includes("none")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}

export async function extractPdfPageTextByOcr(params: {
  pdfBytes: Buffer;
  pageStart: number;
  pageEnd: number;
  uiLocale: "en" | "zh";
}): Promise<PdfOcrExtractionResult> {
  const pageCount = validatePageRange(params.pageStart, params.pageEnd);
  const tempDir = await mkdtemp(path.join(tmpdir(), "arcmath-pdf-ocr-"));
  const pdfPath = path.join(tempDir, "source.pdf");
  const outputPrefix = path.join(tempDir, "page");

  try {
    await writeFile(pdfPath, params.pdfBytes);
    await execFileAsync(
      pdftoppmBinary(),
      [
        "-png",
        "-r",
        String(configuredRenderDpi()),
        "-f",
        String(params.pageStart),
        "-l",
        String(params.pageEnd),
        pdfPath,
        outputPrefix
      ],
      {
        timeout: 45_000 + pageCount * 15_000,
        maxBuffer: 1_000_000
      }
    );

    const renderedFiles = (await readdir(tempDir))
      .filter((fileName) => fileName.toLowerCase().endsWith(".png"))
      .map((fileName, index) => ({
        fileName,
        pageNumber: renderedPageNumber(fileName) ?? params.pageStart + index
      }))
      .sort((a, b) => a.pageNumber - b.pageNumber);

    if (renderedFiles.length === 0) {
      throw new PdfOcrExtractionError("Could not render the selected PDF pages for OCR.");
    }

    const pageTexts: string[] = [];
    const confidenceValues: Array<"high" | "medium" | "low" | "none"> = [];
    const notes: string[] = [];

    for (const rendered of renderedFiles) {
      const imageBuffer = await readFile(path.join(tempDir, rendered.fileName));
      const imageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;
      const result = await ocrPrintedMathPageToText({
        imageDataUrl,
        uiLocale: params.uiLocale,
        pageNumber: rendered.pageNumber,
        scope: "pdf-page-ocr"
      });

      if (!result) {
        confidenceValues.push("none");
        notes.push(`Page ${rendered.pageNumber}: OCR unavailable or failed.`);
        continue;
      }

      confidenceValues.push(result.confidence);
      if (result.notes) {
        notes.push(`Page ${rendered.pageNumber}: ${result.notes}`);
      }
      const normalized = normalizeOcrText(result.text);
      if (normalized) {
        pageTexts.push(`Page ${rendered.pageNumber}\n${normalized}`);
      } else {
        notes.push(`Page ${rendered.pageNumber}: no readable text returned.`);
      }
    }

    if (pageTexts.length === 0) {
      throw new PdfOcrExtractionError(
        "OCR could not read text from the selected pages. Try a narrower range, a higher-quality PDF, or paste the selected text manually."
      );
    }

    return {
      text: pageTexts.join("\n\n---\n\n").slice(0, 12000),
      pageCount: renderedFiles.length,
      confidence: mergeConfidence(confidenceValues),
      notes
    };
  } catch (error) {
    if (error instanceof PdfOcrExtractionError) {
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
    throw new PdfOcrExtractionError(
      stderr
        ? `Could not OCR the selected PDF pages: ${stderr}`
        : `Could not OCR the selected PDF pages: ${message}`
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
