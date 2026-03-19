import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Prisma, ProblemSetStatus, Role } from "@prisma/client";
import { diagnosticProblemSets, DIAGNOSTIC_TEST_SEED_SOURCE_URL } from "./diagnostic-problem-sets";

function applyEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function loadSeedEnv() {
  const repoRoot = path.resolve(process.cwd(), "../..");
  applyEnvFile(path.join(repoRoot, ".env.local"));
  applyEnvFile(path.join(repoRoot, ".env"));
}

async function main() {
  loadSeedEnv();
  const { prisma } = await import("../src/client");
  prismaForDisconnect = prisma;
  const email = "admin@arcmath.local";
  const rawPassword = "Admin12345!";
  const pepper = process.env.PASSWORD_PEPPER ?? "";
  const passwordHash = await bcrypt.hash(`${rawPassword}${pepper}`, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      name: "ArcMath Admin",
      role: Role.ADMIN,
      passwordHash
    },
    create: {
      email,
      name: "ArcMath Admin",
      role: Role.ADMIN,
      passwordHash
    }
  });

  for (const problemSet of diagnosticProblemSets) {
    const existingProblemSet = await prisma.problemSet.findFirst({
      where: {
        contest: problemSet.contest,
        year: problemSet.year,
        exam: problemSet.exam
      },
      select: {
        id: true
      }
    });

    const persistedProblemSet = existingProblemSet
      ? await prisma.problemSet.update({
          where: {
            id: existingProblemSet.id
          },
          data: {
            title: problemSet.title,
            sourceUrl: DIAGNOSTIC_TEST_SEED_SOURCE_URL,
            status: ProblemSetStatus.PUBLISHED
          },
          select: {
            id: true
          }
        })
      : await prisma.problemSet.create({
          data: {
            id: problemSet.id,
            contest: problemSet.contest,
            year: problemSet.year,
            exam: problemSet.exam,
            title: problemSet.title,
            sourceUrl: DIAGNOSTIC_TEST_SEED_SOURCE_URL,
            status: ProblemSetStatus.PUBLISHED
          },
          select: {
            id: true
          }
        });

    const problemSetId = persistedProblemSet.id;

    for (const problem of problemSet.problems) {
      const existingProblem = await prisma.problem.findUnique({
        where: {
          problemSetId_number: {
            problemSetId,
            number: problem.number
          }
        },
        select: {
          id: true
        }
      });

      const problemData = {
        problemSetId,
        number: problem.number,
        statement: problem.statement,
        diagramImageUrl: null,
        diagramImageAlt: null,
        choicesImageUrl: null,
        choicesImageAlt: null,
        statementFormat: problem.statementFormat,
        choices: problem.choices === null ? Prisma.DbNull : problem.choices,
        answer: problem.answer,
        answerFormat: problem.answerFormat,
        examTrack: problem.examTrack,
        topicKey: problem.topicKey,
        techniqueTags: problem.techniqueTags,
        diagnosticEligible: problem.diagnosticEligible,
        difficultyBand: problem.difficultyBand,
        solutionSketch: problem.solutionSketch,
        generatedHintLevel1: null,
        generatedHintLevel2: null,
        generatedHintLevel3: null,
        generatedHintPromptVersion: null,
        generatedHintUpdatedAt: null,
        curatedHintLevel1: null,
        curatedHintLevel2: null,
        curatedHintLevel3: null,
        sourceUrl: null,
        tags: Prisma.DbNull
      };

      if (existingProblem) {
        await prisma.problem.update({
          where: {
            id: existingProblem.id
          },
          data: problemData
        });
      } else {
        await prisma.problem.create({
          data: {
            id: problem.id,
            ...problemData
          }
        });
      }
    }

    await prisma.problem.deleteMany({
      where: {
        problemSetId,
        number: {
          gt: problemSet.problems.length
        }
      }
    });
  }

  const seededProblemSets = await prisma.problemSet.findMany({
    where: {
      sourceUrl: DIAGNOSTIC_TEST_SEED_SOURCE_URL
    },
    select: {
      id: true,
      title: true,
      contest: true,
      year: true,
      exam: true,
      _count: {
        select: {
          problems: true
        }
      }
    },
    orderBy: [{ year: "asc" }, { exam: "asc" }]
  });

  console.log(`Seeded admin user: ${email}`);

  for (const problemSet of seededProblemSets) {
    console.log(
      `Seeded diagnostic problem set: ${problemSet.id} - ${problemSet.title} (${problemSet.contest} ${problemSet.year}${problemSet.exam ? ` ${problemSet.exam}` : ""}, ${problemSet._count.problems} problems)`
    );

    const problems = await prisma.problem.findMany({
      where: {
        problemSetId: problemSet.id
      },
      select: {
        id: true,
        number: true,
        answerFormat: true,
        examTrack: true,
        topicKey: true,
        difficultyBand: true
      },
      orderBy: {
        number: "asc"
      }
    });

    for (const problem of problems) {
      console.log(
        `Problem ${problem.number}: ${problem.id} (${problem.answerFormat}, ${problem.examTrack}, ${problem.topicKey}, ${problem.difficultyBand})`
      );
    }
  }
}

let prismaForDisconnect: { $disconnect(): Promise<void> } | null = null;

main()
  .catch((error) => {
    console.error("Failed to seed database", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!prismaForDisconnect) {
      const { prisma } = await import("../src/client");
      prismaForDisconnect = prisma;
    }
    await prismaForDisconnect.$disconnect();
  });
