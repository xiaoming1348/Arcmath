import { AnswerFormat, Contest, ExamTrack, StatementFormat } from "@prisma/client";

export const DIAGNOSTIC_TEST_SEED_SOURCE_URL = "local://seed/diagnostic-test";

type DiagnosticSeedProblem = {
  id: string;
  number: number;
  sourceKey: string;
  statement: string;
  statementFormat: StatementFormat;
  choices: null;
  answer: string;
  answerFormat: AnswerFormat;
  examTrack: ExamTrack;
  sourceLabel: string;
  topicKey: string;
  techniqueTags: string[];
  diagnosticEligible: true;
  difficultyBand: "EASY" | "MEDIUM" | "HARD";
  solutionSketch: string;
};

type DiagnosticSeedProblemSet = {
  id: string;
  contest: Contest;
  year: number;
  exam: string | null;
  diagnosticStage: "EARLY" | "MID" | "LATE";
  title: string;
  problems: DiagnosticSeedProblem[];
};

type RealProblemSeedInput = {
  exam: ExamTrack;
  prefix: string;
  number: number;
  sourceKey: string;
  sourceLabel: string;
  difficultyBand: "EASY" | "MEDIUM" | "HARD";
  topicKey: string;
  techniqueTags: string[];
  statement: string;
  answer: string;
  solutionSketch: string;
};

function makeRealProblem({
  exam,
  prefix,
  number,
  sourceKey,
  sourceLabel,
  difficultyBand,
  topicKey,
  techniqueTags,
  statement,
  answer,
  solutionSketch
}: RealProblemSeedInput): DiagnosticSeedProblem {
  return {
    id: `${prefix}_p${number}`,
    number,
    sourceKey,
    statement,
    statementFormat: StatementFormat.MARKDOWN_LATEX,
    choices: null,
    answer,
    answerFormat: AnswerFormat.INTEGER,
    examTrack: exam,
    sourceLabel,
    topicKey,
    techniqueTags,
    diagnosticEligible: true,
    difficultyBand,
    solutionSketch
  };
}

export const diagnosticProblemSets: DiagnosticSeedProblemSet[] = [
  {
    id: "seed_diagnostic_amc8_v1",
    contest: Contest.AMC8,
    year: 2099,
    exam: null,
    diagnosticStage: "EARLY",
    title: "AMC 8 Diagnostic Test · Preparation Start",
    problems: [
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 1,
        sourceKey: "AMC8-2008-NA-P1",
        sourceLabel: "2008 AMC 8 · Problem 1",
        difficultyBand: "EASY",
        topicKey: "arithmetic.four_operations",
        techniqueTags: ["direct_computation"],
        statement:
          "Susan had $50$ dollars to spend at the carnival. She spent $12$ dollars on food and twice as much on rides. How many dollars did she have left to spend?",
        answer: "14",
        solutionSketch:
          "She spent 12 dollars on food and 24 dollars on rides, so she spent 36 dollars total. Subtract from 50."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 2,
        sourceKey: "AMC8-2008-NA-P2",
        sourceLabel: "2008 AMC 8 · Problem 2",
        difficultyBand: "EASY",
        topicKey: "number_theory.place_value",
        techniqueTags: ["pattern_finding", "symbol_mapping"],
        statement:
          "The ten-letter code $\\text{BEST OF LUCK}$ represents the ten digits $0-9$, in order. What 4-digit number is represented by the code word $\\text{CLUE}$?",
        answer: "8671",
        solutionSketch:
          "Assign digits in order: B=0, E=1, S=2, T=3, O=4, F=5, L=6, U=7, C=8, K=9. Then CLUE becomes 8671."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 3,
        sourceKey: "AMC8-2008-NA-P5",
        sourceLabel: "2008 AMC 8 · Problem 5",
        difficultyBand: "EASY",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["rate_reasoning"],
        statement:
          "Barney Schwinn notices that the odometer on his bicycle reads $1441$, a palindrome, because it reads the same forward and backward. After riding $4$ more hours that day and $6$ the next, he notices that the odometer shows another palindrome, $1661$. What was his average speed in miles per hour?",
        answer: "22",
        solutionSketch:
          "The odometer increased by 1661 - 1441 = 220 miles over 10 total hours. Divide 220 by 10."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 4,
        sourceKey: "AMC8-2008-NA-P7",
        sourceLabel: "2008 AMC 8 · Problem 7",
        difficultyBand: "EASY",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["proportional_reasoning", "equation_solving"],
        statement: "If $\\frac{3}{5}=\\frac{M}{45}=\\frac{60}{N}$, what is $M+N$?",
        answer: "127",
        solutionSketch:
          "From M/45 = 3/5, get M = 27. From 60/N = 3/5, cross-multiply to get N = 100. Add them."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 5,
        sourceKey: "AMC8-2008-NA-P9",
        sourceLabel: "2008 AMC 8 · Problem 9",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.percents",
        techniqueTags: ["percent_change", "working_backwards"],
        statement:
          "In $2005$ Tycoon Tammy invested $100$ dollars for two years. During the first year her investment suffered a $15\\%$ loss, but during the second year the remaining investment showed a $20\\%$ gain. Over the two-year period, what was the change in Tammy's investment?",
        answer: "2",
        solutionSketch:
          "After a 15% loss, 100 becomes 85. A 20% gain on 85 gives 102. The net change is +2 dollars."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 6,
        sourceKey: "AMC8-2008-NA-P10",
        sourceLabel: "2008 AMC 8 · Problem 10",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.averages",
        techniqueTags: ["weighted_average"],
        statement:
          "The average age of the $6$ people in Room A is $40$. The average age of the $4$ people in Room B is $25$. If the two groups are combined, what is the average age of all the people?",
        answer: "34",
        solutionSketch:
          "Room A contributes 6×40 = 240 total years and Room B contributes 4×25 = 100. Divide 340 by 10 people."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 7,
        sourceKey: "AMC8-2008-NA-P11",
        sourceLabel: "2008 AMC 8 · Problem 11",
        difficultyBand: "MEDIUM",
        topicKey: "counting.inclusion_exclusion",
        techniqueTags: ["inclusion_exclusion"],
        statement:
          "Each of the $39$ students in the eighth grade at Lincoln Middle School has one dog or one cat or both a dog and a cat. Twenty students have a dog and $26$ students have a cat. How many students have both a dog and a cat?",
        answer: "7",
        solutionSketch:
          "Use inclusion-exclusion: dog + cat - both = total. So 20 + 26 - both = 39."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 8,
        sourceKey: "AMC8-2008-NA-P13",
        sourceLabel: "2008 AMC 8 · Problem 13",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.systems",
        techniqueTags: ["equation_solving", "sum_difference"],
        statement:
          "Mr. Harman needs to know the combined weight in pounds of three boxes he wants to mail. However, the only available scale is not accurate for weights less than $100$ pounds or more than $150$ pounds. So the boxes are weighed in pairs in every possible way. The results are $122$, $125$ and $127$ pounds. What is the combined weight in pounds of the three boxes?",
        answer: "187",
        solutionSketch:
          "Adding the three pair sums counts each box twice. So 122 + 125 + 127 = 374 = 2(total), and the total is 187."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 9,
        sourceKey: "AMC8-2008-NA-P15",
        sourceLabel: "2008 AMC 8 · Problem 15",
        difficultyBand: "HARD",
        topicKey: "arithmetic.averages",
        techniqueTags: ["divisibility_reasoning", "working_backwards"],
        statement:
          "In Theresa's first $8$ basketball games, she scored $7, 4, 3, 6, 8, 3, 1$ and $5$ points. In her ninth game, she scored fewer than $10$ points and her points-per-game average for the nine games was an integer. Similarly in her tenth game, she scored fewer than $10$ points and her points-per-game average for the $10$ games was also an integer. What is the product of the number of points she scored in the ninth and tenth games?",
        answer: "40",
        solutionSketch:
          "Her first 8 games total 37. For 9 games, 37+x must be divisible by 9 with x<10, giving x=8. Then 45+y must be divisible by 10 with y<10, giving y=5."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 10,
        sourceKey: "AMC8-2008-NA-P17",
        sourceLabel: "2008 AMC 8 · Problem 17",
        difficultyBand: "HARD",
        topicKey: "geometry.area_and_perimeter",
        techniqueTags: ["extremal_reasoning", "area_volume_modeling"],
        statement:
          "Ms. Osborne asks each student in her class to draw a rectangle with integer side lengths and a perimeter of $50$ units. All of her students calculate the area of the rectangle they draw. What is the difference between the largest and smallest possible areas of the rectangles?",
        answer: "132",
        solutionSketch:
          "If sides are a and b, then a+b=25. The largest area comes from 12×13 = 156, and the smallest comes from 1×24 = 24."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 11,
        sourceKey: "AMC8-2009-NA-P1",
        sourceLabel: "2009 AMC 8 · Problem 1",
        difficultyBand: "EASY",
        topicKey: "arithmetic.word_problems",
        techniqueTags: ["working_backwards"],
        statement:
          "Bridget bought a bag of apples at the grocery store. She gave half of the apples to Ann. Then she gave Cassie $3$ apples, keeping $4$ apples for herself. How many apples did Bridget buy?",
        answer: "14",
        solutionSketch:
          "After giving half to Ann, Bridget had 3 + 4 = 7 apples left. That means 7 was half of the original amount, so double it."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 12,
        sourceKey: "AMC8-2009-NA-P2",
        sourceLabel: "2009 AMC 8 · Problem 2",
        difficultyBand: "EASY",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["proportional_reasoning"],
        statement:
          "On average, for every $4$ sports cars sold at the local dealership, $7$ sedans are sold. The dealership predicts that it will sell $28$ sports cars next month. How many sedans does it expect to sell?",
        answer: "49",
        solutionSketch:
          "Since 28 is 7 times 4, multiply the sedan count 7 by the same factor 7."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 13,
        sourceKey: "AMC8-2010-NA-P1",
        sourceLabel: "2010 AMC 8 · Problem 1",
        difficultyBand: "EASY",
        topicKey: "arithmetic.four_operations",
        techniqueTags: ["direct_computation"],
        statement:
          "At Euclid Middle School the mathematics teachers are Mrs. Germain, Mr. Newton, and Mrs. Young. There are $11$ students in Mrs. Germain's class, $8$ students in Mr. Newton's class, and $9$ students in Mrs. Young's class taking the AMC $8$ this year. How many mathematics students at Euclid Middle School are taking the contest?",
        answer: "28",
        solutionSketch:
          "Add the three class counts: 11 + 8 + 9."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 14,
        sourceKey: "AMC8-2010-NA-P12",
        sourceLabel: "2010 AMC 8 · Problem 12",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.percents",
        techniqueTags: ["percent_change", "algebra_setup"],
        statement:
          "Of the $500$ balls in a large bag, $80\\%$ are red and the rest are blue. How many of the red balls must be removed so that $75\\%$ of the remaining balls are red?",
        answer: "100",
        solutionSketch:
          "There are initially 400 red and 100 blue. If x red balls are removed, solve (400-x)/(500-x) = 3/4."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8",
        number: 15,
        sourceKey: "AMC8-2011-NA-P6",
        sourceLabel: "2011 AMC 8 · Problem 6",
        difficultyBand: "MEDIUM",
        topicKey: "counting.inclusion_exclusion",
        techniqueTags: ["inclusion_exclusion"],
        statement:
          "In a town of $351$ adults, every adult owns a car, motorcycle, or both. If $331$ adults own cars and $45$ adults own motorcycles, how many of the car owners do not own a motorcycle?",
        answer: "306",
        solutionSketch:
          "Use inclusion-exclusion to find the number who own both: 331 + 45 - 351 = 25. Subtract those 25 from the car owners."
      })
    ]
  },
  {
    id: "seed_diagnostic_amc8_v2",
    contest: Contest.AMC8,
    year: 2101,
    exam: null,
    diagnosticStage: "MID",
    title: "AMC 8 Diagnostic Test · Preparation Middle",
    problems: [
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 1,
        sourceKey: "AMC8-2011-NA-P1",
        sourceLabel: "2011 AMC 8 · Problem 1",
        difficultyBand: "EASY",
        topicKey: "arithmetic.money",
        techniqueTags: ["unit_conversion"],
        statement:
          "Margie bought $3$ apples at a cost of $50$ cents per apple. She paid with a 5-dollar bill. How much change did Margie receive, in cents?",
        answer: "350",
        solutionSketch:
          "Three apples cost 150 cents. A 5-dollar bill is 500 cents, so subtract 150 from 500."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 2,
        sourceKey: "AMC8-2012-NA-P1",
        sourceLabel: "2012 AMC 8 · Problem 1",
        difficultyBand: "EASY",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["proportional_reasoning"],
        statement:
          "Rachelle uses $3$ pounds of meat to make $8$ hamburgers for her family. How many pounds of meat does she need to make $24$ hamburgers for a neighbourhood picnic?",
        answer: "9",
        solutionSketch:
          "Twenty-four hamburgers is three times as many as 8, so multiply 3 pounds by 3."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 3,
        sourceKey: "AMC8-2012-NA-P6",
        sourceLabel: "2012 AMC 8 · Problem 6",
        difficultyBand: "EASY",
        topicKey: "geometry.area_and_perimeter",
        techniqueTags: ["area_volume_modeling"],
        statement:
          "A rectangular photograph is placed in a frame that forms a border two inches wide on all sides of the photograph. The photograph measures $8$ inches high and $10$ inches wide. What is the area of the border, in square inches?",
        answer: "88",
        solutionSketch:
          "The outer rectangle measures 12 by 14, so its area is 168. Subtract the photograph area 8×10 = 80."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 4,
        sourceKey: "AMC8-2012-NA-P10",
        sourceLabel: "2012 AMC 8 · Problem 10",
        difficultyBand: "EASY",
        topicKey: "counting.permutations",
        techniqueTags: ["counting_principle"],
        statement:
          "How many $4$-digit numbers greater than $1000$ are there that use the four digits of 2012?",
        answer: "9",
        solutionSketch:
          "Count distinct permutations of digits 2,0,1,2. There are 4!/2! = 12 total, but 3 start with 0, leaving 9 valid 4-digit numbers."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 5,
        sourceKey: "AMC8-2014-NA-P3",
        sourceLabel: "2014 AMC 8 · Problem 3",
        difficultyBand: "EASY",
        topicKey: "arithmetic.averages",
        techniqueTags: ["weighted_average"],
        statement:
          "Isabella had a week to read a book for a school assignment. She read an average of $36$ pages per day for the first three days and an average of $44$ pages per day for the next three days. She then finished the book by reading $10$ pages on the last day. How many pages were in the book?",
        answer: "250",
        solutionSketch:
          "Multiply the averages by 3 days each and add the final 10 pages: 3×36 + 3×44 + 10."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 6,
        sourceKey: "AMC8-2009-NA-P5",
        sourceLabel: "2009 AMC 8 · Problem 5",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.sequences",
        techniqueTags: ["recursion", "pattern_finding"],
        statement:
          "A sequence of numbers starts with $1$, $2$, and $3$. The fourth number of the sequence is the sum of the previous three numbers in the sequence: $1+2+3=6$. In the same way, every number after the fourth is the sum of the previous three numbers. What is the eighth number in the sequence?",
        answer: "68",
        solutionSketch:
          "Build the sequence: 1, 2, 3, 6, 11, 20, 37, 68."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 7,
        sourceKey: "AMC8-2009-NA-P8",
        sourceLabel: "2009 AMC 8 · Problem 8",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.percents",
        techniqueTags: ["percent_change"],
        statement:
          "The length of a rectangle is increased by $10\\%$ and the width is decreased by $10\\%$. What percent of the old area is the new area?",
        answer: "99",
        solutionSketch:
          "The new area factor is 1.10 × 0.90 = 0.99, so the new area is 99% of the old area."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 8,
        sourceKey: "AMC8-2009-NA-P11",
        sourceLabel: "2009 AMC 8 · Problem 11",
        difficultyBand: "MEDIUM",
        topicKey: "number_theory.divisibility",
        techniqueTags: ["divisibility_reasoning", "factorization"],
        statement:
          "The Amaco Middle School bookstore sells pencils costing a whole number of cents. Some seventh graders each bought a pencil, paying a total of $1.43$ dollars. Some of the $30$ sixth graders each bought a pencil, and they paid a total of $1.95$ dollars. How many more sixth graders than seventh graders bought a pencil?",
        answer: "4",
        solutionSketch:
          "The pencil price must divide 143 and 195, so it is 13 cents. Then 195/13 = 15 sixth graders and 143/13 = 11 seventh graders."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 9,
        sourceKey: "AMC8-2010-NA-P8",
        sourceLabel: "2010 AMC 8 · Problem 8",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["relative_rate"],
        statement:
          "As Emily is riding her bicycle on a long straight road, she spots Emerson skating in the same direction $\\frac{1}{2}$ mile in front of her. After she passes him, she can see him in her rear mirror until he is $\\frac{1}{2}$ mile behind her. Emily rides at a constant rate of $12$ miles per hour, and Emerson skates at a constant rate of $8$ miles per hour. For how many minutes can Emily see Emerson?",
        answer: "15",
        solutionSketch:
          "The distance changes from 1/2 mile ahead to 1/2 mile behind, a total of 1 mile. Their relative speed is 12-8 = 4 mph."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 10,
        sourceKey: "AMC8-2010-NA-P11",
        sourceLabel: "2010 AMC 8 · Problem 11",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.ratios",
        techniqueTags: ["ratio_reasoning", "equation_solving"],
        statement:
          "The top of one tree is $16$ feet higher than the top of another tree. The heights of the two trees are in the ratio $3:4$. In feet, how tall is the taller tree?",
        answer: "64",
        solutionSketch:
          "If the trees are 3k and 4k tall, then their difference is k = 16. The taller tree is 4k."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 11,
        sourceKey: "AMC8-2012-NA-P11",
        sourceLabel: "2012 AMC 8 · Problem 11",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.statistics",
        techniqueTags: ["mean_median_mode"],
        statement:
          "The mean, median, and unique mode of the positive integers $3, 4, 5, 6, 6, 7,$ and $x$ are all equal. What is the value of $x$ ?",
        answer: "11",
        solutionSketch:
          "Since the unique mode is 6 and the median is also 6, the mean must be 6. So (31 + x)/7 = 6."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 12,
        sourceKey: "AMC8-2009-NA-P17",
        sourceLabel: "2009 AMC 8 · Problem 17",
        difficultyBand: "HARD",
        topicKey: "number_theory.prime_factorization",
        techniqueTags: ["prime_factorization", "exponent_matching"],
        statement:
          "The positive integers $x$ and $y$ are the two smallest positive integers for which the product of $360$ and $x$ is a square and the product of $360$ and $y$ is a cube. What is the sum of $x$ and $y$ ?",
        answer: "85",
        solutionSketch:
          "Factor 360 = 2^3·3^2·5. Add the smallest factors to make exponents all even for x and all multiples of 3 for y."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 13,
        sourceKey: "AMC8-2009-NA-P22",
        sourceLabel: "2009 AMC 8 · Problem 22",
        difficultyBand: "HARD",
        topicKey: "counting.place_value",
        techniqueTags: ["casework", "counting_principle"],
        statement: "How many whole numbers between $1$ and $1000$ do not contain the digit $1$ ?",
        answer: "728",
        solutionSketch:
          "For 000 through 999, each digit has 9 choices if 1 is forbidden. That gives 9^3 = 729 strings, including 000, so subtract 1."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 14,
        sourceKey: "AMC8-2010-NA-P21",
        sourceLabel: "2010 AMC 8 · Problem 21",
        difficultyBand: "HARD",
        topicKey: "arithmetic.word_problems",
        techniqueTags: ["working_backwards", "fractional_reasoning"],
        statement:
          "Hui is an avid reader. She bought a copy of the best seller Math is Beautiful. On the first day, Hui read $\\frac{1}{5}$ of the pages plus $12$ more, and on the second day she read $\\frac{1}{4}$ of the remaining pages plus $15$ pages. On the third day she read $\\frac{1}{3}$ of the remaining pages plus $18$ pages. She then realized that there were only $62$ pages left to read, which she read the next day. How many pages are in this book?",
        answer: "240",
        solutionSketch:
          "Work backward from 62 pages left after day 3, undoing each day's fraction-and-extra-page reading step."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_mid",
        number: 15,
        sourceKey: "AMC8-2010-NA-P25",
        sourceLabel: "2010 AMC 8 · Problem 25",
        difficultyBand: "HARD",
        topicKey: "counting.recursion",
        techniqueTags: ["recursion", "pattern_finding"],
        statement:
          "Everyday at school, Jo climbs a flight of $6$ stairs. Jo can take the stairs $1$, $2$, or $3$ at a time. In how many ways can Jo climb the stairs?",
        answer: "24",
        solutionSketch:
          "Let f(n) be the number of ways to climb n stairs. Then f(n)=f(n-1)+f(n-2)+f(n-3) with starting values f(1)=1, f(2)=2, f(3)=4."
      })
    ]
  },
  {
    id: "seed_diagnostic_amc8_v3",
    contest: Contest.AMC8,
    year: 2102,
    exam: null,
    diagnosticStage: "LATE",
    title: "AMC 8 Diagnostic Test · Preparation Late",
    problems: [
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 1,
        sourceKey: "AMC8-2013-NA-P1",
        sourceLabel: "2013 AMC 8 · Problem 1",
        difficultyBand: "EASY",
        topicKey: "number_theory.divisibility",
        techniqueTags: ["modular_reasoning"],
        statement:
          "Danica wants to arrange her model cars in rows with exactly $6$ cars in each row. She now has $23$ model cars. What is the smallest number of additional cars she must buy in order to be able to arrange all her cars this way?",
        answer: "1",
        solutionSketch:
          "The next multiple of 6 after 23 is 24, so she needs 1 more car."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 2,
        sourceKey: "AMC8-2013-NA-P2",
        sourceLabel: "2013 AMC 8 · Problem 2",
        difficultyBand: "EASY",
        topicKey: "arithmetic.percents",
        techniqueTags: ["percent_change", "unit_rate"],
        statement:
          "A sign at the fish market says, \"50\\% off, today only: half-pound packages for just \\$3 per package.\" What is the regular price for a full pound of fish, in dollars?",
        answer: "12",
        solutionSketch:
          "The sale price of a half-pound is 3 dollars, so the regular half-pound price is 6 dollars. Double that for a full pound."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 3,
        sourceKey: "AMC8-2014-NA-P8",
        sourceLabel: "2014 AMC 8 · Problem 8",
        difficultyBand: "EASY",
        topicKey: "number_theory.divisibility",
        techniqueTags: ["divisibility_reasoning"],
        statement:
          "Eleven members of the Middle School Math Club each paid the same amount for a guest speaker to talk about problem solving at their math club meeting. They paid their guest speaker $\\$1A2$. What is the missing digit $A$ of this 3-digit number?",
        answer: "3",
        solutionSketch:
          "The total amount 1A2 must be divisible by 11. Use the divisibility test for 11: 1 - A + 2 must be a multiple of 11."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 4,
        sourceKey: "AMC8-2012-NA-P7",
        sourceLabel: "2012 AMC 8 · Problem 7",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.averages",
        techniqueTags: ["working_backwards", "optimization"],
        statement:
          "Isabella must take four 100-point tests in her math class. Her goal is to achieve an average grade of 95 on the tests. Her first two test scores were 97 and 91. After seeing her score on the third test, she realized she can still reach her goal. What is the lowest possible score she could have made on the third test?",
        answer: "92",
        solutionSketch:
          "A 95 average over 4 tests means 380 total points. After scoring 97 and 91, the last two tests must total 192. Since one test can be at most 100, the third must be at least 92."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 5,
        sourceKey: "AMC8-2012-NA-P9",
        sourceLabel: "2012 AMC 8 · Problem 9",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.systems",
        techniqueTags: ["equation_solving"],
        statement:
          "The Fort Worth Zoo has a number of two-legged birds and a number of four-legged mammals. On one visit to the zoo, Margie counted $200$ heads and $522$ legs. How many of the animals that Margie counted were two-legged birds?",
        answer: "139",
        solutionSketch:
          "Let b be birds and m be mammals. Then b + m = 200 and 2b + 4m = 522. Solve the system."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 6,
        sourceKey: "AMC8-2012-NA-P14",
        sourceLabel: "2012 AMC 8 · Problem 14",
        difficultyBand: "MEDIUM",
        topicKey: "counting.combinations",
        techniqueTags: ["combination_counting"],
        statement:
          "In the BIG N, a middle school football conference, each team plays every other team exactly once. If a total of 21 conference games were played during the 2012 season, how many teams were members of the BIG N conference?",
        answer: "7",
        solutionSketch:
          "If there are n teams, the number of games is n(n-1)/2. Solve n(n-1)/2 = 21."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 7,
        sourceKey: "AMC8-2012-NA-P15",
        sourceLabel: "2012 AMC 8 · Problem 15",
        difficultyBand: "MEDIUM",
        topicKey: "number_theory.modular_arithmetic",
        techniqueTags: ["lcm_reasoning"],
        statement:
          "The smallest number greater than $2$ that leaves a remainder of $2$ when divided by $3$, $4$, $5$, or $6$ lies between what numbers? Give the number itself.",
        answer: "62",
        solutionSketch:
          "A number leaving remainder 2 on division by 3,4,5,6 means n-2 is a common multiple of all four numbers. Use the least common multiple."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 8,
        sourceKey: "AMC8-2012-NA-P19",
        sourceLabel: "2012 AMC 8 · Problem 19",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.systems",
        techniqueTags: ["equation_solving", "sum_difference"],
        statement:
          "In a jar of red, green, and blue marbles, all but $6$ are red marbles, all but $8$ are green, and all but $4$ are blue. How many marbles are in the jar?",
        answer: "9",
        solutionSketch:
          "Let r, g, b be the numbers of each color. Then g+b = 6, r+b = 8, and r+g = 4. Add the three equations."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 9,
        sourceKey: "AMC8-2014-NA-P5",
        sourceLabel: "2014 AMC 8 · Problem 5",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["rate_reasoning"],
        statement:
          "Margie's car can go $32$ miles on a gallon of gas, and gas currently costs \\$4 per gallon. How many miles can Margie drive on $\\$20$ worth of gas?",
        answer: "160",
        solutionSketch:
          "Twenty dollars buys 5 gallons, and each gallon gives 32 miles."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 10,
        sourceKey: "AMC8-2013-NA-P3",
        sourceLabel: "2013 AMC 8 · Problem 3",
        difficultyBand: "HARD",
        topicKey: "algebra.series",
        techniqueTags: ["pattern_finding", "pairing"],
        statement: "What is the value of $4 \\cdot (-1+2-3+4-5+6-7+\\cdots+1000)$ ?",
        answer: "2000",
        solutionSketch:
          "Group the alternating sum into pairs: (-1+2), (-3+4), ..., (-999+1000). Each pair equals 1, and there are 500 pairs."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 11,
        sourceKey: "AMC8-2013-NA-P4",
        sourceLabel: "2013 AMC 8 · Problem 4",
        difficultyBand: "HARD",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["fraction_modeling", "equation_solving"],
        statement:
          "Eight friends ate at a restaurant and agreed to share the bill equally. Because Judi forgot her money, each of her seven friends paid an extra \\$2.50 to cover her portion of the total bill. What was the total bill, in dollars?",
        answer: "140",
        solutionSketch:
          "Judi's one-eighth share was covered by 7 friends paying 2.50 extra each, so Judi's share was 17.50. Multiply by 8."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 12,
        sourceKey: "AMC8-2013-NA-P10",
        sourceLabel: "2013 AMC 8 · Problem 10",
        difficultyBand: "HARD",
        topicKey: "number_theory.gcd_lcm",
        techniqueTags: ["prime_factorization"],
        statement:
          "What is the ratio of the least common multiple of $180$ and $594$ to the greatest common factor of $180$ and $594$ ?",
        answer: "330",
        solutionSketch:
          "Find gcd(180,594)=18. Then lcm = 180×594/18 = 5940. Divide 5940 by 18."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 13,
        sourceKey: "AMC8-2013-NA-P15",
        sourceLabel: "2013 AMC 8 · Problem 15",
        difficultyBand: "HARD",
        topicKey: "algebra.exponents",
        techniqueTags: ["equation_solving", "substitution"],
        statement:
          "If $3^p + 3^4 = 90$, $2^r + 44 = 76$, and $5^3 + 6^s = 1421$, what is the product of $p$, $r$, and $s$ ?",
        answer: "40",
        solutionSketch:
          "Solve the three equations separately: p from 3^p = 9, r from 2^r = 32, and s from 6^s = 1296."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 14,
        sourceKey: "AMC8-2013-NA-P16",
        sourceLabel: "2013 AMC 8 · Problem 16",
        difficultyBand: "HARD",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["ratio_reasoning", "lcm_reasoning"],
        statement:
          "A number of students from Fibonacci Middle School are taking part in a community service project. The ratio of $8^\\text{th}$-graders to $6^\\text{th}$-graders is $5:3$, and the ratio of $8^\\text{th}$-graders to $7^\\text{th}$-graders is $8:5$. What is the smallest number of students that could be participating in the project?",
        answer: "89",
        solutionSketch:
          "Choose the number of 8th-graders as the least common multiple compatible with both ratios, then derive the 6th- and 7th-grade counts and add."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC8,
        prefix: "diag_amc8_late",
        number: 15,
        sourceKey: "AMC8-2013-NA-P18",
        sourceLabel: "2013 AMC 8 · Problem 18",
        difficultyBand: "HARD",
        topicKey: "geometry.volume",
        techniqueTags: ["solid_geometry", "subtraction"],
        statement:
          "Isabella uses one-foot cubical blocks to build a rectangular fort that is $12$ feet long, $10$ feet wide, and $5$ feet high. The floor and the four walls are all one foot thick. How many blocks does the fort contain?",
        answer: "280",
        solutionSketch:
          "Compute the outer rectangular prism volume and subtract the empty interior volume."
      })
    ]
  },
  {
    id: "seed_diagnostic_amc10_v1",
    contest: Contest.AMC10,
    year: 2099,
    exam: "A",
    diagnosticStage: "EARLY",
    title: "AMC 10 Diagnostic Test · Preparation Start",
    problems: [
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 1,
        sourceKey: "AMC10-2009-A-P1",
        sourceLabel: "2009 AMC 10A · Problem 1",
        difficultyBand: "EASY",
        topicKey: "arithmetic.estimation",
        techniqueTags: ["direct_computation", "ceil_floor_reasoning"],
        statement:
          "One can holds $12$ ounces of soda. What is the minimum number of cans needed to provide a gallon ($128$ ounces) of soda?",
        answer: "11",
        solutionSketch:
          "Ten cans give 120 ounces, which is not enough. Eleven cans give 132 ounces, which reaches at least 128."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 2,
        sourceKey: "AMC10-2009-A-P5",
        sourceLabel: "2009 AMC 10A · Problem 5",
        difficultyBand: "EASY",
        topicKey: "number_theory.digit_patterns",
        techniqueTags: ["pattern_finding"],
        statement: "What is the sum of the digits of the square of $\\text{111111111}$?",
        answer: "81",
        solutionSketch:
          "The square is 12345678987654321. Its digits add to 45 + 36 = 81."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 3,
        sourceKey: "AMC10-2010-A-P3",
        sourceLabel: "2010 AMC 10A · Problem 3",
        difficultyBand: "EASY",
        topicKey: "algebra.linear_equations",
        techniqueTags: ["equation_solving"],
        statement:
          "Tyrone had $97$ marbles and Eric had $11$ marbles. Tyrone then gave some of his marbles to Eric so that Tyrone ended with twice as many marbles as Eric. How many marbles did Tyrone give to Eric?",
        answer: "25",
        solutionSketch:
          "If Tyrone gives x marbles, the new counts are 97-x and 11+x. Solve 97-x = 2(11+x)."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 4,
        sourceKey: "AMC10-2009-A-P8",
        sourceLabel: "2009 AMC 10A · Problem 8",
        difficultyBand: "EASY",
        topicKey: "arithmetic.percents",
        techniqueTags: ["percent_change", "price_modeling"],
        statement:
          "Three generations of the Wen family are going to the movies, two from each generation. The two members of the youngest generation receive a $50\\%$ discount as children. The two members of the oldest generation receive a $25\\%$ discount as senior citizens. The two members of the middle generation receive no discount. Grandfather Wen, whose senior ticket costs $\\$6.00$, is paying for everyone. How many dollars must he pay?",
        answer: "28",
        solutionSketch:
          "A 25% discount makes the senior ticket 3/4 of full price, so the regular ticket is 8 dollars. Then senior tickets cost 6, child tickets cost 4, and the total is 2·6 + 2·8 + 2·4."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 5,
        sourceKey: "AMC10-2009-A-P9",
        sourceLabel: "2009 AMC 10A · Problem 9",
        difficultyBand: "MEDIUM",
        topicKey: "number_theory.divisibility",
        techniqueTags: ["prime_factorization", "pattern_finding"],
        statement:
          "Positive integers $a$, $b$, and $2009$, with $a<b<2009$, form a geometric sequence with an integer ratio. What is $a$?",
        answer: "41",
        solutionSketch:
          "Write the sequence as a, ar, ar^2 = 2009. Factor 2009 = 7^2 · 41, so the only integer square ratio available is r = 7, giving a = 41."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 6,
        sourceKey: "AMC10-2009-A-P11",
        sourceLabel: "2009 AMC 10A · Problem 11",
        difficultyBand: "MEDIUM",
        topicKey: "geometry.volume",
        techniqueTags: ["algebra_setup", "equation_solving"],
        statement:
          "One dimension of a cube is increased by $1$, another is decreased by $1$, and the third is left unchanged. The volume of the new rectangular solid is $5$ less than that of the cube. What was the volume of the cube?",
        answer: "125",
        solutionSketch:
          "If the cube side is s, the new volume is (s+1)(s-1)s = s^3 - s. Since this is 5 less than s^3, solve s = 5, then cube it."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 7,
        sourceKey: "AMC10-2009-A-P12",
        sourceLabel: "2009 AMC 10A · Problem 12",
        difficultyBand: "MEDIUM",
        topicKey: "geometry.quadrilaterals",
        techniqueTags: ["triangle_inequality", "case_elimination"],
        statement:
          "In quadrilateral $ABCD$, $AB = 5$, $BC = 17$, $CD = 5$, $DA = 9$, and $BD$ is an integer. What is $BD$?",
        answer: "13",
        solutionSketch:
          "Use triangle inequalities in triangles ABD and CBD. The first gives 4 < BD < 14, and the second gives 12 < BD < 22, so the only integer choice is 13."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 8,
        sourceKey: "AMC10-2010-A-P11",
        sourceLabel: "2010 AMC 10A · Problem 11",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.inequalities",
        techniqueTags: ["algebra_setup", "interval_reasoning"],
        statement:
          "The length of the interval of solutions of the inequality $a \\le 2x + 3 \\le b$ is $10$. What is $b - a$?",
        answer: "20",
        solutionSketch:
          "Solving for x gives (a-3)/2 ≤ x ≤ (b-3)/2. The interval length is ((b-3)/2) - ((a-3)/2) = (b-a)/2."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 9,
        sourceKey: "AMC10-2009-A-P18",
        sourceLabel: "2009 AMC 10A · Problem 18",
        difficultyBand: "HARD",
        topicKey: "counting.probability",
        techniqueTags: ["conditional_reasoning", "percent_modeling"],
        statement:
          "At Jefferson Summer Camp, $60\\%$ of the children play soccer, $30\\%$ of the children swim, and $40\\%$ of the soccer players swim. To the nearest whole percent, what percent of the non-swimmers play soccer?",
        answer: "51",
        solutionSketch:
          "40% of the soccer players means 0.4·60% = 24% of all children both swim and play soccer. So 36% of all children are soccer-playing non-swimmers, out of 70% total non-swimmers."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 10,
        sourceKey: "AMC10-2009-A-P20",
        sourceLabel: "2009 AMC 10A · Problem 20",
        difficultyBand: "HARD",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["rate_reasoning", "piecewise_modeling"],
        statement:
          "Andrea and Lauren are $20$ kilometers apart. They bike toward one another with Andrea traveling three times as fast as Lauren, and the distance between them decreasing at a rate of $1$ kilometer per minute. After $5$ minutes, Andrea stops biking because of a flat tire and waits for Lauren. After how many minutes from the time they started to bike does Lauren reach Andrea?",
        answer: "65",
        solutionSketch:
          "If the combined closing rate is 1 km/min with a 3:1 split, Andrea rides 3/4 km/min and Lauren rides 1/4 km/min. After 5 minutes the remaining distance is 15 km, which Lauren covers alone at 1/4 km/min."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 11,
        sourceKey: "AMC10-2011-A-P1",
        sourceLabel: "2011 AMC 10A · Problem 1",
        difficultyBand: "EASY",
        topicKey: "arithmetic.money",
        techniqueTags: ["unit_conversion", "direct_computation"],
        statement:
          "A cell phone plan costs $20$ dollars each month, plus $5$ cents per text message sent, plus $10$ cents for each minute used over $30$ hours. In January Michelle sent $100$ text messages and talked for $30.5$ hours. How much did she have to pay?",
        answer: "28",
        solutionSketch:
          "The base cost is 20 dollars. One hundred texts add 5 dollars, and 0.5 hour over 30 hours is 30 minutes, adding 3 dollars more."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 12,
        sourceKey: "AMC10-2011-A-P2",
        sourceLabel: "2011 AMC 10A · Problem 2",
        difficultyBand: "EASY",
        topicKey: "arithmetic.estimation",
        techniqueTags: ["ceil_floor_reasoning"],
        statement:
          "A small bottle of shampoo can hold $35$ milliliters of shampoo, whereas a large bottle can hold $500$ milliliters of shampoo. Jasmine wants to buy the minimum number of small bottles necessary to completely fill a large bottle. How many bottles must she buy?",
        answer: "15",
        solutionSketch:
          "Compute 500/35 and round up, since 14 bottles hold only 490 milliliters."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 13,
        sourceKey: "AMC10-2011-A-P6",
        sourceLabel: "2011 AMC 10A · Problem 6",
        difficultyBand: "MEDIUM",
        topicKey: "counting.sets",
        techniqueTags: ["inclusion_bounds"],
        statement:
          "Set $A$ has $20$ elements, and set $B$ has $15$ elements. What is the smallest possible number of elements in $A \\cup B$ ?",
        answer: "20",
        solutionSketch:
          "To minimize the union, make the smaller set entirely contained in the larger set."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 14,
        sourceKey: "AMC10-2012-A-P1",
        sourceLabel: "2012 AMC 10A · Problem 1",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["work_rate"],
        statement:
          "Cagney can frost a cupcake every $20$ seconds and Lacey can frost a cupcake every $30$ seconds. Working together, how many cupcakes can they frost in $5$ minutes?",
        answer: "25",
        solutionSketch:
          "Add the rates: one does 1/20 cupcake per second and the other 1/30, so together they frost 1/12 cupcake per second. Multiply by 300 seconds."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10",
        number: 15,
        sourceKey: "AMC10-2012-A-P3",
        sourceLabel: "2012 AMC 10A · Problem 3",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.absolute_value",
        techniqueTags: ["number_line_reasoning"],
        statement:
          "A bug crawls along a number line, starting at $-2$. It crawls to $-6$, then turns around and crawls to $5$. How many units does the bug crawl altogether?",
        answer: "15",
        solutionSketch:
          "The bug first crawls 4 units from -2 to -6, then 11 units from -6 to 5."
      })
    ]
  },
  {
    id: "seed_diagnostic_amc10_v2",
    contest: Contest.AMC10,
    year: 2101,
    exam: "A",
    diagnosticStage: "MID",
    title: "AMC 10 Diagnostic Test · Preparation Middle",
    problems: [
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 1,
        sourceKey: "AMC10-2011-A-P8",
        sourceLabel: "2011 AMC 10A · Problem 8",
        difficultyBand: "EASY",
        topicKey: "arithmetic.percents",
        techniqueTags: ["part_whole_reasoning"],
        statement:
          "Last summer 30% of the birds living on Town Lake were geese, 25% were swans, 10% were herons, and 35% were ducks. What percent of the birds that were not swans were geese?",
        answer: "40",
        solutionSketch:
          "Exclude the swans first, leaving 75% of the birds. Then compute what fraction 30% is of that 75%."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 2,
        sourceKey: "AMC10-2011-A-P10",
        sourceLabel: "2011 AMC 10A · Problem 10",
        difficultyBand: "EASY",
        topicKey: "number_theory.divisibility",
        techniqueTags: ["factorization", "casework"],
        statement:
          "A majority of the $30$ students in Ms. Demeanor's class bought pencils at the school bookstore. Each of these students bought the same number of pencils, and this number was greater than $1$. The cost of a pencil in cents was greater than the number of pencils each student bought, and the total cost of all the pencils was $\\$17.71$. What was the cost of a pencil in cents?",
        answer: "11",
        solutionSketch:
          "Convert $17.71$ to 1771 cents and factor it. The number of buyers must exceed 15, so the only valid factorization is 23 students buying 7 pencils at 11 cents each."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 3,
        sourceKey: "AMC10-2011-A-P12",
        sourceLabel: "2011 AMC 10A · Problem 12",
        difficultyBand: "EASY",
        topicKey: "algebra.systems",
        techniqueTags: ["equation_setup"],
        statement:
          "The players on a basketball team made some three-point shots, some two-point shots, and some one-point free throws. They scored as many points with two-point shots as with three-point shots. Their number of successful free throws was one more than their number of successful two-point shots. The team's total score was $61$ points. How many free throws did they make?",
        answer: "13",
        solutionSketch:
          "Let x be the number of successful two-point shots. Then the two-point and three-point baskets each contribute 2x points, and the free throws contribute x+1 points."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 4,
        sourceKey: "AMC10-2011-A-P15",
        sourceLabel: "2011 AMC 10A · Problem 15",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["piecewise_modeling"],
        statement:
          "Roy bought a new battery-gasoline hybrid car. On a trip the car ran exclusively on its battery for the first $40$ miles, then ran exclusively on gasoline for the rest of the trip, using gasoline at a rate of $0.02$ gallons per mile. On the whole trip he averaged $55$ miles per gallon. How long was the trip in miles?",
        answer: "110",
        solutionSketch:
          "Only the miles after the first 40 use gasoline. Set total miles divided by gallons used equal to 55."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 5,
        sourceKey: "AMC10-2011-A-P17",
        sourceLabel: "2011 AMC 10A · Problem 17",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.sequences",
        techniqueTags: ["periodicity", "systematic_reasoning"],
        statement:
          "In the eight term sequence $A,B,C,D,E,F,G,H$, the value of $C$ is $5$ and the sum of any three consecutive terms is $30$. What is $A+H$ ?",
        answer: "25",
        solutionSketch:
          "Subtract consecutive three-term sums to get A = D = G and B = E = H. Since A + B + C = 30 and C = 5, you only need A + B."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 6,
        sourceKey: "AMC10-2012-A-P5",
        sourceLabel: "2012 AMC 10A · Problem 5",
        difficultyBand: "MEDIUM",
        topicKey: "counting.word_problems",
        techniqueTags: ["population_counting"],
        statement:
          "Last year 100 adult cats, half of whom were female, were brought into the Smallville Animal Shelter. Half of the adult female cats were accompanied by a litter of kittens. The average number of kittens per litter was 4. What was the total number of cats and kittens received by the shelter last year?",
        answer: "200",
        solutionSketch:
          "There were 50 female adult cats, so 25 litters. At 4 kittens per litter, that adds 100 kittens to the original 100 adults."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 7,
        sourceKey: "AMC10-2012-A-P8",
        sourceLabel: "2012 AMC 10A · Problem 8",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.systems",
        techniqueTags: ["symmetric_sums"],
        statement:
          "The sums of three whole numbers taken in pairs are 12, 17, and 19. What is the middle number?",
        answer: "7",
        solutionSketch:
          "Add the pair sums to get twice the total of the three numbers, then solve for the individual numbers."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 8,
        sourceKey: "AMC10-2012-A-P10",
        sourceLabel: "2012 AMC 10A · Problem 10",
        difficultyBand: "MEDIUM",
        topicKey: "geometry.angles",
        techniqueTags: ["arithmetic_sequence", "sum_of_angles"],
        statement:
          "Mary divides a circle into 12 sectors. The central angles of these sectors, measured in degrees, are all integers and they form an arithmetic sequence. What is the degree measure of the smallest possible sector angle?",
        answer: "8",
        solutionSketch:
          "If the angles are a, a+d, ..., a+11d, then their sum is 360. Solve 12a + 66d = 360 with a and d integers and make a as small as possible."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 9,
        sourceKey: "AMC10-2012-A-P14",
        sourceLabel: "2012 AMC 10A · Problem 14",
        difficultyBand: "MEDIUM",
        topicKey: "counting.arrangements",
        techniqueTags: ["checkerboard_counting"],
        statement:
          "Chubby makes checkerboards that have $31$ squares on each side. The checkerboards have a black square in every corner and alternate black and red squares along every row and column. How many black squares are there on such a checkerboard?",
        answer: "481",
        solutionSketch:
          "On an odd-by-odd checkerboard with matching corner colors, there is one more black square than red square."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 10,
        sourceKey: "AMC10-2012-A-P16",
        sourceLabel: "2012 AMC 10A · Problem 16",
        difficultyBand: "HARD",
        topicKey: "number_theory.lcm_gcd",
        techniqueTags: ["relative_speed", "lcm_reasoning"],
        statement:
          "Three runners start running simultaneously from the same point on a 500-meter circular track. They each run clockwise around the course maintaining constant speeds of 4.4, 4.8, and 5.0 meters per second. The runners stop once they are all together again somewhere on the circular course. How many seconds do the runners run?",
        answer: "2500",
        solutionSketch:
          "Use the slowest runner as a reference. The faster runners must each gain a whole number of laps, so the relative distances 0.4t and 0.6t must both be multiples of 500."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 11,
        sourceKey: "AMC10-2012-A-P22",
        sourceLabel: "2012 AMC 10A · Problem 22",
        difficultyBand: "HARD",
        topicKey: "algebra.quadratics",
        techniqueTags: ["difference_of_squares", "factorization"],
        statement:
          "The sum of the first $m$ positive odd integers is $212$ more than the sum of the first $n$ positive even integers. What is the sum of all possible values of $n$ ?",
        answer: "255",
        solutionSketch:
          "Use m^2 for the sum of the first m odd numbers and n(n+1) for the sum of the first n even numbers. Rearrange into a difference of squares."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 12,
        sourceKey: "AMC10-2013-A-P2",
        sourceLabel: "2013 AMC 10A · Problem 2",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.fractions",
        techniqueTags: ["unit_conversion"],
        statement:
          "Alice is making a batch of cookies and needs $2\\frac{1}{2}$ cups of sugar. Her measuring cup holds only $\\frac{1}{4}$ cup of sugar. How many times must she fill that cup to get the correct amount of sugar?",
        answer: "10",
        solutionSketch:
          "Convert $2\\frac{1}{2}$ to fourths and divide by $\\frac{1}{4}$."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 13,
        sourceKey: "AMC10-2013-A-P3",
        sourceLabel: "2013 AMC 10A · Problem 3",
        difficultyBand: "MEDIUM",
        topicKey: "geometry.area_and_perimeter",
        techniqueTags: ["triangle_area"],
        statement:
          "Square $ABCD$ has side length $10$. Point $E$ is on $\\overline{BC}$, and the area of $\\triangle ABE$ is $40$. What is $BE$ ?",
        answer: "8",
        solutionSketch:
          "Use AB as the base. The height from E to AB equals BE, so \\(\\frac12\\cdot 10\\cdot BE = 40\\)."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 14,
        sourceKey: "AMC10-2013-A-P5",
        sourceLabel: "2013 AMC 10A · Problem 5",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.money",
        techniqueTags: ["balancing_totals"],
        statement:
          "Tom, Dorothy, and Sammy went on a vacation and agreed to split the costs evenly. During their trip Tom paid \\$105, Dorothy paid \\$125, and Sammy paid \\$175. In order to share costs equally, Tom gave Sammy $t$ dollars, and Dorothy gave Sammy $d$ dollars. What is $t-d$ ?",
        answer: "20",
        solutionSketch:
          "The total is 405, so each person's share is 135. Compare each person's payment with 135 to find who owes Sammy and by how much."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_mid",
        number: 15,
        sourceKey: "AMC10-2013-A-P7",
        sourceLabel: "2013 AMC 10A · Problem 7",
        difficultyBand: "HARD",
        topicKey: "counting.combinations",
        techniqueTags: ["complement_counting"],
        statement:
          "A student must choose a program of four courses from English, Algebra, Geometry, History, Art, and Latin. The program must contain English and at least one mathematics course. In how many ways can this program be chosen?",
        answer: "9",
        solutionSketch:
          "After forcing English, choose three more courses from the remaining five and subtract the choices with no math course."
      })
    ]
  },
  {
    id: "seed_diagnostic_amc10_v3",
    contest: Contest.AMC10,
    year: 2102,
    exam: "A",
    diagnosticStage: "LATE",
    title: "AMC 10 Diagnostic Test · Preparation Late",
    problems: [
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 1,
        sourceKey: "AMC10-2013-A-P6",
        sourceLabel: "2013 AMC 10A · Problem 6",
        difficultyBand: "EASY",
        topicKey: "counting.casework",
        techniqueTags: ["logic_elimination"],
        statement:
          "Joey and his five brothers are ages $3,5,7,9,11,$ and $13$. One afternoon two of his brothers whose ages sum to $16$ went to the movies, two brothers younger than $10$ went to play baseball, and Joey and the $5$-year-old stayed home. How old is Joey?",
        answer: "11",
        solutionSketch:
          "Test the possible ages for Joey, remembering Joey is not the 5-year-old. Only one choice leaves a movie pair summing to 16 and a baseball pair both younger than 10."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 2,
        sourceKey: "AMC10-2013-A-P9",
        sourceLabel: "2013 AMC 10A · Problem 9",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.percents",
        techniqueTags: ["equation_setup"],
        statement:
          "In a recent basketball game, Shenille attempted only three-point shots and two-point shots. She was successful on $20\\%$ of her three-point shots and $30\\%$ of her two-point shots. Shenille attempted $30$ shots. How many points did she score?",
        answer: "18",
        solutionSketch:
          "Let t be the number of three-point attempts. Then 30-t is the number of two-point attempts, and the score is 3(0.2t) + 2(0.3(30-t))."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 3,
        sourceKey: "AMC10-2013-A-P10",
        sourceLabel: "2013 AMC 10A · Problem 10",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.percents",
        techniqueTags: ["part_whole_reasoning"],
        statement:
          "A flower bouquet contains pink roses, red roses, pink carnations, and red carnations. One third of the pink flowers are roses, three fourths of the red flowers are carnations, and six tenths of the flowers are pink. What percent of the flowers are carnations?",
        answer: "70",
        solutionSketch:
          "Assume 100 flowers. Then 60 are pink and 40 are red, so count carnations separately in each color group."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 4,
        sourceKey: "AMC10-2013-A-P11",
        sourceLabel: "2013 AMC 10A · Problem 11",
        difficultyBand: "MEDIUM",
        topicKey: "counting.combinations",
        techniqueTags: ["inverse_counting"],
        statement:
          "A student council must select a two-person welcoming committee and a three-person planning committee from among its members. There are exactly $10$ ways to select a two-person team for the welcoming committee. It is possible for students to serve on both committees. In how many different ways can a three-person planning committee be selected?",
        answer: "10",
        solutionSketch:
          "If there are n members, then \\(\\binom{n}{2}=10\\). Solve for n and then compute \\(\\binom{n}{3}\\)."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 5,
        sourceKey: "AMC10-2013-A-P13",
        sourceLabel: "2013 AMC 10A · Problem 13",
        difficultyBand: "MEDIUM",
        topicKey: "counting.digits",
        techniqueTags: ["digit_casework"],
        statement:
          "How many three-digit numbers are not divisible by $5$, have digits that sum to less than $20$, and have the first digit equal to the third digit?",
        answer: "60",
        solutionSketch:
          "Write the number as aba. Exclude a = 5 so the number is not divisible by 5, then count b values satisfying 2a + b < 20."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 6,
        sourceKey: "AMC10-2013-A-P14",
        sourceLabel: "2013 AMC 10A · Problem 14",
        difficultyBand: "MEDIUM",
        topicKey: "geometry.solid_geometry",
        techniqueTags: ["edge_counting"],
        statement:
          "A solid cube of side length $1$ is removed from each corner of a solid cube of side length $3$. How many edges does the remaining solid have?",
        answer: "36",
        solutionSketch:
          "The original 12 edges remain in shortened form, and each removed corner creates 3 new edges on the cut face."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 7,
        sourceKey: "AMC10-2013-A-P17",
        sourceLabel: "2013 AMC 10A · Problem 17",
        difficultyBand: "HARD",
        topicKey: "counting.inclusion_exclusion",
        techniqueTags: ["lcm_reasoning", "inclusion_exclusion"],
        statement:
          "Daphne is visited periodically by her three best friends: Alice every third day, Beatrix every fourth day, and Claire every fifth day. All three friends visited Daphne yesterday. How many days of the next $365$-day period will exactly two friends visit her?",
        answer: "54",
        solutionSketch:
          "Count days that are multiples of lcm(3,4), lcm(3,5), and lcm(4,5), then exclude days when all three visit together."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 8,
        sourceKey: "AMC10-2013-A-P19",
        sourceLabel: "2013 AMC 10A · Problem 19",
        difficultyBand: "HARD",
        topicKey: "number_theory.base_systems",
        techniqueTags: ["divisibility"],
        statement:
          "In base $10$, the number $2013$ ends in the digit $3$. For how many positive integers $b$ does the base-$b$ representation of $2013$ also end in the digit $3$ ?",
        answer: "13",
        solutionSketch:
          "A base-b representation ends in 3 exactly when 2013 leaves remainder 3 upon division by b, so b must divide 2010 and be greater than 3."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 9,
        sourceKey: "AMC10-2014-A-P3",
        sourceLabel: "2014 AMC 10A · Problem 3",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.money",
        techniqueTags: ["piecewise_accounting"],
        statement:
          "Bridget bakes 48 loaves of bread for her bakery. She sells half of them in the morning for \\$2.50 each. In the afternoon she sells two thirds of what she has left for half that price. In the late afternoon she sells the remaining loaves at a dollar each. Each loaf costs \\$0.75 to make. In dollars, what is her profit for the day?",
        answer: "52",
        solutionSketch:
          "Compute the revenue from the three sales periods separately, then subtract the total production cost."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 10,
        sourceKey: "AMC10-2014-A-P4",
        sourceLabel: "2014 AMC 10A · Problem 4",
        difficultyBand: "MEDIUM",
        topicKey: "counting.arrangements",
        techniqueTags: ["order_constraints"],
        statement:
          "Ralph passed four houses in a row, each painted a different color. He passed the orange house before the red house, and he passed the blue house before the yellow house. The blue house was not next to the yellow house. How many orderings of the colored houses are possible?",
        answer: "3",
        solutionSketch:
          "Start with the 6 orderings satisfying the two before/after constraints, then subtract those where blue and yellow are adjacent in the order BY."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 11,
        sourceKey: "AMC10-2014-A-P5",
        sourceLabel: "2014 AMC 10A · Problem 5",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.averages",
        techniqueTags: ["mean_median"],
        statement:
          "On an algebra quiz, 10% of the students scored 70 points, 35% scored 80 points, 30% scored 90 points, and the rest scored 100 points. What is the difference between the mean and median score?",
        answer: "3",
        solutionSketch:
          "Compute the weighted mean directly. The median lies in the 90-point group because the cumulative percentage reaches 75% there."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 12,
        sourceKey: "AMC10-2014-A-P14",
        sourceLabel: "2014 AMC 10A · Problem 14",
        difficultyBand: "HARD",
        topicKey: "geometry.coordinate_geometry",
        techniqueTags: ["slope_perpendicularity", "area"],
        statement:
          "The y-intercepts, $P$ and $Q$, of two perpendicular lines intersecting at the point $A(6,8)$ have a sum of zero. What is the area of $\\triangle APQ$ ?",
        answer: "60",
        solutionSketch:
          "If the y-intercepts are p and -p, the slopes from those intercepts to A are perpendicular. Solve for p, then use base PQ and horizontal distance from A to the y-axis."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 13,
        sourceKey: "AMC10-2014-A-P15",
        sourceLabel: "2014 AMC 10A · Problem 15",
        difficultyBand: "HARD",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["piecewise_rate_modeling"],
        statement:
          "David drives from his home to the airport. He drives 35 miles in the first hour, but realizes that he will be 1 hour late if he continues at this speed. He increases his speed by 15 miles per hour for the rest of the way and arrives 30 minutes early. How many miles is the airport from his home?",
        answer: "210",
        solutionSketch:
          "Compare the remaining travel times at 35 mph and 50 mph. The faster plan saves 1.5 hours on the remaining distance."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 14,
        sourceKey: "AMC10-2014-A-P20",
        sourceLabel: "2014 AMC 10A · Problem 20",
        difficultyBand: "HARD",
        topicKey: "number_theory.digit_patterns",
        techniqueTags: ["pattern_finding"],
        statement:
          "The product $(8)(888\\dots 8)$, where the second factor has $k$ digits, is an integer whose digits have a sum of $1000$. What is $k$ ?",
        answer: "991",
        solutionSketch:
          "Compute the first few products to spot the digit pattern: 64, 704, 7104, 71104, and so on. This makes the digit sum easy to express in terms of k."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC10,
        prefix: "diag_amc10_late",
        number: 15,
        sourceKey: "AMC10-2008-A-P23",
        sourceLabel: "2008 AMC 10A · Problem 23",
        difficultyBand: "HARD",
        topicKey: "counting.sets",
        techniqueTags: ["casework", "symmetry"],
        statement:
          "Two subsets of the set $S=\\{a,b,c,d,e\\}$ are to be chosen so that their union is $S$ and their intersection contains exactly two elements. In how many ways can this be done, assuming that the order in which the subsets are chosen does not matter?",
        answer: "40",
        solutionSketch:
          "Choose the two common elements first. Each of the other three elements must go to exactly one of the two sets, and then divide by 2 because swapping the two sets does not create a new choice."
      })
    ]
  },
  {
    id: "seed_diagnostic_amc12_v1",
    contest: Contest.AMC12,
    year: 2100,
    exam: "A",
    diagnosticStage: "EARLY",
    title: "AMC 12 Diagnostic Test · Preparation Start",
    problems: [
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 1,
        sourceKey: "AMC12-2009-A-P1",
        sourceLabel: "2009 AMC 12A · Problem 1",
        difficultyBand: "EASY",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["time_arithmetic"],
        statement:
          "Kim's flight took off from Newark at 10:34 AM and landed in Miami at 1:18 PM. Both cities are in the same time zone. If her flight took $h$ hours and $m$ minutes, with $0 < m < 60$, what is $h + m$ ?",
        answer: "46",
        solutionSketch:
          "The elapsed time is 2 hours and 44 minutes, so h + m = 2 + 44."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 2,
        sourceKey: "AMC12-2010-A-P1",
        sourceLabel: "2010 AMC 12A · Problem 1",
        difficultyBand: "EASY",
        topicKey: "algebra.expressions",
        techniqueTags: ["direct_computation"],
        statement:
          "What is $\\left(20-\\left(2010-201\\right)\\right)+\\left(2010-\\left(201-20\\right)\\right)$ ?",
        answer: "40",
        solutionSketch:
          "Compute each bracket first: 20 - 1809 = -1789 and 2010 - 181 = 1829. Add the two results."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 3,
        sourceKey: "AMC12-2009-A-P9",
        sourceLabel: "2009 AMC 12A · Problem 9",
        difficultyBand: "EASY",
        topicKey: "algebra.functions",
        techniqueTags: ["substitution", "function_analysis"],
        statement:
          "Suppose that $f(x+3)=3x^2 + 7x + 4$ and $f(x)=ax^2 + bx + c$. What is $a+b+c$ ?",
        answer: "2",
        solutionSketch:
          "Replace x by x-3 to write f(x) = 3(x-3)^2 + 7(x-3) + 4. Expand and add the resulting coefficients."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 4,
        sourceKey: "AMC12-2009-A-P12",
        sourceLabel: "2009 AMC 12A · Problem 12",
        difficultyBand: "EASY",
        topicKey: "number_theory.digit_sums",
        techniqueTags: ["place_value", "casework"],
        statement: "How many positive integers less than $1000$ are $6$ times the sum of their digits?",
        answer: "1",
        solutionSketch:
          "Check one-digit, two-digit, and three-digit cases. Only the two-digit number 54 works, so the count is 1."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 5,
        sourceKey: "AMC12-2010-A-P2",
        sourceLabel: "2010 AMC 12A · Problem 2",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.sequences",
        techniqueTags: ["arithmetic_sequence", "sum_formula"],
        statement:
          "A ferry boat shuttles tourists to an island every hour starting at 10 AM until its last trip, which starts at 3 PM. One day the boat captain notes that on the 10 AM trip there were 100 tourists on the ferry boat, and that on each successive trip, the number of tourists was 1 fewer than on the previous trip. How many tourists did the ferry take to the island that day?",
        answer: "585",
        solutionSketch:
          "There are six trips: 10, 11, 12, 1, 2, and 3. Sum the arithmetic sequence 100, 99, 98, 97, 96, 95."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 6,
        sourceKey: "AMC12-2010-A-P5",
        sourceLabel: "2010 AMC 12A · Problem 5",
        difficultyBand: "MEDIUM",
        topicKey: "counting.optimization",
        techniqueTags: ["extremal_reasoning", "bounding"],
        statement:
          "Halfway through a 100-shot archery tournament, Chelsea leads by 50 points. For each shot a bullseye scores 10 points, with other possible scores being 8, 4, 2, and 0 points. Chelsea always scores at least 4 points on each shot. If Chelsea's next $n$ shots are bullseyes she will be guaranteed victory. What is the minimum value for $n$ ?",
        answer: "42",
        solutionSketch:
          "Assume the opponent scores 10 on all remaining shots. After n bullseyes and then the minimum 4 on the rest, compare Chelsea's guaranteed total to the opponent's best possible total."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 7,
        sourceKey: "AMC12-2010-A-P6",
        sourceLabel: "2010 AMC 12A · Problem 6",
        difficultyBand: "MEDIUM",
        topicKey: "number_theory.palindromes",
        techniqueTags: ["place_value", "equation_solving"],
        statement:
          "A palindrome, such as $83438$, is a number that remains the same when its digits are reversed. The numbers $x$ and $x+32$ are three-digit and four-digit palindromes, respectively. What is the sum of the digits of $x$ ?",
        answer: "24",
        solutionSketch:
          "Let x be the three-digit palindrome aba. Then x+32 must be a four-digit palindrome, forcing x = 969 and giving digit sum 24."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 8,
        sourceKey: "AMC12-2009-A-P7",
        sourceLabel: "2009 AMC 12A · Problem 7",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.sequences",
        techniqueTags: ["arithmetic_sequence", "equation_solving"],
        statement:
          "The first three terms of an arithmetic sequence are $2x - 3$, $5x - 11$, and $3x + 1$ respectively. The $n$th term of the sequence is $2009$. What is $n$ ?",
        answer: "502",
        solutionSketch:
          "Set consecutive differences equal to solve for x. Then write the arithmetic sequence explicitly and solve for the term number that equals 2009."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 9,
        sourceKey: "AMC12-2010-A-P16",
        sourceLabel: "2010 AMC 12A · Problem 16",
        difficultyBand: "HARD",
        topicKey: "geometry.circles",
        techniqueTags: ["coordinate_geometry", "distance_formula"],
        statement:
          "A circle with center $C$ is tangent to the positive $x$- and $y$-axes and externally tangent to the circle centered at $(3,0)$ with radius $1$. What is the sum of all possible radii of the circle with center $C$ ?",
        answer: "8",
        solutionSketch:
          "A circle tangent to both axes has center (r,r). Use the distance from (r,r) to (3,0) and set it equal to r+1, then sum the two positive solutions."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 10,
        sourceKey: "AMC12-2009-A-P18",
        sourceLabel: "2009 AMC 12A · Problem 18",
        difficultyBand: "HARD",
        topicKey: "number_theory.divisibility",
        techniqueTags: ["v2_counting", "factorization"],
        statement:
          "For $k > 0$, let $I_k = 10\\ldots 064$, where there are $k$ zeros between the $1$ and the $6$. Let $N(k)$ be the number of factors of $2$ in the prime factorization of $I_k$. What is the maximum value of $N(k)$ ?",
        answer: "6",
        solutionSketch:
          "Write I_k = 10^{k+2} + 64 and factor out powers of 2. For k ≥ 4 you can factor out exactly 2^6 and the remaining factor is odd, so the maximum is 6."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 11,
        sourceKey: "AMC12-2011-A-P1",
        sourceLabel: "2011 AMC 12A · Problem 1",
        difficultyBand: "EASY",
        topicKey: "arithmetic.money",
        techniqueTags: ["unit_conversion", "direct_computation"],
        statement:
          "A cell phone plan costs $20$ dollars each month, plus $5$ cents per text message sent, plus $10$ cents for each minute used over $30$ hours. In January Michelle sent $100$ text messages and talked for $30.5$ hours. How much did she have to pay?",
        answer: "28",
        solutionSketch:
          "Start with the 20-dollar base cost. Add 100 texts at 5 cents each and 30 extra minutes at 10 cents each."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 12,
        sourceKey: "AMC12-2011-A-P3",
        sourceLabel: "2011 AMC 12A · Problem 3",
        difficultyBand: "EASY",
        topicKey: "arithmetic.estimation",
        techniqueTags: ["ceil_floor_reasoning"],
        statement:
          "A small bottle of shampoo can hold $35$ milliliters of shampoo, whereas a large bottle can hold $500$ milliliters of shampoo. Jasmine wants to buy the minimum number of small bottles necessary to completely fill a large bottle. How many bottles must she buy?",
        answer: "15",
        solutionSketch:
          "Compute 500/35 and round up, since 14 bottles hold only 490 milliliters."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 13,
        sourceKey: "AMC12-2011-A-P5",
        sourceLabel: "2011 AMC 12A · Problem 5",
        difficultyBand: "EASY",
        topicKey: "arithmetic.percents",
        techniqueTags: ["part_whole_reasoning"],
        statement:
          "Last summer 30% of the birds living on Town Lake were geese, 25% were swans, 10% were herons, and 35% were ducks. What percent of the birds that were not swans were geese?",
        answer: "40",
        solutionSketch:
          "Remove the swans first, leaving 75% of the birds. Then ask what fraction 30% is of 75%."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 14,
        sourceKey: "AMC12-2011-A-P6",
        sourceLabel: "2011 AMC 12A · Problem 6",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.systems",
        techniqueTags: ["equation_setup"],
        statement:
          "The players on a basketball team made some three-point shots, some two-point shots, and some one-point free throws. They scored as many points with two-point shots as with three-point shots. Their number of successful free throws was one more than their number of successful two-point shots. The team's total score was $61$ points. How many free throws did they make?",
        answer: "13",
        solutionSketch:
          "Let x be the number of successful two-point shots. Then the team scored 2x points from two-point shots, 2x points from three-point shots, and x+1 from free throws."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12",
        number: 15,
        sourceKey: "AMC12-2011-A-P8",
        sourceLabel: "2011 AMC 12A · Problem 8",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.sequences",
        techniqueTags: ["periodicity", "systematic_reasoning"],
        statement:
          "In the eight-term sequence $A,B,C,D,E,F,G,H$, the value of $C$ is $5$ and the sum of any three consecutive terms is $30$. What is $A+H$ ?",
        answer: "25",
        solutionSketch:
          "Subtract consecutive three-term sums to get A = D = G and B = E = H. Since A + B + C = 30 and C = 5, you only need A + B."
      })
    ]
  },
  {
    id: "seed_diagnostic_amc12_v2",
    contest: Contest.AMC12,
    year: 2101,
    exam: "A",
    diagnosticStage: "MID",
    title: "AMC 12 Diagnostic Test · Preparation Middle",
    problems: [
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 1,
        sourceKey: "AMC12-2011-A-P7",
        sourceLabel: "2011 AMC 12A · Problem 7",
        difficultyBand: "EASY",
        topicKey: "number_theory.divisibility",
        techniqueTags: ["factorization", "casework"],
        statement:
          "A majority of the $30$ students in Ms. Demeanor's class bought pencils at the school bookstore. Each of these students bought the same number of pencils, and this number was greater than $1$. The cost of a pencil in cents was greater than the number of pencils each student bought, and the total cost of all the pencils was $\\$17.71$. What was the cost of a pencil in cents?",
        answer: "11",
        solutionSketch:
          "Convert $17.71$ to 1771 cents and factor it. Since a majority of 30 students bought pencils, there must be more than 15 buyers."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 2,
        sourceKey: "AMC12-2011-A-P9",
        sourceLabel: "2011 AMC 12A · Problem 9",
        difficultyBand: "MEDIUM",
        topicKey: "counting.double_counting",
        techniqueTags: ["pair_counting"],
        statement:
          "At a twins and triplets convention, there were $9$ sets of twins and $6$ sets of triplets, all from different families. Each twin shook hands with all the twins except the sibling and with half the triplets. Each triplet shook hands with all the triplets except the siblings and with half the twins. How many handshakes took place?",
        answer: "441",
        solutionSketch:
          "Count twin-twin handshakes, triplet-triplet handshakes, and twin-triplet handshakes separately, then add."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 3,
        sourceKey: "AMC12-2011-A-P13",
        sourceLabel: "2011 AMC 12A · Problem 13",
        difficultyBand: "MEDIUM",
        topicKey: "geometry.similarity",
        techniqueTags: ["incenter", "similarity"],
        statement:
          "Triangle $ABC$ has side lengths $AB=12$, $BC=24$, and $AC=18$. The line through the incenter of $\\triangle ABC$ parallel to $\\overline{BC}$ intersects $\\overline{AB}$ at $M$ and $\\overline{AC}$ at $N$. What is the perimeter of $\\triangle AMN$ ?",
        answer: "30",
        solutionSketch:
          "Find the inradius and the altitude to side BC, then use similarity between triangles AMN and ABC."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 4,
        sourceKey: "AMC12-2012-A-P3",
        sourceLabel: "2012 AMC 12A · Problem 3",
        difficultyBand: "EASY",
        topicKey: "geometry.volume",
        techniqueTags: ["scaling"],
        statement:
          "A box $2$ centimeters high, $3$ centimeters wide, and $5$ centimeters long can hold $40$ grams of clay. A second box has twice the height, three times the width, and the same length. How many grams of clay can the second box hold?",
        answer: "240",
        solutionSketch:
          "The volume scales by a factor of 2 times 3 times 1."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 5,
        sourceKey: "AMC12-2012-A-P5",
        sourceLabel: "2012 AMC 12A · Problem 5",
        difficultyBand: "EASY",
        topicKey: "algebra.systems",
        techniqueTags: ["ratio_setup"],
        statement:
          "A fruit salad consists of blueberries, raspberries, grapes, and cherries, with $280$ total pieces of fruit. There are twice as many raspberries as blueberries, three times as many grapes as cherries, and four times as many cherries as raspberries. How many cherries are there?",
        answer: "64",
        solutionSketch:
          "Express all fruit counts in terms of the number of blueberries, then use the total 280."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 6,
        sourceKey: "AMC12-2012-A-P6",
        sourceLabel: "2012 AMC 12A · Problem 6",
        difficultyBand: "EASY",
        topicKey: "algebra.systems",
        techniqueTags: ["symmetric_sums"],
        statement:
          "The sums of three whole numbers taken in pairs are 12, 17, and 19. What is the middle number?",
        answer: "7",
        solutionSketch:
          "Add the pair sums to get twice the total, then solve for the three numbers."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 7,
        sourceKey: "AMC12-2012-A-P7",
        sourceLabel: "2012 AMC 12A · Problem 7",
        difficultyBand: "MEDIUM",
        topicKey: "geometry.angles",
        techniqueTags: ["arithmetic_sequence", "sum_of_angles"],
        statement:
          "Mary divides a circle into 12 sectors. The central angles are all integers and form an arithmetic sequence. What is the smallest possible degree measure of a sector?",
        answer: "8",
        solutionSketch:
          "Let the angles be a, a+d, ..., a+11d. Their sum is 360 degrees."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 8,
        sourceKey: "AMC12-2012-A-P17",
        sourceLabel: "2012 AMC 12A · Problem 17",
        difficultyBand: "MEDIUM",
        topicKey: "number_theory.modular_arithmetic",
        techniqueTags: ["residue_classes"],
        statement:
          "Let $S$ be a subset of $\\{1,2,3,\\dots,30\\}$ with the property that no pair of distinct elements in $S$ has a sum divisible by $5$. What is the largest possible size of $S$ ?",
        answer: "18",
        solutionSketch:
          "Split the numbers 1 through 30 into residue classes modulo 5. You may take all numbers with remainder 0, and from each complementary pair of remainders choose one class."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 9,
        sourceKey: "AMC12-2013-A-P1",
        sourceLabel: "2013 AMC 12A · Problem 1",
        difficultyBand: "MEDIUM",
        topicKey: "geometry.area_and_perimeter",
        techniqueTags: ["triangle_area"],
        statement:
          "Square $ABCD$ has side length $10$. Point $E$ is on $\\overline{BC}$, and the area of $\\triangle ABE$ is $40$. What is $BE$ ?",
        answer: "8",
        solutionSketch:
          "Use AB as the base of triangle ABE and BE as the height."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 10,
        sourceKey: "AMC12-2013-A-P3",
        sourceLabel: "2013 AMC 12A · Problem 3",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.percents",
        techniqueTags: ["part_whole_reasoning"],
        statement:
          "A flower bouquet contains pink roses, red roses, pink carnations, and red carnations. One third of the pink flowers are roses, three fourths of the red flowers are carnations, and six tenths of the flowers are pink. What percent of the flowers are carnations?",
        answer: "70",
        solutionSketch:
          "Assume 100 flowers so 60 are pink and 40 are red. Then count carnations in each color group."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 11,
        sourceKey: "AMC12-2013-A-P5",
        sourceLabel: "2013 AMC 12A · Problem 5",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.money",
        techniqueTags: ["balancing_totals"],
        statement:
          "Tom, Dorothy, and Sammy agreed to split the cost of a vacation evenly. Tom paid 105 dollars, Dorothy paid 125 dollars, and Sammy paid 175 dollars. Tom gave Sammy $t$ dollars and Dorothy gave Sammy $d$ dollars. What is $t-d$ ?",
        answer: "20",
        solutionSketch:
          "Find the equal share first, then compare each person's payment with that share."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 12,
        sourceKey: "AMC12-2013-A-P6",
        sourceLabel: "2013 AMC 12A · Problem 6",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.percents",
        techniqueTags: ["equation_setup"],
        statement:
          "In a recent basketball game, Shenille attempted only three-point shots and two-point shots. She was successful on 20% of her three-point shots and 30% of her two-point shots. Shenille attempted 30 shots. How many points did she score?",
        answer: "18",
        solutionSketch:
          "Let t be the number of three-point attempts. Then 30-t is the number of two-point attempts and the score can be written in terms of t."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 13,
        sourceKey: "AMC12-2013-A-P7",
        sourceLabel: "2013 AMC 12A · Problem 7",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.sequences",
        techniqueTags: ["recurrence_relations"],
        statement:
          "The sequence $S_1,S_2,\\dots,S_{10}$ satisfies $S_n = S_{n-2}+S_{n-1}$ for $n\\ge 3$. Suppose $S_9=110$ and $S_7=42$. What is $S_4$ ?",
        answer: "10",
        solutionSketch:
          "Work backward from S9 and S7 to recover S8, then S6, S5, and S4."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 14,
        sourceKey: "AMC12-2013-A-P8",
        sourceLabel: "2013 AMC 12A · Problem 8",
        difficultyBand: "MEDIUM",
        topicKey: "algebra.equations",
        techniqueTags: ["factorization"],
        statement:
          "Given that $x$ and $y$ are distinct nonzero real numbers such that $x+\\tfrac{2}{x}=y+\\tfrac{2}{y}$, what is $xy$ ?",
        answer: "2",
        solutionSketch:
          "Bring everything to one side and factor out x-y. Since x and y are distinct, the other factor must be zero."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_mid",
        number: 15,
        sourceKey: "AMC12-2013-A-P9",
        sourceLabel: "2013 AMC 12A · Problem 9",
        difficultyBand: "HARD",
        topicKey: "geometry.similarity",
        techniqueTags: ["parallel_lines", "similarity"],
        statement:
          "In $\\triangle ABC$, $AB=AC=28$ and $BC=20$. Points $D,E,F$ are on sides $\\overline{AB}, \\overline{BC}, \\overline{AC}$, respectively, such that $\\overline{DE}$ and $\\overline{EF}$ are parallel to $\\overline{AC}$ and $\\overline{AB}$, respectively. What is the perimeter of parallelogram $ADEF$ ?",
        answer: "56",
        solutionSketch:
          "Use coordinates or similarity to show that D and F must be the midpoints of AB and AC. Then the parallelogram sides have lengths 14 and 14."
      })
    ]
  },
  {
    id: "seed_diagnostic_amc12_v3",
    contest: Contest.AMC12,
    year: 2102,
    exam: "A",
    diagnosticStage: "LATE",
    title: "AMC 12 Diagnostic Test · Preparation Late",
    problems: [
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 1,
        sourceKey: "AMC12-2013-A-P10",
        sourceLabel: "2013 AMC 12A · Problem 10",
        difficultyBand: "MEDIUM",
        topicKey: "number_theory.repeating_decimals",
        techniqueTags: ["fraction_decimal_conversion"],
        statement:
          "Let $S$ be the set of positive integers $n$ for which $\\frac{1}{n}$ has the repeating decimal representation $0.\\overline{ab}$, where $a$ and $b$ are different digits. What is the sum of the elements of $S$ ?",
        answer: "143",
        solutionSketch:
          "Since $0.\\overline{ab}=\\frac{10a+b}{99}$, the denominator n must come from divisors of 99 that give a two-digit repeating block with different digits."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 2,
        sourceKey: "AMC12-2013-A-P13",
        sourceLabel: "2013 AMC 12A · Problem 13",
        difficultyBand: "MEDIUM",
        topicKey: "geometry.coordinate_geometry",
        techniqueTags: ["area", "line_partition"],
        statement:
          "Let points $A=(0,0)$, $B=(1,2)$, $C=(3,3)$, and $D=(4,0)$. Quadrilateral $ABCD$ is cut into two equal-area pieces by a line passing through $A$. This line intersects $\\overline{CD}$ at $\\left(\\frac{p}{q},\\frac{r}{s}\\right)$ in lowest terms. What is $p+q+r+s$ ?",
        answer: "58",
        solutionSketch:
          "The line from A to a point on CD splits off triangle APD. Set its area equal to half the area of the quadrilateral and solve for the point on CD."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 3,
        sourceKey: "AMC12-2013-A-P15",
        sourceLabel: "2013 AMC 12A · Problem 15",
        difficultyBand: "HARD",
        topicKey: "counting.arrangements",
        techniqueTags: ["casework", "constraints"],
        statement:
          "Rabbits Peter and Pauline have three offspring—Flopsie, Mopsie, and Cotton-tail. These five rabbits are to be distributed to four different pet stores so that no store gets both a parent and a child. It is not required that every store gets a rabbit. In how many different ways can this be done?",
        answer: "204",
        solutionSketch:
          "Assign stores to the two parents first, then count assignments of the three children subject to avoiding those parent stores."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 4,
        sourceKey: "AMC12-2013-A-P16",
        sourceLabel: "2013 AMC 12A · Problem 16",
        difficultyBand: "HARD",
        topicKey: "arithmetic.averages",
        techniqueTags: ["weighted_average", "optimization"],
        statement:
          "Piles $A$, $B$, and $C$ of rocks have mean weights $40$, $50$, and an unknown value, respectively. The mean weight of the combined piles $A$ and $B$ is $43$, and the mean weight of the combined piles $A$ and $C$ is $44$. What is the greatest possible integer value of the mean weight of the combined piles $B$ and $C$ ?",
        answer: "59",
        solutionSketch:
          "From the AB mean, deduce the ratio of the sizes of A and B. Then express the BC mean in terms of the size of C and maximize it."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 5,
        sourceKey: "AMC12-2013-A-P17",
        sourceLabel: "2013 AMC 12A · Problem 17",
        difficultyBand: "HARD",
        topicKey: "number_theory.divisibility",
        techniqueTags: ["backward_recursion"],
        statement:
          "A group of $12$ pirates divide a treasure chest so that the $k$th pirate to take a share takes $\\frac{k}{12}$ of the coins remaining in the chest. The number of coins initially in the chest is the smallest number for which each pirate receives a positive whole number of coins. How many coins does the $12$th pirate receive?",
        answer: "1",
        solutionSketch:
          "Work backward from the last pirate. To minimize the starting number, make the final pirate's share as small as possible and reverse each fractional step."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 6,
        sourceKey: "AMC12-2013-A-P19",
        sourceLabel: "2013 AMC 12A · Problem 19",
        difficultyBand: "HARD",
        topicKey: "geometry.circles",
        techniqueTags: ["power_of_a_point"],
        statement:
          "In $\\triangle ABC$, $AB=86$ and $AC=97$. A circle with center $A$ and radius $AB$ intersects $\\overline{BC}$ at points $B$ and $X$. Moreover $\\overline{BX}$ and $\\overline{CX}$ have integer lengths. What is $BC$ ?",
        answer: "33",
        solutionSketch:
          "Use power of a point from C with respect to the circle centered at A. Since C lies outside the circle, CB and CX multiply to $AC^2-AB^2=2013$."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 7,
        sourceKey: "AMC12-2014-A-P3",
        sourceLabel: "2014 AMC 12A · Problem 3",
        difficultyBand: "MEDIUM",
        topicKey: "counting.arrangements",
        techniqueTags: ["order_constraints"],
        statement:
          "Ralph passed four houses in a row, each painted a different color. He passed the orange house before the red house, and he passed the blue house before the yellow house. The blue house was not next to the yellow house. How many orderings of the colored houses are possible?",
        answer: "3",
        solutionSketch:
          "Start with the orderings satisfying the two before/after conditions, then eliminate those with blue and yellow adjacent."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 8,
        sourceKey: "AMC12-2014-A-P5",
        sourceLabel: "2014 AMC 12A · Problem 5",
        difficultyBand: "MEDIUM",
        topicKey: "arithmetic.averages",
        techniqueTags: ["mean_median"],
        statement:
          "On an algebra quiz, 10% of the students scored 70 points, 35% scored 80 points, 30% scored 90 points, and the rest scored 100 points. What is the difference between the mean and median score?",
        answer: "3",
        solutionSketch:
          "Compute the weighted mean directly. The median is 90 because the cumulative percentage first passes 50% in the 90-point group."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 9,
        sourceKey: "AMC12-2014-A-P6",
        sourceLabel: "2014 AMC 12A · Problem 6",
        difficultyBand: "MEDIUM",
        topicKey: "number_theory.digits",
        techniqueTags: ["place_value"],
        statement:
          "The difference between a two-digit number and the number obtained by reversing its digits is $5$ times the sum of the digits of either number. What is the sum of the two-digit number and its reverse?",
        answer: "99",
        solutionSketch:
          "Let the number be 10a+b. Translate the condition into an equation in a and b and solve for the digits."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 10,
        sourceKey: "AMC12-2014-A-P11",
        sourceLabel: "2014 AMC 12A · Problem 11",
        difficultyBand: "HARD",
        topicKey: "arithmetic.ratios_and_rates",
        techniqueTags: ["piecewise_rate_modeling"],
        statement:
          "David drives from his home to the airport. He drives $35$ miles in the first hour, realizes that he will be $1$ hour late if he continues at that speed, then increases his speed by $15$ miles per hour and arrives $30$ minutes early. How many miles is the airport from his home?",
        answer: "210",
        solutionSketch:
          "The faster speed saves 1.5 hours on the remaining distance. Use the difference between 35 mph and 50 mph on that remaining trip."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 11,
        sourceKey: "AMC12-2014-A-P13",
        sourceLabel: "2014 AMC 12A · Problem 13",
        difficultyBand: "HARD",
        topicKey: "counting.partitions",
        techniqueTags: ["casework"],
        statement:
          "A bed and breakfast has $5$ rooms, each distinct. Five friends arrive to spend the night. They may room in any combination they wish, but with no more than two friends per room. In how many ways can the innkeeper assign the guests to the rooms?",
        answer: "360",
        solutionSketch:
          "Count the cases of five single rooms occupied and of one double room plus three single rooms."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 12,
        sourceKey: "AMC12-2014-A-P15",
        sourceLabel: "2014 AMC 12A · Problem 15",
        difficultyBand: "HARD",
        topicKey: "number_theory.palindromes",
        techniqueTags: ["digit_symmetry"],
        statement:
          "A five-digit palindrome is a positive integer with digits $abcba$, where $a$ is nonzero. Let $S$ be the sum of all five-digit palindromes. What is the sum of the digits of $S$ ?",
        answer: "18",
        solutionSketch:
          "Count how often each digit appears in each place when summing all palindromes, then add the digits of the total."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 13,
        sourceKey: "AMC12-2014-A-P16",
        sourceLabel: "2014 AMC 12A · Problem 16",
        difficultyBand: "HARD",
        topicKey: "number_theory.digit_patterns",
        techniqueTags: ["pattern_finding"],
        statement:
          "The product $(8)(888\\dots 8)$, where the second factor has $k$ digits, is an integer whose digits have a sum of $1000$. What is $k$ ?",
        answer: "991",
        solutionSketch:
          "Compute a few products to see the pattern in the digits. Then express the digit sum in terms of k."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 14,
        sourceKey: "AMC12-2014-A-P19",
        sourceLabel: "2014 AMC 12A · Problem 19",
        difficultyBand: "HARD",
        topicKey: "algebra.quadratics",
        techniqueTags: ["factorization", "integer_roots"],
        statement:
          "There are exactly $N$ distinct rational numbers $k$ such that $|k|<200$ and $5x^2+kx+12=0$ has at least one integer solution for $x$. What is $N$ ?",
        answer: "12",
        solutionSketch:
          "If x is an integer root, then k = -(5x^2+12)/x, so x must divide 12. Evaluate the resulting k-values and count the distinct ones."
      }),
      makeRealProblem({
        exam: ExamTrack.AMC12,
        prefix: "diag_amc12_late",
        number: 15,
        sourceKey: "AMC12-2014-A-P24",
        sourceLabel: "2014 AMC 12A · Problem 24",
        difficultyBand: "HARD",
        topicKey: "algebra.absolute_value",
        techniqueTags: ["iteration", "preimage_counting"],
        statement:
          "Let $f_0(x)=x+|x-100|-|x+100|$, and for $n\\ge 1$, let $f_n(x)=|f_{n-1}(x)|-1$. For how many values of $x$ is $f_{100}(x)=0$ ?",
        answer: "301",
        solutionSketch:
          "First find all values y such that 100 iterations of $g(y)=|y|-1$ end at 0. Then count how many x-values satisfy $f_0(x)=y$ for those y."
      })
    ]
  }
];
