import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parsePaperFromTopicUrlArgs,
  resolvePaperWorkPaths,
  runPaperFromTopicUrl,
  type PaperFromTopicUrlArgs
} from "./paper-from-topic-url";

async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "paper-from-topic-url-"));
}

describe("paper-from-topic-url args", () => {
  it("parses required args and flags", () => {
    const parsed = parsePaperFromTopicUrlArgs([
      "--url",
      "https://artofproblemsolving.com/community/h3198872",
      "--work-dir",
      "tmp/one-paper",
      "--dry-run",
      "--force"
    ]);

    expect(parsed.url).toBe("https://artofproblemsolving.com/community/h3198872");
    expect(parsed.workDir).toBe(path.resolve(process.cwd(), "tmp/one-paper"));
    expect(parsed.dryRun).toBe(true);
    expect(parsed.force).toBe(true);
  });

  it("requires url and work-dir", () => {
    expect(() => parsePaperFromTopicUrlArgs(["--work-dir", "tmp/one-paper"])).toThrow("Missing required --url");
    expect(() =>
      parsePaperFromTopicUrlArgs(["--url", "https://artofproblemsolving.com/community/h3198872"])
    ).toThrow("Missing required --work-dir");
  });
});

describe("paper-from-topic-url orchestration", () => {
  it("writes json + summary and reports cached PDF path on success", async () => {
    const tempDir = await makeTempDir();
    const args: PaperFromTopicUrlArgs = {
      url: "https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme",
      workDir: tempDir,
      dryRun: false,
      force: false
    };

    const summary = await runPaperFromTopicUrl(args, {
      fetchTopicImport: async () => ({
        metadata: {
          topicId: 3198872,
          title: "2025 AMC 12A Discussion",
          topicUrl: "https://artofproblemsolving.com/community/h3198872",
          contest: "AMC12",
          year: 2025,
          exam: "A"
        },
        extraction: {
          strategy: "dom.fallback",
          attemptedStrategies: ["bootstrap.preload_posts", "bootstrap.preload_topics", "bootstrap.other_field", "dom.fallback"]
        },
        payload: {
          problemSet: {
            contest: "AMC12",
            year: 2025,
            exam: "A",
            sourceUrl: "https://artofproblemsolving.com/community/h3198872"
          },
          problems: [
            {
              number: 1,
              statement: "If x = 1, what is x + 1?",
              statementFormat: "MARKDOWN_LATEX",
              answer: "B",
              answerFormat: "MULTIPLE_CHOICE",
              sourceUrl: "https://artofproblemsolving.com/community/h3198872"
            }
          ]
        }
      }),
      importDir: async () => ({
        files: 1,
        filesMatched: 1,
        filesSkippedByFilter: 0,
        filesSkippedByLimit: 0,
        dryRun: false,
        setsCreated: 1,
        setsUpdated: 0,
        problemsCreated: 1,
        problemsUpdated: 0,
        problemsSkipped: 0,
        failedFiles: 0
      }),
      findProblemSet: async () => ({ id: "ps_123" }),
      generatePdf: async () => ({
        ok: true,
        problemSetId: "ps_123",
        generatedProblemCount: 1,
        cache: {
          path: "/tmp/official-pdfs/ps_123.pdf",
          size: 2048,
          sha256: "abc123"
        },
        pdfBytes: Buffer.from("%PDF-1.4 mock"),
        problemSet: {
          id: "ps_123",
          title: "AMC 12A 2025",
          contest: "AMC12",
          year: 2025,
          exam: "A",
          sourceUrl: "https://artofproblemsolving.com/community/h3198872",
          verifiedPdfUrl: null,
          cachedPdfPath: "/tmp/official-pdfs/ps_123.pdf",
          cachedPdfSha256: "abc123",
          cachedPdfSize: 2048,
          cachedPdfAt: new Date("2026-03-04T00:00:00.000Z"),
          cachedPdfStatus: "CACHED",
          cachedPdfError: null
        }
      }),
      getStorageDriver: () => "local",
      now: vi
        .fn()
        .mockReturnValueOnce(new Date("2026-03-04T00:00:00.000Z"))
        .mockReturnValueOnce(new Date("2026-03-04T00:00:01.000Z"))
    });

    expect(summary.resolvedMetadata).toMatchObject({
      contest: "AMC12",
      year: 2025,
      exam: "A"
    });
    expect(summary.extraction).toMatchObject({
      strategy: "dom.fallback"
    });
    expect(summary.problemSetId).toBe("ps_123");
    expect(summary.cachedPdfPath).toBe("/tmp/official-pdfs/ps_123.pdf");
    expect(summary.cachedPdfStatus).toBe("CACHED");

    const paths = resolvePaperWorkPaths(args);
    const jsonRaw = await readFile(path.join(paths.importsDir, "AMC12_2025_A.json"), "utf8");
    expect(JSON.parse(jsonRaw)).toMatchObject({
      problemSet: {
        contest: "AMC12",
        year: 2025,
        exam: "A"
      }
    });

    const summaryRaw = await readFile(paths.summaryPath, "utf8");
    expect(JSON.parse(summaryRaw)).toMatchObject({
      problemSetId: "ps_123",
      cachedPdfPath: "/tmp/official-pdfs/ps_123.pdf"
    });
  });

  it("supports dry-run preview without DB generation", async () => {
    const tempDir = await makeTempDir();
    const args: PaperFromTopicUrlArgs = {
      url: "https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme",
      workDir: tempDir,
      dryRun: true,
      force: false
    };

    const findProblemSet = vi.fn(async () => ({ id: "should-not-run" }));
    const generatePdf = vi.fn(async () => {
      throw new Error("should-not-run");
    });

    const summary = await runPaperFromTopicUrl(args, {
      fetchTopicImport: async () => ({
        metadata: {
          topicId: 3198872,
          title: "2025 AMC 12A Discussion",
          topicUrl: "https://artofproblemsolving.com/community/h3198872",
          contest: "AMC12",
          year: 2025,
          exam: "A"
        },
        extraction: {
          strategy: "bootstrap.other_field",
          attemptedStrategies: ["bootstrap.preload_posts", "bootstrap.preload_topics", "bootstrap.other_field"]
        },
        payload: {
          problemSet: {
            contest: "AMC12",
            year: 2025,
            exam: "A",
            sourceUrl: "https://artofproblemsolving.com/community/h3198872"
          },
          problems: [
            {
              number: 1,
              statement: "Preview only.",
              statementFormat: "MARKDOWN_LATEX",
              sourceUrl: "https://artofproblemsolving.com/community/h3198872"
            }
          ]
        }
      }),
      importDir: async () => ({
        files: 1,
        filesMatched: 1,
        filesSkippedByFilter: 0,
        filesSkippedByLimit: 0,
        dryRun: true,
        setsCreated: 0,
        setsUpdated: 0,
        problemsCreated: 0,
        problemsUpdated: 0,
        problemsSkipped: 0,
        failedFiles: 0
      }),
      findProblemSet,
      generatePdf,
      now: vi
        .fn()
        .mockReturnValueOnce(new Date("2026-03-04T00:00:00.000Z"))
        .mockReturnValueOnce(new Date("2026-03-04T00:00:01.000Z"))
    });

    expect(summary.import.status).toBe("success");
    expect(summary.extraction).toMatchObject({
      strategy: "bootstrap.other_field"
    });
    expect(summary.generate.status).toBe("skipped");
    expect(summary.cachedPdfStatus).toBe("SKIPPED_DRY_RUN");
    expect(findProblemSet).not.toHaveBeenCalled();
    expect(generatePdf).not.toHaveBeenCalled();
  });
});
