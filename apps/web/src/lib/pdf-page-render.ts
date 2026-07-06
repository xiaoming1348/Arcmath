import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_PREVIEW_DPI = 120;

export class PdfPageRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfPageRenderError";
  }
}

function pdftoppmBinary(): string {
  return process.env.PDFTOPPM_BINARY?.trim() || "pdftoppm";
}

function configuredPreviewDpi(): number {
  const raw = process.env.PDF_PREVIEW_RENDER_DPI;
  if (!raw) return DEFAULT_PREVIEW_DPI;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 72 && parsed <= 220
    ? parsed
    : DEFAULT_PREVIEW_DPI;
}

export async function renderPdfPageToPng(params: {
  pdfBytes: Buffer;
  page: number;
  dpi?: number;
}): Promise<Buffer> {
  if (!Number.isInteger(params.page) || params.page <= 0) {
    throw new PdfPageRenderError("Page must be a positive integer.");
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "arcmath-pdf-page-"));
  const pdfPath = path.join(tempDir, "source.pdf");
  const outputPrefix = path.join(tempDir, "page");
  const pngPath = `${outputPrefix}.png`;

  try {
    await writeFile(pdfPath, params.pdfBytes);
    await execFileAsync(
      pdftoppmBinary(),
      [
        "-png",
        "-singlefile",
        "-r",
        String(params.dpi ?? configuredPreviewDpi()),
        "-f",
        String(params.page),
        "-l",
        String(params.page),
        pdfPath,
        outputPrefix
      ],
      {
        timeout: 30_000,
        maxBuffer: 1_000_000
      }
    );

    return await readFile(pngPath);
  } catch (error) {
    if (error instanceof PdfPageRenderError) {
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
    throw new PdfPageRenderError(
      stderr
        ? `Could not render PDF page: ${stderr}`
        : `Could not render PDF page: ${message}`
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
