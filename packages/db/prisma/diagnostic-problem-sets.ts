import { AnswerFormat, Contest, ExamTrack, StatementFormat } from "@prisma/client";

export const DIAGNOSTIC_TEST_SEED_SOURCE_URL = "local://seed/diagnostic-test";

type DiagnosticSeedProblem = {
  id: string;
  number: number;
  statement: string;
  statementFormat: StatementFormat;
  choices: null;
  answer: string;
  answerFormat: AnswerFormat;
  examTrack: ExamTrack;
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
  title: string;
  problems: DiagnosticSeedProblem[];
};

function makeProblem(
  exam: ExamTrack,
  prefix: string,
  number: number,
  difficultyBand: "EASY" | "MEDIUM" | "HARD",
  topicKey: string,
  techniqueTags: string[],
  statement: string,
  answer: string,
  solutionSketch: string
): DiagnosticSeedProblem {
  return {
    id: `${prefix}_p${number}`,
    number,
    statement,
    statementFormat: StatementFormat.MARKDOWN_LATEX,
    choices: null,
    answer,
    answerFormat: AnswerFormat.INTEGER,
    examTrack: exam,
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
    title: "AMC 8 Diagnostic Test",
    problems: [
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        1,
        "EASY",
        "arithmetic.four_operations",
        ["working_backwards"],
        "A box contains 12 pencils. Three students each take 2 pencils. How many pencils remain in the box?",
        "6",
        "Start with 12 pencils. Three students take 2 each, so 6 pencils are removed. Subtract 6 from 12."
      ),
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        2,
        "EASY",
        "arithmetic.ratios_and_rates",
        ["ratio_reasoning"],
        "A recipe uses 4 cups of flour for 8 muffins. How many cups of flour are needed for 20 muffins?",
        "10",
        "Use proportional reasoning. The recipe needs 4/8 = 1/2 cup per muffin. For 20 muffins, multiply 20 by 1/2."
      ),
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        3,
        "EASY",
        "geometry.area_and_perimeter",
        ["area_volume_modeling"],
        "A rectangle has perimeter 34 and one side length 7. What is its area?",
        "63",
        "Use 2(l+w)=34, so l+w=17. If one side is 7, the other is 10. Multiply the side lengths."
      ),
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        4,
        "EASY",
        "algebra.linear_equations",
        ["algebra_setup", "equation_solving"],
        "The average of five numbers is 14. Four of the numbers are 10, 12, 14, and 18. What is the fifth number?",
        "16",
        "An average of 14 over 5 numbers gives a total of 70. Add the four known numbers to get 54, then subtract from 70."
      ),
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        5,
        "MEDIUM",
        "arithmetic.percents",
        ["working_backwards", "ratio_reasoning"],
        "An item is marked up by 25% and then discounted by 20%. If the original price was 100 dollars, what is the final price in dollars?",
        "100",
        "A 25% markup changes 100 to 125. A 20% discount multiplies by 0.8, so compute 125 times 0.8."
      ),
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        6,
        "MEDIUM",
        "geometry.angle_chasing",
        ["angle_chasing", "equation_solving"],
        "Two angles form a linear pair. One angle is four times the other. What is the larger angle, in degrees?",
        "144",
        "Let the smaller angle be x. Then the larger is 4x, and x + 4x = 180. Solve for x and then take the larger angle."
      ),
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        7,
        "MEDIUM",
        "number_theory.divisibility",
        ["divisibility_reasoning", "pattern_finding"],
        "What is the greatest integer $n$ such that 72 is divisible by $2^n$?",
        "3",
        "Prime-factor 72. Since 72 = 8 times 9 = 2^3 times 3^2, the highest power of 2 dividing 72 is 2^3."
      ),
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        8,
        "MEDIUM",
        "counting.counting_principles",
        ["counting_principle", "casework"],
        "How many 3-digit positive integers have digits that are strictly increasing from left to right?",
        "84",
        "Choose any 3 distinct digits from 0 through 9, but the first digit cannot be 0 in the increasing arrangement. Equivalently choose 3 digits from 1 through 9, then place them in increasing order."
      ),
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        9,
        "HARD",
        "number_theory.gcd_lcm",
        ["divisibility_reasoning", "working_backwards"],
        "Two positive integers have greatest common divisor 12 and least common multiple 180. If one of the integers is 60, what is the other integer?",
        "36",
        "Use ab = gcd(a,b) times lcm(a,b). So 60 times the other integer equals 12 times 180. Solve for the other integer."
      ),
      makeProblem(
        ExamTrack.AMC8,
        "diag_amc8",
        10,
        "HARD",
        "arithmetic.word_problems",
        ["working_backwards", "algebra_setup"],
        "A set of seven numbers has mean 8 and median 7. The smallest number is 2 and the largest number is 14. If the second-smallest number is 5 and the second-largest number is 11, what is the sum of the remaining three numbers?",
        "31",
        "A mean of 8 over 7 numbers gives total 56. The known outer four numbers sum to 2 + 5 + 11 + 14 = 32. Subtract to get the sum of the remaining three numbers."
      )
    ]
  },
  {
    id: "seed_diagnostic_amc10_v1",
    contest: Contest.AMC10,
    year: 2099,
    exam: "A",
    title: "AMC 10 Diagnostic Test",
    problems: [
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        1,
        "EASY",
        "algebra.linear_equations",
        ["algebra_setup", "equation_solving"],
        "If 3x + 5 = 2x + 19, what is x?",
        "14",
        "Move the x-terms to one side and constants to the other. Subtract 2x from both sides and then subtract 5 from both sides."
      ),
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        2,
        "EASY",
        "geometry.triangles",
        ["angle_chasing", "diagram_reading"],
        "Triangle ABC is isosceles with AB = AC. If angle A measures 40 degrees, what is the measure of angle B, in degrees?",
        "70",
        "In an isosceles triangle with AB = AC, base angles B and C are equal. The two base angles sum to 180 - 40 = 140, so divide by 2."
      ),
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        3,
        "EASY",
        "number_theory.modular_arithmetic",
        ["modular_reasoning", "pattern_finding"],
        "What is the remainder when $7^{100}$ is divided by 10?",
        "1",
        "Look at powers of 7 modulo 10. The last digits cycle 7, 9, 3, 1 with period 4. Since 100 is a multiple of 4, use the fourth number in the cycle."
      ),
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        4,
        "EASY",
        "geometry.coordinate_geometry",
        ["coordinate_modeling", "algebra_setup"],
        "The lines y = 2x + 1 and y = -x + 10 intersect at the point (a, b). What is a + b?",
        "10",
        "Set the two expressions for y equal: 2x + 1 = -x + 10. Solve for x, substitute back to get y, then add the coordinates."
      ),
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        5,
        "MEDIUM",
        "algebra.functions",
        ["function_analysis", "pattern_finding"],
        "A function f satisfies f(x + 1) = 2f(x) for all real x, and f(0) = 3. What is f(5)?",
        "96",
        "Each time x increases by 1, the function value doubles. Start from f(0) = 3 and double five times."
      ),
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        6,
        "MEDIUM",
        "geometry.circles",
        ["diagram_reading", "algebra_setup"],
        "A circle has center O. From an external point P, a tangent PT to the circle is drawn, and PT = 8. If the radius of the circle is 6, what is OP?",
        "10",
        "Radius OT is perpendicular to tangent PT, so triangle OPT is right. Use the Pythagorean theorem with legs 6 and 8."
      ),
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        7,
        "MEDIUM",
        "number_theory.divisors_and_primes",
        ["divisibility_reasoning", "pattern_finding"],
        "How many integers from 1 through 1000 have exactly three positive divisors?",
        "11",
        "A number has exactly three positive divisors exactly when it is the square of a prime. Count prime squares up to 1000, so count primes up to floor(sqrt(1000)) = 31."
      ),
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        8,
        "MEDIUM",
        "counting.counting_principles",
        ["counting_principle", "modular_reasoning"],
        "How many integers from 1 through 200 leave remainder 3 when divided by 7?",
        "29",
        "These numbers are 3, 10, 17, and so on, forming an arithmetic sequence with difference 7. Find how many such terms are at most 200."
      ),
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        9,
        "HARD",
        "counting.geometry_configurations",
        ["counting_principle", "casework"],
        "Six points lie on a circle, and all chords connecting pairs of points are drawn. How many interior intersection points are formed by the chords if no three chords intersect at the same interior point?",
        "15",
        "Each interior intersection is determined by choosing 4 of the 6 points, because the two diagonals of that quadrilateral intersect once. Count combinations of 6 points taken 4 at a time."
      ),
      makeProblem(
        ExamTrack.AMC10,
        "diag_amc10",
        10,
        "HARD",
        "number_theory.factorials",
        ["divisibility_reasoning", "working_backwards"],
        "What is the smallest positive integer $n$ such that $n!$ is divisible by $2^{10}$?",
        "12",
        "Count the powers of 2 in n! using floor(n/2) + floor(n/4) + floor(n/8) + .... Test values until the total first reaches 10."
      )
    ]
  },
  {
    id: "seed_diagnostic_amc12_v1",
    contest: Contest.AMC12,
    year: 2100,
    exam: "A",
    title: "AMC 12 Diagnostic Test",
    problems: [
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        1,
        "EASY",
        "algebra.linear_equations",
        ["algebra_setup", "equation_solving"],
        "If 2x + 3 = 11, what is x?",
        "4",
        "Subtract 3 from both sides and then divide by 2."
      ),
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        2,
        "EASY",
        "algebra.complex_numbers",
        ["pattern_finding"],
        "How many complex numbers $z$ satisfy $z^2=-16$?",
        "2",
        "The equation z^2 = -16 has the two square roots of -16, namely positive and negative 4i."
      ),
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        3,
        "EASY",
        "geometry.triangles",
        ["area_volume_modeling"],
        "A triangle has side lengths 13, 14, and 15. What is its area?",
        "84",
        "Use Heron's formula. The semiperimeter is (13 + 14 + 15)/2 = 21, then compute sqrt(21·8·7·6)."
      ),
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        4,
        "EASY",
        "algebra.logarithms",
        ["equation_solving"],
        "If $\\log_2(x)+\\log_2(x-2)=3$, what is $x$?",
        "4",
        "Combine the logarithms into log_2(x(x-2)) = 3, so x(x-2) = 8. Solve the quadratic and keep only the solution with x > 2."
      ),
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        5,
        "MEDIUM",
        "algebra.sequences_and_recursions",
        ["pattern_finding", "working_backwards"],
        "A sequence is defined by $a_1=2$ and $a_{n+1}=3a_n+1$ for $n\\ge 1$. What is $a_4$?",
        "67",
        "Compute the terms step by step: a_2 = 3·2 + 1, then a_3 = 3a_2 + 1, then a_4 = 3a_3 + 1."
      ),
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        6,
        "MEDIUM",
        "trigonometry.general",
        ["trigonometric_modeling"],
        "If $\\sin(\\theta)=\\tfrac{3}{5}$ and $\\theta$ is acute, what is the value of $25\\cos(2\\theta)$?",
        "7",
        "Since sin(theta) = 3/5 and theta is acute, cos(theta) = 4/5. Then use cos(2theta) = cos^2(theta) - sin^2(theta)."
      ),
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        7,
        "MEDIUM",
        "counting.combinations",
        ["counting_principle", "casework"],
        "How many 3-element subsets of {1,2,3,4,5,6,7,8,9,10} have even sum?",
        "60",
        "A 3-number sum is even when you choose either 3 even numbers or 2 odd numbers and 1 even number. Count both cases and add them."
      ),
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        8,
        "MEDIUM",
        "geometry.coordinate_geometry",
        ["coordinate_modeling", "algebra_setup"],
        "The parabola $y=x^2$ and the line $y=2x+3$ intersect at two points. What is the square of the distance between these two points?",
        "80",
        "Set x^2 = 2x + 3 to find the two intersection x-values. Then compute the corresponding y-values and use the distance formula; square the result at the end."
      ),
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        9,
        "HARD",
        "number_theory.gcd_and_coprime",
        ["divisibility_reasoning", "modular_reasoning"],
        "How many positive integers $n$ with $n\\le 100$ satisfy $\\gcd(n,30)=1$?",
        "26",
        "Numbers coprime to 30 are not divisible by 2, 3, or 5. In each block of 30 consecutive integers there are phi(30) = 8 such numbers; then count the remainder up to 100."
      ),
      makeProblem(
        ExamTrack.AMC12,
        "diag_amc12",
        10,
        "HARD",
        "probability.expected_value",
        ["probability_setup", "working_backwards"],
        "A fair coin is flipped repeatedly until two consecutive heads first appear. What is the expected number of flips?",
        "6",
        "Use states: start state and state 'last flip was H'. Write expectation equations for each state and solve the system."
      )
    ]
  }
];
