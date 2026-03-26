import { diagnosticProblemSets } from "../packages/db/prisma/diagnostic-problem-sets";

type SourceReference = {
  setTitle: string;
  setId: string;
  diagnosticProblemNumber: number;
  sourceKey: string;
  sourceLabel: string;
};

function isRealPre2015SourceKey(value: string): boolean {
  return /^(AMC8|AMC10|AMC12|AIME)-((19|20)\d{2})-(NA|A|B|I|II)-P\d+$/u.test(value);
}

function main() {
  const seen = new Map<string, SourceReference[]>();
  const nonCompliant: SourceReference[] = [];

  for (const set of diagnosticProblemSets) {
    for (const problem of set.problems) {
      const reference: SourceReference = {
        setTitle: set.title,
        setId: set.id,
        diagnosticProblemNumber: problem.number,
        sourceKey: problem.sourceKey,
        sourceLabel: problem.sourceLabel
      };

      const bucket = seen.get(problem.sourceKey) ?? [];
      bucket.push(reference);
      seen.set(problem.sourceKey, bucket);

      if (!isRealPre2015SourceKey(problem.sourceKey)) {
        nonCompliant.push(reference);
        continue;
      }

      const [, contest, yearString] =
        problem.sourceKey.match(/^(AMC8|AMC10|AMC12|AIME)-((19|20)\d{2})-(NA|A|B|I|II)-P\d+$/u) ?? [];
      const year = Number(yearString);

      if (!contest || Number.isNaN(year) || year >= 2015) {
        nonCompliant.push(reference);
      }
    }
  }

  const duplicates = Array.from(seen.entries())
    .filter(([, references]) => references.length > 1)
    .map(([sourceKey, references]) => ({
      sourceKey,
      references
    }));

  console.log(
    JSON.stringify(
      {
        totalDiagnosticSets: diagnosticProblemSets.length,
        totalDiagnosticProblems: diagnosticProblemSets.reduce((sum, set) => sum + set.problems.length, 0),
        duplicateSourceKeys: duplicates,
        nonCompliantSources: nonCompliant
      },
      null,
      2
    )
  );
}

main();
