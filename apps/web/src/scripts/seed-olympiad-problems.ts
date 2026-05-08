/**
 * Seeds olympiad proof-problem sets from the eval catalog.
 * Idempotent: reruns upsert problems + sets by (contest, year, exam) and (setId, number).
 */

import { prisma } from "@arcmath/db";
import { FIXTURES, groupByProblemSet } from "./fixtures/proof-eval/catalog";

async function main() {
  const groups = groupByProblemSet(FIXTURES);

  for (const group of groups.values()) {
    const existingSet = await prisma.problemSet.findFirst({
      where: {
        contest: group.contest,
        year: group.year,
        exam: group.exam
      },
      select: { id: true }
    });

    const commonData = {
      title: group.title,
      category: "TOPIC_PRACTICE" as const,
      submissionMode: "PER_PROBLEM" as const,
      tutorEnabled: true,
      status: "PUBLISHED" as const,
      sourceUrl: "local://seed/olympiad-eval"
    };

    const set = existingSet
      ? await prisma.problemSet.update({
          where: { id: existingSet.id },
          data: commonData
        })
      : await prisma.problemSet.create({
          data: {
            contest: group.contest,
            year: group.year,
            exam: group.exam,
            ...commonData
          }
        });

    console.log(`  set [${group.contest} ${group.year}${group.exam ? ` ${group.exam}` : ""}] id=${set.id}`);

    for (const p of group.problems) {
      // Preserve the verified-public-archive URL on the Problem row so
      // downstream surfaces (review UI, reports) can link students back
      // to the canonical source.
      const sourceUrl = p.source.kind === "verified-public-archive" ? (p.source.url ?? null) : null;
      const sourceLabel = p.source.citation ?? null;

      const problem = await prisma.problem.upsert({
        where: {
          problemSetId_number: {
            problemSetId: set.id,
            number: p.problemNumber
          }
        },
        update: {
          statement: p.statement,
          statementFormat: "MARKDOWN_LATEX",
          answerFormat: p.answerFormat,
          answer: p.answer ?? undefined,
          solutionSketch: p.solutionSketch,
          topicKey: p.topicKey,
          difficultyBand: p.difficultyBand,
          techniqueTags: p.techniqueTags,
          sourceUrl: sourceUrl ?? undefined,
          sourceLabel: sourceLabel ?? undefined
        },
        create: {
          problemSetId: set.id,
          number: p.problemNumber,
          statement: p.statement,
          statementFormat: "MARKDOWN_LATEX",
          answerFormat: p.answerFormat,
          answer: p.answer,
          solutionSketch: p.solutionSketch,
          topicKey: p.topicKey,
          difficultyBand: p.difficultyBand,
          techniqueTags: p.techniqueTags,
          sourceUrl,
          sourceLabel
        }
      });

      console.log(`    problem #${p.problemNumber} [${p.key}] id=${problem.id}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
