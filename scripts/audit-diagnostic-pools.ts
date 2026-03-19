import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  selectDiagnosticProblems,
  type DiagnosticCandidateProblem
} from "../apps/web/src/lib/diagnostic-pool";
import type { ExamTrack } from "../apps/web/src/lib/diagnostic-blueprints";
import type { ImportProblemSetInput } from "../packages/shared/src/import-schema";

const REAL_IMPORTS_DIR = path.resolve(process.cwd(), "packages/db/data/real-imports");
const EXAMS: ExamTrack[] = ["AMC8", "AMC10", "AMC12"];

function loadRealImports(): ImportProblemSetInput[] {
  return readdirSync(REAL_IMPORTS_DIR)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => {
      const fullPath = path.join(REAL_IMPORTS_DIR, entry);
      return JSON.parse(readFileSync(fullPath, "utf8")) as ImportProblemSetInput;
    });
}

function toDiagnosticCandidates(payloads: ImportProblemSetInput[]): DiagnosticCandidateProblem[] {
  return payloads.flatMap((payload) =>
    payload.problems.map((problem) => ({
      problemId: `${payload.problemSet.contest}_${payload.problemSet.year}_${payload.problemSet.exam ?? "NA"}_${problem.number}`,
      problemSetId: `${payload.problemSet.contest}_${payload.problemSet.year}_${payload.problemSet.exam ?? "NA"}`,
      problemSetTitle:
        payload.problemSet.title ??
        `${payload.problemSet.contest} ${payload.problemSet.exam ?? ""} ${payload.problemSet.year}`.trim(),
      problemNumber: problem.number,
      examTrack: (problem.examTrack ?? null) as ExamTrack | null,
      topicKey: problem.topicKey ?? null,
      techniqueTags: problem.techniqueTags ?? [],
      difficultyBand: problem.difficultyBand ?? null,
      diagnosticEligible: problem.diagnosticEligible ?? false,
      statement: problem.statement ?? null
    }))
  );
}

function main(): void {
  const payloads = loadRealImports();
  const candidates = toDiagnosticCandidates(payloads);

  for (const exam of EXAMS) {
    const selected = selectDiagnosticProblems(exam, candidates);
    const topicSet = new Set(selected.selectedProblems.map((problem) => problem.topicKey ?? "unknown"));
    console.log(
      JSON.stringify(
        {
          exam,
          selectedCount: selected.selectedProblems.length,
          missingSlots: selected.missingSlots.length,
          missingSlotDetails: selected.missingSlots,
          selectedTopics: [...topicSet],
          selectedProblemIds: selected.selectedProblemIds
        },
        null,
        2
      )
    );
  }
}

main();
