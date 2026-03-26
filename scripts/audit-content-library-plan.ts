import fs from "node:fs";
import path from "node:path";
import {
  DIAGNOSTIC_PROGRAM_PLAN,
  DIAGNOSTIC_STAGE_PLANS,
  REAL_EXAM_LIBRARY_PLAN,
  TOPIC_PRACTICE_LIBRARY_PLAN,
  type DiagnosticStage,
  type ExamTrack
} from "../apps/web/src/lib/content-library-plan";

type RealImportSummary = {
  examCounts: Record<string, number>;
  totalFrom2015: number;
};

type DiagnosticSeedSummary = Record<ExamTrack, { count: number; stages: DiagnosticStage[] }>;

function parseDiagnosticSeedFile(fileText: string): DiagnosticSeedSummary {
  const lines = fileText.split(/\r?\n/);
  const summary: DiagnosticSeedSummary = {
    AMC8: { count: 0, stages: [] },
    AMC10: { count: 0, stages: [] },
    AMC12: { count: 0, stages: [] }
  };

  let currentContest: ExamTrack | null = null;
  let currentStage: DiagnosticStage | null = null;

  for (const line of lines) {
    const contestMatch = line.match(/contest:\s*Contest\.(AMC8|AMC10|AMC12)/);
    if (contestMatch) {
      currentContest = contestMatch[1] as ExamTrack;
    }

    const stageMatch = line.match(/diagnosticStage:\s*(?:DiagnosticStage\.)?"(EARLY|MID|LATE)"|diagnosticStage:\s*(?:DiagnosticStage\.)?(EARLY|MID|LATE)/);
    if (stageMatch) {
      currentStage = (stageMatch[1] ?? stageMatch[2]) as DiagnosticStage;
    }

    if (line.includes("problems: [") && currentContest && currentStage) {
      summary[currentContest].count += 1;
      if (!summary[currentContest].stages.includes(currentStage)) {
        summary[currentContest].stages.push(currentStage);
      }
      currentContest = null;
      currentStage = null;
    }
  }

  return summary;
}

function summarizeDiagnosticSeeds(): DiagnosticSeedSummary {
  const diagnosticSeedFile = path.join(process.cwd(), "packages/db/prisma/diagnostic-problem-sets.ts");
  const text = fs.readFileSync(diagnosticSeedFile, "utf8");
  return parseDiagnosticSeedFile(text);
}

function summarizeRealImports(): RealImportSummary {
  const directory = path.join(process.cwd(), "packages/db/data/real-imports");
  const files = fs.readdirSync(directory).filter((entry) => entry.endsWith(".json"));
  const examCounts: Record<string, number> = {
    AMC8: 0,
    AMC10: 0,
    AMC12: 0,
    AIME: 0
  };

  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")) as {
      problemSet?: {
        contest?: string;
        year?: number;
      };
    };

    const contest = payload.problemSet?.contest;
    const year = payload.problemSet?.year;
    if (!contest || typeof year !== "number") {
      continue;
    }

    if (year < REAL_EXAM_LIBRARY_PLAN.yearFrom) {
      continue;
    }

    if (contest in examCounts) {
      examCounts[contest] += 1;
    }
  }

  return {
    examCounts,
    totalFrom2015: Object.values(examCounts).reduce((sum, value) => sum + value, 0)
  };
}

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

function main() {
  const diagnosticCounts = summarizeDiagnosticSeeds();
  const realImportSummary = summarizeRealImports();

  printSection("Diagnostic program target");
  for (const [exam, plan] of Object.entries(DIAGNOSTIC_PROGRAM_PLAN) as Array<[ExamTrack, (typeof DIAGNOSTIC_PROGRAM_PLAN)[ExamTrack]]>) {
    console.log(
      `${exam}: ${diagnosticCounts[exam].count}/${plan.targetSets} seeded sets present; stages = ${plan.stages
        .map((stage) =>
          diagnosticCounts[exam].stages.includes(stage)
            ? `${stage}:${DIAGNOSTIC_STAGE_PLANS[stage].questionCount}`
            : `${stage}:missing`
        )
        .join(", ")}`
    );
  }

  printSection("Real exam library target");
  console.log(`Target years: ${REAL_EXAM_LIBRARY_PLAN.yearFrom}+`);
  for (const contest of REAL_EXAM_LIBRARY_PLAN.contests) {
    console.log(`${contest}: ${realImportSummary.examCounts[contest]} imported canonical sets in range`);
  }
  console.log(`Total imported sets in range: ${realImportSummary.totalFrom2015}`);

  printSection("Topic practice target");
  for (const plan of TOPIC_PRACTICE_LIBRARY_PLAN) {
    const [minQuestions, maxQuestions] = plan.questionCountRange;
    console.log(
      `${plan.exam}: ${minQuestions}-${maxQuestions} problems, ratio EASY:MEDIUM:HARD = ${plan.difficultyRatio.EASY}:${plan.difficultyRatio.MEDIUM}:${plan.difficultyRatio.HARD}`
    );
    console.log(`  Example tracks: ${plan.exampleTracks.join("; ")}`);
  }
}

main();
