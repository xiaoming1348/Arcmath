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

    return { rawDiagnosticSets, realSets, topicPracticeSets };
  },
  ["problem-catalog-v1"],
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
