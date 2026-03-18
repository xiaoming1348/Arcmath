import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { AnswerFormat, Contest, ProblemSetStatus, Role, StatementFormat } from "@prisma/client";

const HINT_TUTOR_SEED_SOURCE_URL = "local://seed/hint-tutor";

const hintTutorProblemSets = [
  {
    id: "seed_hint_tutor_set_v1",
    contest: Contest.AMC10,
    year: 2099,
    exam: "A",
    title: "Hint Tutor Foundations",
    problems: [
      {
        id: "seed_hint_tutor_p1",
        number: 1,
        statement: "If 2x + 3 = 11, what is the value of x?",
        statementFormat: StatementFormat.PLAIN,
        choices: ["3", "4", "5", "6"],
        answer: "B",
        answerFormat: AnswerFormat.MULTIPLE_CHOICE,
        topicKey: "algebra.linear_equations",
        difficultyBand: "EASY",
        solutionSketch: "Subtract 3 from both sides to get 2x = 8, then divide by 2.",
        curatedHintLevel1: "Undo the +3 before you try to solve for x.",
        curatedHintLevel2: "Subtract 3 from both sides so the equation becomes 2x = 8.",
        curatedHintLevel3: "Once you have 2x = 8, divide both sides by 2 to identify the matching choice."
      },
      {
        id: "seed_hint_tutor_p2",
        number: 2,
        statement: "What is the remainder when 17 is divided by 5?",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "2",
        answerFormat: AnswerFormat.INTEGER,
        topicKey: "number_theory.modular_arithmetic",
        difficultyBand: "EASY",
        solutionSketch: "Write 17 = 5 x 3 + 2. The remainder is the leftover after division by 5."
      },
      {
        id: "seed_hint_tutor_p3",
        number: 3,
        statement: "Simplify 3(a + 2) - a.",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "2a+6",
        answerFormat: AnswerFormat.EXPRESSION,
        topicKey: "algebra.expressions",
        difficultyBand: "EASY",
        solutionSketch: "Distribute 3 to get 3a + 6, then combine like terms with -a.",
        curatedHintLevel1: "Start by distributing the 3 across the parentheses.",
        curatedHintLevel2: "Rewrite the expression as 3a + 6 - a before simplifying.",
        curatedHintLevel3: "Combine the a-terms first, then keep the constant term unchanged."
      },
      {
        id: "seed_hint_tutor_p4",
        number: 4,
        statement: "What is the value of 7 + 8 x 2?",
        statementFormat: StatementFormat.PLAIN,
        choices: ["22", "23", "30", "15"],
        answer: "B",
        answerFormat: AnswerFormat.MULTIPLE_CHOICE,
        topicKey: "arithmetic.order_of_operations",
        difficultyBand: "EASY",
        solutionSketch: "Multiply before adding: 8 x 2 = 16, then add 7."
      },
      {
        id: "seed_hint_tutor_p5",
        number: 5,
        statement: "A number is increased by 9 to get 21. What is the original number?",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "12",
        answerFormat: AnswerFormat.INTEGER,
        topicKey: "algebra.linear_equations",
        difficultyBand: "EASY",
        solutionSketch: "Set up n + 9 = 21, then subtract 9 from both sides."
      },
      {
        id: "seed_hint_tutor_p6",
        number: 6,
        statement: "Which expression is equivalent to x + x + x + 5?",
        statementFormat: StatementFormat.PLAIN,
        choices: ["x+5", "2x+5", "3x+5", "5x"],
        answer: "C",
        answerFormat: AnswerFormat.MULTIPLE_CHOICE,
        topicKey: "algebra.expressions",
        difficultyBand: "EASY",
        solutionSketch: "Count the x terms: x + x + x = 3x, then keep the constant 5."
      }
    ]
  },
  {
    id: "seed_hint_tutor_set_v2",
    contest: Contest.AMC10,
    year: 2099,
    exam: "B",
    title: "Hint Tutor Mixed Practice",
    problems: [
      {
        id: "seed_hint_tutor_v2_p1",
        number: 1,
        statement: "If 5x - 7 = 18, what is the value of x?",
        statementFormat: StatementFormat.PLAIN,
        choices: ["4", "5", "6", "7"],
        answer: "B",
        answerFormat: AnswerFormat.MULTIPLE_CHOICE,
        topicKey: "algebra.linear_equations",
        difficultyBand: "MEDIUM",
        solutionSketch: "Add 7 to both sides to get 5x = 25, then divide by 5."
      },
      {
        id: "seed_hint_tutor_v2_p2",
        number: 2,
        statement: "Simplify 2(3x - 1) + 4.",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "6x+2",
        answerFormat: AnswerFormat.EXPRESSION,
        topicKey: "algebra.expressions",
        difficultyBand: "MEDIUM",
        solutionSketch: "Distribute 2 across the parentheses, then combine the constants -2 and +4."
      },
      {
        id: "seed_hint_tutor_v2_p3",
        number: 3,
        statement: "What is the remainder when 43 is divided by 6?",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "1",
        answerFormat: AnswerFormat.INTEGER,
        topicKey: "number_theory.modular_arithmetic",
        difficultyBand: "EASY",
        solutionSketch: "Use 43 = 6 x 7 + 1. The remainder is what stays after subtracting the multiple of 6."
      },
      {
        id: "seed_hint_tutor_v2_p4",
        number: 4,
        statement: "What is the value of 18 ÷ 3 × 2 + 4?",
        statementFormat: StatementFormat.PLAIN,
        choices: ["16", "12", "10", "8"],
        answer: "A",
        answerFormat: AnswerFormat.MULTIPLE_CHOICE,
        topicKey: "arithmetic.order_of_operations",
        difficultyBand: "MEDIUM",
        solutionSketch: "Evaluate division and multiplication from left to right before the final addition.",
        curatedHintLevel1: "Do not add 4 yet. Finish the division and multiplication part first.",
        curatedHintLevel2: "Evaluate 18 ÷ 3, then multiply that result by 2.",
        curatedHintLevel3: "After simplifying the left part to 12, add 4 and choose the matching option."
      },
      {
        id: "seed_hint_tutor_v2_p5",
        number: 5,
        statement: "If 3x + 5 = 2x + 11, what is the value of x?",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "6",
        answerFormat: AnswerFormat.INTEGER,
        topicKey: "algebra.linear_equations",
        difficultyBand: "EASY",
        solutionSketch: "Move x terms to one side and constants to the other: 3x - 2x = 11 - 5."
      },
      {
        id: "seed_hint_tutor_v2_p6",
        number: 6,
        statement: "Which expression is equivalent to 4(y - 2) + y?",
        statementFormat: StatementFormat.PLAIN,
        choices: ["4y-2", "5y-8", "5y-2", "4y-8"],
        answer: "B",
        answerFormat: AnswerFormat.MULTIPLE_CHOICE,
        topicKey: "algebra.expressions",
        difficultyBand: "MEDIUM",
        solutionSketch: "Distribute 4, then combine like terms: 4y - 8 + y."
      }
    ]
  },
  {
    id: "seed_hint_tutor_set_v3",
    contest: Contest.AMC12,
    year: 2100,
    exam: "A",
    title: "Hint Tutor Challenge Review",
    problems: [
      {
        id: "seed_hint_tutor_v3_p1",
        number: 1,
        statement: "If 4(x - 3) = 2(x + 5), what is the value of x?",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "11",
        answerFormat: AnswerFormat.INTEGER,
        topicKey: "algebra.linear_equations",
        difficultyBand: "MEDIUM",
        solutionSketch: "Distribute both sides, collect x terms on one side, and constants on the other."
      },
      {
        id: "seed_hint_tutor_v3_p2",
        number: 2,
        statement: "Simplify (2a + 3) - (a - 4).",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "a+7",
        answerFormat: AnswerFormat.EXPRESSION,
        topicKey: "algebra.expressions",
        difficultyBand: "EASY",
        solutionSketch: "Subtract the second parentheses carefully: (2a + 3) - a + 4, then combine like terms."
      },
      {
        id: "seed_hint_tutor_v3_p3",
        number: 3,
        statement: "What is the remainder when 5^4 is divided by 7?",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "2",
        answerFormat: AnswerFormat.INTEGER,
        topicKey: "number_theory.modular_arithmetic",
        difficultyBand: "MEDIUM",
        solutionSketch: "Reduce powers mod 7: 5^2 = 25 ≡ 4, so 5^4 ≡ 4^2 = 16 ≡ 2.",
        curatedHintLevel1: "Reduce powers step by step modulo 7 instead of computing 5^4 directly.",
        curatedHintLevel2: "First find 5^2 mod 7, then square that smaller remainder.",
        curatedHintLevel3: "Since 5^2 leaves remainder 4 mod 7, the problem becomes finding 4^2 mod 7."
      },
      {
        id: "seed_hint_tutor_v3_p4",
        number: 4,
        statement: "What is the value of 3 + 2 × (5 + 1)?",
        statementFormat: StatementFormat.PLAIN,
        choices: ["15", "18", "19", "21"],
        answer: "A",
        answerFormat: AnswerFormat.MULTIPLE_CHOICE,
        topicKey: "arithmetic.order_of_operations",
        difficultyBand: "EASY",
        solutionSketch: "Evaluate inside parentheses first, then multiply, then add."
      },
      {
        id: "seed_hint_tutor_v3_p5",
        number: 5,
        statement: "If 3(2x - 5) = 5(x - 1) + 8, what is the value of x?",
        statementFormat: StatementFormat.PLAIN,
        choices: null,
        answer: "18",
        answerFormat: AnswerFormat.INTEGER,
        topicKey: "algebra.linear_equations",
        difficultyBand: "HARD",
        solutionSketch: "Distribute both sides, simplify to one linear equation, then isolate x."
      },
      {
        id: "seed_hint_tutor_v3_p6",
        number: 6,
        statement: "Which expression is equivalent to 3(2x + 1) - 2(x - 4)?",
        statementFormat: StatementFormat.PLAIN,
        choices: ["4x-5", "4x+11", "5x+11", "8x+7"],
        answer: "B",
        answerFormat: AnswerFormat.MULTIPLE_CHOICE,
        topicKey: "algebra.expressions",
        difficultyBand: "HARD",
        solutionSketch: "Distribute both expressions, watch the minus sign on -2(x - 4), then combine like terms."
      }
    ]
  }
] as const;

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

  for (const problemSet of hintTutorProblemSets) {
    await prisma.problemSet.upsert({
      where: { id: problemSet.id },
      update: {
        contest: problemSet.contest,
        year: problemSet.year,
        exam: problemSet.exam,
        title: problemSet.title,
        sourceUrl: HINT_TUTOR_SEED_SOURCE_URL,
        status: ProblemSetStatus.PUBLISHED
      },
      create: {
        id: problemSet.id,
        contest: problemSet.contest,
        year: problemSet.year,
        exam: problemSet.exam,
        title: problemSet.title,
        sourceUrl: HINT_TUTOR_SEED_SOURCE_URL,
        status: ProblemSetStatus.PUBLISHED
      }
    });

    for (const problem of problemSet.problems) {
      await prisma.problem.upsert({
        where: { id: problem.id },
        update: {
          problemSetId: problemSet.id,
          number: problem.number,
          statement: problem.statement,
          statementFormat: problem.statementFormat,
          choices: problem.choices,
          answer: problem.answer,
          answerFormat: problem.answerFormat,
          topicKey: problem.topicKey,
          difficultyBand: problem.difficultyBand,
          solutionSketch: problem.solutionSketch,
          curatedHintLevel1: problem.curatedHintLevel1 ?? null,
          curatedHintLevel2: problem.curatedHintLevel2 ?? null,
          curatedHintLevel3: problem.curatedHintLevel3 ?? null
        },
        create: {
          id: problem.id,
          problemSetId: problemSet.id,
          number: problem.number,
          statement: problem.statement,
          statementFormat: problem.statementFormat,
          choices: problem.choices,
          answer: problem.answer,
          answerFormat: problem.answerFormat,
          topicKey: problem.topicKey,
          difficultyBand: problem.difficultyBand,
          solutionSketch: problem.solutionSketch,
          curatedHintLevel1: problem.curatedHintLevel1 ?? null,
          curatedHintLevel2: problem.curatedHintLevel2 ?? null,
          curatedHintLevel3: problem.curatedHintLevel3 ?? null
        }
      });
    }
  }

  const seededProblemSets = await prisma.problemSet.findMany({
    where: {
      sourceUrl: HINT_TUTOR_SEED_SOURCE_URL
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
      `Seeded Hint Tutor problem set: ${problemSet.id} - ${problemSet.title} (${problemSet.contest} ${problemSet.year}${problemSet.exam ? ` ${problemSet.exam}` : ""}, ${problemSet._count.problems} problems)`
    );

    const problems = await prisma.problem.findMany({
      where: {
        problemSetId: problemSet.id
      },
      select: {
        id: true,
        number: true,
        answerFormat: true,
        topicKey: true,
        difficultyBand: true
      },
      orderBy: {
        number: "asc"
      }
    });

    for (const problem of problems) {
      console.log(
        `Problem ${problem.number}: ${problem.id} (${problem.answerFormat}, ${problem.topicKey}, ${problem.difficultyBand})`
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
