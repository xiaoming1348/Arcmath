import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyRealImportQuality,
  auditRealImportPayload,
  inferTopicKey,
  inferTechniqueTags,
  normalizeImportedChoice
} from "./real-import-quality";
import type { ImportProblemSetInput } from "../packages/shared/src/import-schema";

describe("real-import-quality", () => {
  it("normalizes noisy multiple-choice text", () => {
    expect(normalizeImportedChoice("\\ 30\\% ")).toBe("30%");
    expect(normalizeImportedChoice("\\ If Lewis received an A. \\")).toBe("If Lewis received an A.");
  });

  it("infers coarse topic keys conservatively", () => {
    expect(inferTopicKey("How many ordered pairs satisfy the equation?", "MULTIPLE_CHOICE")).toBe("counting.general");
    expect(inferTopicKey("A triangle has area 12 and perimeter 16.", "MULTIPLE_CHOICE")).toBe("geometry.general");
    expect(inferTopicKey("What is the remainder when 2^10 is divided by 7?", "INTEGER")).toBe("number_theory.general");
    expect(inferTopicKey("If \\sin x = 3/5, what is \\cos 2x?", "MULTIPLE_CHOICE")).toBe("trigonometry.general");
  });

  it("infers conservative technique tags", () => {
    expect(
      inferTechniqueTags(
        "What is the remainder when 2^10 is divided by 7?",
        "number_theory.general",
        "INTEGER"
      )
    ).toEqual(expect.arrayContaining(["divisibility_reasoning", "modular_reasoning"]));
  });

  it("adds baseline tutor metadata and removes suspicious choice escapes", () => {
    const fixturePath = path.resolve(process.cwd(), "packages/db/data/real-imports/AMC12_2017_A.json");
    const payload = JSON.parse(readFileSync(fixturePath, "utf8")) as ImportProblemSetInput;
    payload.problems[2].choices = [
      "\\ If Lewis did not receive an A, then he got all of the multiple choice questions wrong. \\",
      "\\ If Lewis did not receive an A, then he got at least one of the multiple choice questions wrong. \\",
      "\\ If Lewis got at least one of the multiple choice questions wrong, then he did not receive an A. \\",
      "\\ If Lewis received an A, then he got all of the multiple choice questions right. \\",
      "\\ If Lewis received an A, then he got at least one of the multiple choice questions right."
    ];

    const nextPayload = applyRealImportQuality(payload, "AMC12_2017_A");
    expect(nextPayload.problems[2].difficultyBand).toBe("EASY");
    expect(nextPayload.problems[2].examTrack).toBe("AMC12");
    expect(nextPayload.problems[2].diagnosticEligible).toBe(true);
    expect((nextPayload.problems[2].techniqueTags ?? []).length).toBeGreaterThan(0);
    expect(nextPayload.problems[2].choices).toEqual([
      "If Lewis did not receive an A, then he got all of the multiple choice questions wrong.",
      "If Lewis did not receive an A, then he got at least one of the multiple choice questions wrong.",
      "If Lewis got at least one of the multiple choice questions wrong, then he did not receive an A.",
      "If Lewis received an A, then he got all of the multiple choice questions right.",
      "If Lewis received an A, then he got at least one of the multiple choice questions right."
    ]);
  });

  it("audits suspicious choices and likely figure references", () => {
    const payload: ImportProblemSetInput = {
      problemSet: {
        contest: "AMC8",
        year: 2018,
        exam: null,
        title: "AMC 8 2018",
        sourceUrl: "https://example.com"
      },
      problems: [
        {
          number: 4,
          statement: "In the figure below, what is the shaded area?",
          statementFormat: "MARKDOWN_LATEX",
          answer: "A",
          answerFormat: "MULTIPLE_CHOICE",
          choices: ["\\ 12", "13", "14", "15", "16"]
        }
      ]
    };

    const summary = auditRealImportPayload(payload, "AMC8_2018");
    expect(summary.suspiciousChoiceProblems).toEqual([4]);
    expect(summary.likelyFigureDependentProblems).toEqual([4]);
  });
});
