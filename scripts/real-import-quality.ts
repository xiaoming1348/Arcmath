import path from "node:path";
import {
  DIFFICULTY_BANDS,
  importProblemSetSchema,
  type ImportProblemSetInput,
  type DifficultyBand
} from "../packages/shared/src/import-schema";

type ProblemInput = ImportProblemSetInput["problems"][number];
type ProblemOverride = Partial<ProblemInput>;

type QualitySummary = {
  setKey: string;
  problemCount: number;
  topicKeyCount: number;
  difficultyBandCount: number;
  solutionSketchCount: number;
  curatedHintCount: number;
  diagramCount: number;
  choicesImageCount: number;
  suspiciousChoiceProblems: number[];
  likelyFigureDependentProblems: number[];
};

const MANUAL_PROBLEM_OVERRIDES: Record<string, Record<number, ProblemOverride>> = {
  AMC8_2016: {
    6: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/7/3/9/7396694d92e8f9794065daafaf571852434d0b08.png",
      diagramImageAlt: "A bar graph of name lengths 3 through 7 with frequencies 7, 3, 1, 4, and 4."
    },
    5: {
      choices: ["7", "8", "9", "10", "11"]
    },
    22: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/a/0/7/a07a9e12af7228a9f783f34687384df0042b721e.png",
      diagramImageAlt:
        "A 3 by 4 rectangle with top side split into three unit segments and diagonals forming two shaded bat-wing regions."
    },
    24: {
      choices: ["11", "12", "13", "14", "15"]
    },
    25: {
      choices: ["32", "34", "35", "36", "38"]
    }
  },
  AMC8_2017: {
    2: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/7/b/7/7b7b4b1940b8afd1669156f092481dd6fc6f5a83.png",
      diagramImageAlt: "A pie chart with Colby 25%, Alicia 45%, and Brenda 30%."
    },
    10: {
      choices: [
        "The mean increases by 1 and the median does not change.",
        "The mean increases by 1 and the median increases by 1.",
        "The mean increases by 1 and the median increases by 5.",
        "The mean increases by 5 and the median increases by 1.",
        "The mean increases by 5 and the median increases by 5."
      ]
    },
    11: {
      choices: ["16", "25", "36", "49", "64"]
    },
    15: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/c/3/b/c3b81f82e730c8fce3fba2c0d1e893252c432d58.png",
      diagramImageAlt: "A cross-shaped 5 by 5 arrangement of the letters A, M, C and the numeral 8 for path counting."
    },
    16: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/5/3/e/53eb67d35ecca7ac6f68e8dff60b0eb5f3e4a602.png",
      diagramImageAlt: "A 3-4-5 right triangle with vertices A, B, and C."
    },
    18: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/b/e/3/be32bf473ea4532b8cc3eb844835e13b70bbfba9.png",
      diagramImageAlt: "A non-convex quadrilateral ABCD with vertices laid out as shown in the AMC 8 figure."
    },
    25: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/7/9/f/79f3ffcfa12364f64959c7aeadc809ba8d2aa6ac.png",
      diagramImageAlt: "Two segments from U to S and T, with arcs from T to R and S to R forming a symmetric curved figure."
    }
  },
  AMC8_2018: {
    4: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/f/4/d/f4d92072ddf7f5314e710dc9641eb84c3ea32879.png",
      diagramImageAlt: "A twelve-sided polygon drawn on 1 cm by 1 cm grid paper."
    },
    8: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/f/7/a/f7add6258fd09de75421fb0d08e39071b65b128c.png",
      diagramImageAlt: "A bar graph showing exercise days 1 through 7 and the number of students for each."
    },
    15: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/1/8/1/1814b98003d8f9d763c70aa6a56a765673f27d59.png",
      diagramImageAlt: "A large circle containing two equal smaller circles tangent inside it."
    },
    19: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/f/5/9/f59b1af815a0ba23baf250a48b1029ee9d1bd5e4.png",
      diagramImageAlt: "A four-level sign pyramid filled with plus and minus symbols."
    },
    20: {
      choices: ["25", "45", "50", "60", "75"]
    },
    22: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/2/a/d/2ada2235c8ed881dcd43e6b75f1e17738af45689.png",
      diagramImageAlt:
        "A square ABCD with diagonal AC, midpoint E on side CD, and segment BE intersecting AC at point F.",
      choices: ["150", "160", "180", "200", "225"]
    },
    23: {
      choices: ["12", "14", "18", "24", "36"]
    }
  },
  AMC10_2016_A: {
    10: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/0/e/8/0e824e15d0ac7359f7f694ceec6cd99e2f9f5f1e.png",
      diagramImageAlt:
        "A large rectangle contains three nested color regions: a central rectangle, plus top-bottom and left-right surrounding bands of two other colors."
    },
    11: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/2/2/a/22a043f13312f827cf511c1baa5459c01336d956.png",
      diagramImageAlt:
        "A shaded geometric region composed of simple polygons inside a larger outline, matching the 2016 AMC 10A Problem 11 figure.",
      choices: ["\\sqrt{35}", "\\sqrt{5}", "\\sqrt{14}", "6\\sqrt{12}", "\\sqrt{8}"]
    },
    12: {
      choices: ["p<\\frac{1}{8}", "p=\\frac{1}{8}", "\\frac{1}{8}<p<\\frac{1}{3}", "p=\\frac{1}{3}", "p>\\frac{1}{3}"]
    },
    15: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/c/c/a/cca6874b4c948fd14b20cc66d7c9ca8ca5280c03.png",
      diagramImageAlt:
        "Three circles with centers P, Q, and R tangent to the same horizontal line, with Q between P and R."
    }
  },
  AMC12_2016_A: {
    9: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/6/f/e/6fe0c7ae4ee1fd4c6e5cbf56da9bf7722133636f.png",
      diagramImageAlt:
        "A unit square containing five congruent shaded squares, one centered and four around it touching the midpoints of the centered square."
    },
    12: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/5/0/b/50b0f8f69ee6677a5d5e89b5d864839232ff3faa.png",
      diagramImageAlt:
        "Triangle ABC with A at the left base, B at the right base, and C at the top. Point D lies on side BC, point E lies on side AC, and segments AD and BE intersect at interior point F.",
      choices: ["3:2", "5:3", "2:1", "7:3", "5:2"]
    }
  },
  AMC12_2017_A: {
    16: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/4/7/0/470af758ec2f0cc263c4f39339447434ac16587c.png",
      diagramImageAlt:
        "A large semicircle with diameter JK contains two smaller tangent semicircles with centers A and B, and a circle centered at P tangent to all three."
    }
  },
  AMC12_2018_A: {
    8: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/7/6/b/76b160f06d88c43e72b74f7ea6dc16a95d78791b.png",
      diagramImageAlt:
        "A subdivided isosceles triangle ABC containing many smaller similar triangles, with points D and E marking a trapezoid DBCE."
    },
    11: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/b/a/a/baa198d34d1add6371626eaee0c40418aeeb7d0b.png",
      diagramImageAlt:
        "A 3-4-5 triangle labeled with vertices A and B, shown before folding so that point A lands on point B."
    }
  },
  AIME_2016_I: {
    3: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/4/a/4/4a43556bc292fa0365bdf07f1008d0fb2c903525.png",
      diagramImageAlt: "A labeled regular icosahedron drawn with one top vertex, one bottom vertex, and a horizontal ring of vertices."
    }
  },
  AIME_2018_I: {
    10: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/5/e/1/5e14e54dea77f9fbb819cf7f81efad0cfbce0990.png",
      diagramImageAlt: "Two concentric circles with five spokes and labeled points A through J on the inner and outer circles."
    }
  }
};

const MANUAL_TUTOR_METADATA: Record<string, Record<number, Partial<ProblemInput>>> = {
  AMC10_2013_A: {},
  AMC10_2016_A: {
    1: {
      solutionSketch: "Factor out 10! from the numerator, then divide by 9! so the factorials collapse to a short arithmetic expression."
    },
    2: {
      solutionSketch: "Rewrite every term as a power of 10, combine exponents on the left, and match the exponent to the right side."
    },
    3: {
      solutionSketch: "Each dollar difference comes from 25 cents per bagel, so divide the total cost gap by 0.25 to get the number of bagels Ben bought."
    },
    12: {
      solutionSketch: "Write the target probability in terms of p, compare it to the benchmark fractions 1/8 and 1/3, and solve the resulting inequality."
    }
  },
  AMC12_2016_A: {
    1: {
      solutionSketch: "Factor out 10! from the numerator and divide by 9! so the expression becomes a simple product."
    },
    2: {
      solutionSketch: "Convert 100 and 1000 into powers of 10, add exponents on the left side, and solve the linear equation in x."
    },
    9: {
      solutionSketch: "Express the area of the large square as the sum of the five congruent shaded squares plus the remaining white regions, then solve for one shaded square."
    },
    12: {
      solutionSketch: "Use the given area ratios to compare triangles that share the same altitude, then convert those area ratios into the requested segment ratio."
    }
  },
  AMC12_2017_A: {
    1: {
      solutionSketch: "Compare the cost efficiency of singles, 3-packs, and 12-packs, then assemble the cheapest combination that reaches the required total."
    },
    2: {
      solutionSketch: "Use 1/x + 1/y = (x + y)/xy and substitute the relation saying the sum is four times the product."
    },
    3: {
      solutionSketch: "Translate the promise into an implication, then identify its logically equivalent contrapositive among the answer choices."
    },
    16: {
      solutionSketch: "Model the three tangent circles by their centers and radii, use the semicircle geometry to express the common tangencies, and solve for the small radius."
    }
  },
  AMC12_2018_A: {
    1: {
      solutionSketch: "Start with the red and blue counts in a 100-ball urn, remove only blue balls, and solve for the point where red becomes exactly one half of the remaining total."
    },
    3: {
      solutionSketch: "Choose the three periods for the math courses, then arrange algebra, geometry, and number theory within those chosen slots."
    },
    8: {
      solutionSketch: "Use similarity among the repeated small triangles to express the trapezoid area as a fraction of the full triangle."
    },
    11: {
      solutionSketch: "Track how the fold identifies two points of the 3-4-5 triangle, then use the distance constraints after folding to determine the target length or area."
    }
  }
};

const FIGURE_REFERENCE_PATTERN = /\b(?:figure|diagram|pie chart|bar graph|shown below|figure shown|diagram below)\b/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function cleanChoiceMathSyntax(value: string): string {
  return value
    .replace(/^\\\s+/u, "")
    .replace(/\s*\\$/u, "")
    .replace(/^\\$/u, "")
    .replace(/\\%/gu, "%")
    .replace(/\\,/gu, " ")
    .replace(/\\!/gu, "")
    .replace(/\\left/gu, "")
    .replace(/\\right/gu, "")
    .replace(/sqrt\\frac\{([^{}]+)\}\{([^{}]+)\}/gu, "\\sqrt{\\frac{$1}{$2}}")
    .replace(/sqrt\(([^()]+)\)/gu, "\\sqrt{$1}")
    .replace(/\\\\sqrt\{/gu, "\\sqrt{")
    .replace(/\(([^()]+)\)\/\(([^()]+)\)/gu, "\\frac{$1}{$2}")
    .replace(/(\d)\s*\\sqrt\{/gu, "$1\\sqrt{")
    .replace(/\}\s+\\sqrt\{/gu, "}\\sqrt{")
    .replace(/\\text\{([^{}]+)\}/gu, "$1")
    .trim();
}

export function normalizeImportedChoice(value: string): string {
  return normalizeWhitespace(cleanChoiceMathSyntax(value));
}

export function normalizeImportedChoices(choices: unknown): string[] | undefined {
  if (!Array.isArray(choices)) {
    return undefined;
  }

  const normalized = choices
    .map((choice) => normalizeImportedChoice(typeof choice === "string" ? choice : String(choice ?? "")))
    .filter((choice) => choice.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function inferDifficultyBand(contest: string, number: number): DifficultyBand {
  if (contest === "AIME") {
    if (number <= 5) {
      return "EASY";
    }
    if (number <= 10) {
      return "MEDIUM";
    }
    return "HARD";
  }

  if (contest === "AMC8") {
    if (number <= 8) {
      return "EASY";
    }
    if (number <= 17) {
      return "MEDIUM";
    }
    return "HARD";
  }

  if (number <= 7) {
    return "EASY";
  }
  if (number <= 17) {
    return "MEDIUM";
  }
  return "HARD";
}

export function inferTopicKey(statement: string, answerFormat: ProblemInput["answerFormat"]): string | null {
  const text = statement.toLowerCase();

  if (/necessarily follows logically|must be true|cannot be true|always true|logic/u.test(text)) {
    return "logic.general";
  }

  if (/probability|expected value|die\b|dice\b|coin\b|coins\b|random/u.test(text)) {
    return "probability.general";
  }

  if (/how many|number of ways|ordered pairs|arrangements|permut|combination|committee|select|choose/u.test(text)) {
    return "counting.general";
  }

  if (/coordinate|slope|origin|x-axis|y-axis|line y=|line x=|point \(/u.test(text)) {
    return "geometry.coordinate_geometry";
  }

  if (/triangle|circle|semicircle|square|rectangle|parallelogram|polygon|pentagon|hexagon|octagon|sphere|cube|prism|perimeter|area|volume|angle|segment|diameter|radius/u.test(text)) {
    return "geometry.general";
  }

  if (/remainder|divisible|prime|factor|multiple|integer|digit|base-/u.test(text)) {
    return "number_theory.general";
  }

  if (/\blog\b|polynomial|equation|solve for|root|function|exponent|variable|expression/u.test(text)) {
    return answerFormat === "EXPRESSION" ? "algebra.expressions" : "algebra.general";
  }

  if (/average|mean|median|percent|ratio|dollar|cents|minutes|hours|speed|distance|mixture|price|cost/u.test(text)) {
    return "arithmetic.word_problems";
  }

  return null;
}

function getSetKey(payload: ImportProblemSetInput, explicitSetKey?: string): string {
  if (explicitSetKey) {
    return explicitSetKey;
  }

  const examPart = payload.problemSet.exam ? `_${payload.problemSet.exam}` : "";
  return `${payload.problemSet.contest}_${payload.problemSet.year}${examPart}`;
}

function mergeProblem(problem: ProblemInput, override?: ProblemOverride): ProblemInput {
  if (!override) {
    return problem;
  }

  return {
    ...problem,
    ...override
  };
}

export function applyRealImportQuality(payload: ImportProblemSetInput, explicitSetKey?: string): ImportProblemSetInput {
  const setKey = getSetKey(payload, explicitSetKey);
  const problemOverrides = MANUAL_PROBLEM_OVERRIDES[setKey] ?? {};
  const metadataOverrides = MANUAL_TUTOR_METADATA[setKey] ?? {};

  const nextPayload: ImportProblemSetInput = {
    ...payload,
    problems: payload.problems.map((rawProblem) => {
      let problem = mergeProblem(rawProblem, problemOverrides[rawProblem.number]);
      const statement = normalizeWhitespace(problem.statement ?? "");
      const normalizedChoices = normalizeImportedChoices(problem.choices);
      const inferredTopicKey = problem.topicKey ?? inferTopicKey(statement, problem.answerFormat);
      const difficultyBand = problem.difficultyBand ?? inferDifficultyBand(payload.problemSet.contest, problem.number);

      problem = {
        ...problem,
        statement,
        ...(normalizedChoices ? { choices: normalizedChoices } : {}),
        difficultyBand,
        ...(inferredTopicKey ? { topicKey: inferredTopicKey } : {}),
        ...metadataOverrides[problem.number]
      };

      return problem;
    })
  };

  const validated = importProblemSetSchema.parse(nextPayload);
  return validated;
}

function looksSuspiciousChoice(choice: string): boolean {
  return /^\\\s+/u.test(choice) || /\s\\$/u.test(choice) || /sqrt\(/u.test(choice) || /\\%/u.test(choice);
}

export function auditRealImportPayload(payload: ImportProblemSetInput, explicitSetKey?: string): QualitySummary {
  const setKey = getSetKey(payload, explicitSetKey);
  const suspiciousChoiceProblems: number[] = [];
  const likelyFigureDependentProblems: number[] = [];

  for (const problem of payload.problems) {
    if (Array.isArray(problem.choices) && problem.choices.some((choice) => looksSuspiciousChoice(String(choice)))) {
      suspiciousChoiceProblems.push(problem.number);
    }

    if (
      FIGURE_REFERENCE_PATTERN.test(problem.statement) &&
      !problem.diagramImageUrl &&
      !problem.choicesImageUrl
    ) {
      likelyFigureDependentProblems.push(problem.number);
    }
  }

  return {
    setKey,
    problemCount: payload.problems.length,
    topicKeyCount: payload.problems.filter((problem) => Boolean(problem.topicKey)).length,
    difficultyBandCount: payload.problems.filter((problem) => DIFFICULTY_BANDS.includes(problem.difficultyBand as DifficultyBand)).length,
    solutionSketchCount: payload.problems.filter((problem) => Boolean(problem.solutionSketch)).length,
    curatedHintCount: payload.problems.filter((problem) => Boolean(problem.curatedHintLevel1)).length,
    diagramCount: payload.problems.filter((problem) => Boolean(problem.diagramImageUrl)).length,
    choicesImageCount: payload.problems.filter((problem) => Boolean(problem.choicesImageUrl)).length,
    suspiciousChoiceProblems,
    likelyFigureDependentProblems
  };
}

export function getRealImportManualOverrides(setKey: string): Record<number, ProblemOverride> {
  return MANUAL_PROBLEM_OVERRIDES[setKey] ?? {};
}

export function getRealImportQualityFileSetKey(filePath: string): string {
  return path.basename(filePath, ".json");
}
