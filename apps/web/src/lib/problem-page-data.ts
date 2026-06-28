import { unstable_cache } from "next/cache";
import { prisma } from "@arcmath/db";
import {
  buildDiagnosticProblemSetWhere,
  buildRealExamProblemSetWhere,
  buildTopicPracticeProblemSetWhere
} from "@/lib/tutor-usable-sets";

const PROBLEM_ROUTE_CACHE_SECONDS = 300;

/**
 * Problem catalog and statements are shared across users and change only when
 * admins import or seed new content. Caching them removes the slowest
 * cross-region database reads from hot navigation paths while keeping updates
 * visible within a few minutes.
 */
export const getProblemCatalog = unstable_cache(
  async function getProblemCatalog() {
    const [rawDiagnosticSets, realSets, topicPracticeSets] = await Promise.all([
      prisma.problemSet.findMany({
        where: buildDiagnosticProblemSetWhere(),
        orderBy: [{ year: "desc" }, { title: "asc" }],
        select: {
          id: true,
          title: true,
          contest: true,
          category: true,
          diagnosticStage: true,
          submissionMode: true,
          _count: { select: { problems: true } }
        }
      }),
      prisma.problemSet.findMany({
        where: buildRealExamProblemSetWhere(),
        orderBy: [{ contest: "asc" }, { year: "desc" }, { exam: "asc" }],
        select: {
          id: true,
          title: true,
          contest: true,
          year: true,
          exam: true,
          category: true,
          submissionMode: true,
          _count: { select: { problems: true } }
        }
      }),
      prisma.problemSet.findMany({
        where: buildTopicPracticeProblemSetWhere(),
        orderBy: [{ contest: "asc" }, { year: "desc" }, { title: "asc" }],
        select: {
          id: true,
          title: true,
          contest: true,
          year: true,
          exam: true,
          category: true,
          submissionMode: true,
          _count: { select: { problems: true } }
        }
      })
    ]);

    // Hide sets that contain fewer than CATALOG_MIN_PROBLEMS problems.
    // Why: the proof-eval fixture catalog imports 6 individual IMO
    // problems as 6 distinct one-problem "sets" (IMO 1964, IMO 1979,
    // etc.) for grading-eval purposes. Without a min-size floor those
    // pollute the public IMO catalog with "5 sets × 1 problem each"
    // entries that aren't real practice papers. Same defence applies
    // to any other accidentally-thin import going forward.
    //
    // Real IMO/USAMO/AMC papers always have >= 6 problems, AMC papers
    // have 25, AIME has 15 — a >= 2 floor is generous.
    const CATALOG_MIN_PROBLEMS = 2;
    return {
      rawDiagnosticSets: rawDiagnosticSets.filter(
        (s) => s._count.problems >= CATALOG_MIN_PROBLEMS
      ),
      realSets: realSets.filter(
        (s) => s._count.problems >= CATALOG_MIN_PROBLEMS
      ),
      topicPracticeSets: topicPracticeSets.filter(
        (s) => s._count.problems >= CATALOG_MIN_PROBLEMS
      )
    };
  },
  // Cache key bumped to v2 to invalidate after the >= 2 problems
  // filter was introduced — without it the legacy cached payload
  // would still include the 6 single-problem IMO fixtures for up to
  // PROBLEM_ROUTE_CACHE_SECONDS.
  ["problem-catalog-v2"],
  { revalidate: PROBLEM_ROUTE_CACHE_SECONDS }
);

export const getPracticeSetPageData = unstable_cache(
  async function getPracticeSetPageData(problemSetId: string) {
    return prisma.problemSet.findUnique({
      where: {
        id: problemSetId
      },
      select: {
        id: true,
        title: true,
        contest: true,
        year: true,
        exam: true,
        category: true,
        diagnosticStage: true,
        submissionMode: true,
        tutorEnabled: true,
        sourceUrl: true,
        problems: {
          orderBy: {
            number: "asc"
          },
          select: {
            id: true,
            number: true,
            statement: true,
            statementFormat: true,
            answer: true,
            answerFormat: true,
            choices: true,
            diagramImageUrl: true,
            diagramImageAlt: true,
            choicesImageUrl: true,
            choicesImageAlt: true,
            sourceLabel: true,
            topicKey: true,
            difficultyBand: true
          }
        }
      }
    });
  },
  ["practice-set-page-v1"],
  { revalidate: PROBLEM_ROUTE_CACHE_SECONDS }
);

export const getProblemTutorPageData = unstable_cache(
  async function getProblemTutorPageData(problemId: string) {
    return prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        id: true,
        number: true,
        statement: true,
        statementFormat: true,
        choices: true,
        answerFormat: true,
        diagramImageUrl: true,
        diagramImageAlt: true,
        choicesImageUrl: true,
        choicesImageAlt: true,
        solutionSketch: true,
        topicKey: true,
        difficultyBand: true,
        problemSet: {
          select: {
            id: true,
            title: true,
            contest: true,
            year: true,
            exam: true,
            category: true,
            submissionMode: true,
            tutorEnabled: true,
            sourceUrl: true,
            problems: {
              orderBy: {
                number: "asc"
              },
              select: {
                id: true,
                number: true
              }
            }
          }
        }
      }
    });
  },
  ["problem-tutor-page-v1"],
  { revalidate: PROBLEM_ROUTE_CACHE_SECONDS }
);

export const getProblemAttemptIdentity = unstable_cache(
  async function getProblemAttemptIdentity(problemId: string) {
    return prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        id: true,
        problemSetId: true,
        answerFormat: true
      }
    });
  },
  ["problem-attempt-identity-v1"],
  { revalidate: PROBLEM_ROUTE_CACHE_SECONDS }
);
