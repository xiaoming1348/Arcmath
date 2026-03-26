import path from "node:path";
import {
  DIFFICULTY_BANDS,
  importProblemSetSchema,
  type ImportProblemSetInput,
  type DifficultyBand,
  type DiagnosticExam
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
  AMC8_2015: {
    2: {
      choices: ["\\frac{11}{32}", "\\frac{3}{8}", "\\frac{13}{32}", "\\frac{7}{16}", "\\frac{15}{32}"]
    },
    7: {
      choices: ["\\frac{1}{9}", "\\frac{2}{9}", "\\frac{4}{9}", "\\frac{1}{2}", "\\frac{5}{9}"]
    },
    11: {
      choices: ["\\frac{1}{22050}", "\\frac{1}{21000}", "\\frac{1}{10500}", "\\frac{1}{2100}", "\\frac{1}{1050}"]
    },
    16: {
      choices: ["\\frac{2}{15}", "\\frac{4}{11}", "\\frac{11}{30}", "\\frac{3}{8}", "\\frac{11}{15}"]
    },
    18: {
      choices: ["21", "31", "36", "40", "42"]
    },
    19: {
      choices: ["\\frac{1}{6}", "\\frac{1}{5}", "\\frac{1}{4}", "\\frac{1}{3}", "\\frac{1}{2}"]
    },
    21: {
      choices: ["6\\sqrt{2}", "9", "12", "9\\sqrt{2}", "32"]
    },
    25: {
      choices: ["9", "12\\frac{1}{2}", "15", "15\\frac{1}{2}", "17"]
    }
  },
  AMC10_2015_A: {
    1: {
      choices: ["-125", "-120", "\\frac{1}{5}", "\\frac{5}{24}", "25"]
    },
    4: {
      choices: ["\\frac{1}{12}", "\\frac{1}{6}", "\\frac{1}{4}", "\\frac{1}{3}", "\\frac{1}{2}"]
    },
    6: {
      choices: ["\\frac{5}{4}", "\\frac{3}{2}", "\\frac{9}{5}", "2", "\\frac{5}{2}"]
    },
    11: {
      choices: ["\\frac{2}{7}", "\\frac{3}{7}", "\\frac{12}{25}", "\\frac{16}{25}", "\\frac{3}{4}"]
    },
    12: {
      choices: ["1", "\\frac{\\pi}{2}", "2", "\\sqrt{1+\\pi}", "1+\\sqrt{\\pi}"]
    },
    15: {
      choices: ["0", "1", "2", "3", "infinitely many"]
    },
    16: {
      choices: ["10", "15", "20", "25", "30"]
    },
    17: {
      choices: ["2\\sqrt{6}", "2+2\\sqrt{3}", "6", "3+2\\sqrt{3}", "6+\\frac{\\sqrt{3}}{3}"]
    },
    20: {
      answerFormat: "MULTIPLE_CHOICE",
      answer: "B",
      choices: ["100", "102", "104", "106", "108"]
    },
    21: {
      choices: ["3\\sqrt{2}", "2\\sqrt{5}", "\\frac{24}{5}", "3\\sqrt{3}", "\\frac{24}{5}\\sqrt{2}"]
    },
    25: {
      choices: ["59", "60", "61", "62", "63"]
    }
  },
  AMC12_2015_A: {
    1: {
      choices: ["-125", "-120", "\\frac{1}{5}", "\\frac{5}{24}", "25"]
    },
    4: {
      choices: ["\\frac{5}{4}", "\\frac{3}{2}", "\\frac{9}{5}", "2", "\\frac{5}{2}"]
    },
    16: {
      choices: ["3\\sqrt{2}", "2\\sqrt{5}", "\\frac{24}{5}", "3\\sqrt{3}", "\\frac{24}{5}\\sqrt{2}"]
    },
    17: {
      choices: ["\\frac{47}{256}", "\\frac{3}{16}", "\\frac{49}{256}", "\\frac{25}{128}", "\\frac{51}{256}"]
    },
    21: {
      choices: ["5\\sqrt{2}+4", "\\sqrt{17}+7", "6\\sqrt{2}+3", "\\sqrt{15}+8", "12"]
    }
  },
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
  AMC8_2019: {
    2: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/e/0/7/e0752885e3cff488bd89893347c595b7c570d339.png",
      diagramImageAlt:
        "Rectangle ABCD formed from three identical rectangles, with one vertical rectangle on the right and two stacked horizontal rectangles on the left."
    },
    5: {
      choices: ["A", "B", "C", "D", "E"],
      diagramImageUrl:
        "https://artofproblemsolving.com/wiki/images/thumb/5/56/2019_AMC_8_-4_Image_1.png/900px-2019_AMC_8_-4_Image_1.png",
      diagramImageAlt:
        "The first half of the graph answer choices for the tortoise and hare race, with distance versus time curves labeled by answer choice.",
      choicesImageUrl:
        "https://artofproblemsolving.com/wiki/images/thumb/6/63/2019_AMC_8_-4_Image_2.png/600px-2019_AMC_8_-4_Image_2.png",
      choicesImageAlt:
        "The second half of the graph answer choices for the tortoise and hare race, continuing the distance versus time options."
    },
    6: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/2/e/f/2ef50880b9e105fcb40568742659a26c359c6c1a.png",
      diagramImageAlt:
        "An 8 by 8 square grid of equally spaced points with center point P marked, used to count symmetry lines through a random point Q."
    },
    12: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/3/a/8/3a8268817eeb341bf2b3a7be997d68e5f2fd5c56.png",
      diagramImageAlt: "Three views of a painted cube with face colors R, W, G, B, A, and P.",
      choices: ["red", "white", "green", "brown", "purple"]
    },
    10: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/e/1/7/e1796ef723acbb9a4cfeacf57e69202cddf3e0d3.png",
      diagramImageAlt: "A horizontal bar graph showing the number of students at soccer practice on Monday through Friday.",
      choices: [
        "The mean increases by 1 and the median does not change.",
        "The mean increases by 1 and the median increases by 1.",
        "The mean increases by 1 and the median increases by 5.",
        "The mean increases by 5 and the median increases by 1.",
        "The mean increases by 5 and the median increases by 5."
      ]
    },
    17: {
      statement:
        "What is the value of the product \\[\\left(\\frac{1\\cdot 3}{2\\cdot 2}\\right)\\left(\\frac{2\\cdot 4}{3\\cdot 3}\\right)\\left(\\frac{3\\cdot 5}{4\\cdot 4}\\right)\\cdots\\left(\\frac{97\\cdot 99}{98\\cdot 98}\\right)\\left(\\frac{98\\cdot 100}{99\\cdot 99}\\right)?\\]",
      choices: ["\\frac{1}{2}", "\\frac{50}{99}", "\\frac{9800}{9801}", "\\frac{100}{99}", "50"]
    },
    25: {
      choices: ["105", "114", "190", "210", "380"]
    }
  },
  AMC8_2020: {
    13: {
      statement:
        "Jamal has a drawer containing $6$ green socks, $18$ purple socks, and $12$ orange socks. After adding more purple socks, Jamal noticed that there is now a $60\\%$ chance that a sock randomly selected from the drawer is purple. How many purple socks did Jamal add?",
      choices: ["6", "9", "12", "18", "24"]
    },
    19: {
      statement:
        "A number is called flippy if its digits alternate between two distinct digits. For example, $2020$ and $37373$ are flippy, but $3883$ and $123123$ are not. How many five-digit flippy numbers are divisible by $15$?",
      choices: ["3", "4", "5", "6", "8"]
    },
    20: {
      statement:
        "A scientist walking through a forest recorded as integers the heights of $5$ trees standing in a row. She observed that each tree was either twice as tall or half as tall as the one to its right. Unfortunately some of her data was lost when rain fell on her notebook. Her notes are shown below, with blanks indicating the missing numbers. Based on her observations, the scientist was able to reconstruct the lost data. What was the average height of the trees, in meters?\n\n| Tree | Height |\n| --- | --- |\n| Tree 1 | ___ meters |\n| Tree 2 | 11 meters |\n| Tree 3 | ___ meters |\n| Tree 4 | ___ meters |\n| Tree 5 | ___ meters |\n| Average height | ___.2 meters |",
      choices: ["22.2", "24.2", "33.2", "35.2", "37.2"]
    },
    24: {
      statement:
        "A large square region is paved with $n^2$ gray square tiles, each measuring $s$ inches on a side. A border $d$ inches wide surrounds each tile. The figure below shows the case for $n=3$. When $n=24$, the $576$ gray tiles cover $64\\%$ of the area of the large square region. What is the ratio $\\frac{d}{s}$ for this larger value of $n$?",
      choices: ["\\frac{6}{25}", "\\frac{1}{4}", "\\frac{9}{25}", "\\frac{7}{16}", "\\frac{9}{16}"]
    }
  },
  AMC8_2022: {
    4: {
      statement:
        "The letter $M$ in the figure below is first reflected over the line $q$ and then reflected over the line $p$. What is the resulting image?",
      choices: ["A", "B", "C", "D", "E"],
      diagramImageUrl: "https://latex.artofproblemsolving.com/c/3/8/c38b67d113d5fbf1b6d6eae0d87161b539dbd849.png",
      diagramImageAlt:
        "An upright letter M together with two reflection lines p and q, where p is horizontal and q is a diagonal line.",
      choicesImageUrl: "https://latex.artofproblemsolving.com/1/9/b/19b58c8f6aafe00e0ad5454583fda04c3567f944.png",
      choicesImageAlt:
        "Five answer-choice diagrams labeled A through E showing different reflected positions and orientations of the letter M relative to the same two lines."
    },
    10: {
      statement:
        "One sunny day, Ling decided to take a hike in the mountains. She left her house at $8\\,\\textsc{am}$, drove at a constant speed of $45$ miles per hour, and arrived at the hiking trail at $10\\,\\textsc{am}$. After hiking for $3$ hours, Ling drove home at a constant speed of $60$ miles per hour. Which of the following graphs best illustrates the distance between Ling's car and her house over the course of her trip?",
      choices: ["A", "B", "C", "D", "E"],
      choicesImageUrl: "https://latex.artofproblemsolving.com/c/b/1/cb1e2b28781a01015ec88e8948e5bda92a234383.png",
      choicesImageAlt:
        "Five candidate distance-versus-time graphs labeled A through E, showing Ling's car leaving home, remaining parked during the hike, and returning home."
    },
    19: {
      statement:
        "Mr. Ramos gave a test to his class of $20$ students. The dot plot below shows the distribution of test scores. Later Mr. Ramos discovered that there was a scoring error on one of the questions. He regraded the tests, awarding some of the students $5$ extra points, which increased the median test score to $85$. What is the minimum number of students who received extra points?\n\n(Note that the median test score equals the average of the $2$ scores in the middle if the $20$ test scores are arranged in increasing order.)",
      choices: ["2", "3", "4", "5", "6"],
      diagramImageUrl: "https://latex.artofproblemsolving.com/8/f/1/8f168ff6d1e7635e68e0139420bed9ecfc2e4993.png",
      diagramImageAlt:
        "A dot plot of 20 test scores with ticks at 65, 70, 75, 80, 85, 90, 95, and 100."
    },
    25: {
      statement:
        "A cricket randomly hops between $4$ leaves, on each turn hopping to one of the other $3$ leaves with equal probability. After $4$ hops what is the probability that the cricket has returned to the leaf where it started?",
      choices: ["\\frac{2}{9}", "\\frac{19}{80}", "\\frac{20}{81}", "\\frac{1}{4}", "\\frac{7}{27}"],
      diagramImageUrl:
        "https://artofproblemsolving.com/wiki/images/thumb/f/f0/2022_AMC_8_Problem_25_Picture.jpg/600px-2022_AMC_8_Problem_25_Picture.jpg",
      diagramImageAlt: "Four leaves connected in a symmetric arrangement, illustrating the cricket's possible hops among the leaves."
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
  AMC10_2019_A: {
    1: {
      statement: "What is the value of \\[2^{\\left(0^{\\left(1^9\\right)}\\right)}+\\left(\\left(2^0\\right)^1\\right)^9?\\]",
      choices: ["0", "1", "2", "3", "4"]
    },
    2: {
      statement: "What is the hundreds digit of $(20!-15!)?$",
      choices: ["0", "1", "2", "4", "5"]
    },
    24: {
      choices: ["243", "244", "245", "246", "247"]
    },
    25: {
      choices: ["31", "32", "33", "34", "35"]
    },
    12: {
      choices: ["\\mu<d<M", "M<d<\\mu", "d=M=\\mu", "d<M<\\mu", "d<\\mu<M"]
    },
    8: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/c/6/6/c66986a019a481aa0dad6c2a690111ffd5a52014.png",
      diagramImageAlt:
        "A repeating infinite pattern of alternating square-and-diagonal motifs arranged along a horizontal line l.",
      choices: ["0", "1", "2", "3", "4"]
    },
    21: {
      choices: ["2\\sqrt{3}", "4", "3\\sqrt{2}", "2\\sqrt{5}", "5"]
    },
    22: {
      choices: ["\\frac{1}{3}", "\\frac{7}{16}", "\\frac{1}{2}", "\\frac{9}{16}", "\\frac{2}{3}"]
    },
    23: {
      choices: ["5743", "5885", "5979", "6001", "6011"]
    },
    16: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/f/c/4/fc485e1337895925d85375cce1a9d3908ca8b7e3.png",
      diagramImageAlt:
        "Thirteen unit circles packed inside a larger circle, with the shaded region outside the small circles and inside the large circle.",
      choices: [
        "4\\pi\\sqrt{3}",
        "7\\pi",
        "\\pi(3\\sqrt{3}+2)",
        "10\\pi(\\sqrt{3}-1)",
        "\\pi(\\sqrt{3}+6)"
      ]
    }
  },
  AMC10_2020_A: {
    19: {
      statement:
        "A regular dodecahedron (the polyhedron consisting of 12 congruent regular pentagonal faces) floats in space with two horizontal faces. Note that there is a ring of five slanted faces adjacent to the top face, and a ring of five slanted faces adjacent to the bottom face. How many ways are there to move from the top face to the bottom face via a sequence of adjacent faces so that each face is visited at most once and moves are not permitted from the bottom ring to the top ring?"
    },
    12: {
      statement:
        "Triangle $AMC$ is isosceles with $AM = AC$. Medians $\\overline{MV}$ and $\\overline{CU}$ are perpendicular to each other, and $MV = CU = 12$. What is the area of $\\triangle AMC$?",
      choices: ["48", "72", "96", "144", "192"]
    },
    13: {
      choices: ["\\frac{1}{2}", "\\frac{5}{8}", "\\frac{2}{3}", "\\frac{3}{4}", "\\frac{7}{8}"]
    },
    14: {
      statement:
        "Real numbers $x$ and $y$ satisfy $x + y = 4$ and $x \\cdot y = -2$. What is the value of \\[x + \\frac{x^3}{y^2} + \\frac{y^3}{x^2} + y?\\]",
      choices: ["360", "400", "420", "440", "480"]
    },
    24: {
      statement:
        "Let $n$ be the least positive integer greater than $1000$ for which \\[\\gcd(63, n+120)=21 \\quad \\text{and} \\quad \\gcd(n+63, 120)=60.\\] What is the sum of the digits of $n$?",
      choices: ["12", "15", "18", "21", "24"]
    }
  },
  AMC10_2021_A: {
    12: {
      statement:
        "Two right circular cones with vertices facing down contain the same amount of liquid. The radii of the tops of the liquid surfaces are 3 cm and 6 cm. Into each cone is dropped a spherical marble of radius 1 cm, which sinks to the bottom and is completely submerged without spilling any liquid. What is the ratio of the rise of the liquid level in the narrow cone to the rise of the liquid level in the wide cone?",
      choices: ["1:1", "47:43", "2:1", "40:13", "4:1"]
    },
    17: {
      statement:
        "Trapezoid $ABCD$ has $\\overline{AB}\\parallel\\overline{CD}$, $BC=CD=43$, and $\\overline{AD}\\perp\\overline{BD}$. Let $O$ be the intersection of the diagonals $\\overline{AC}$ and $\\overline{BD}$, and let $P$ be the midpoint of $\\overline{BD}$. Given that $OP=11$, the length of $AD$ can be written in the form $m\\sqrt{n}$, where $m$ and $n$ are positive integers and $n$ is not divisible by the square of any prime. What is $m+n$?",
      choices: ["65", "132", "157", "194", "215"]
    },
    7: {
      statement:
        "Tom has a collection of $13$ snakes, $4$ of which are purple and $5$ of which are happy. He observes that all of his happy snakes can add, none of his purple snakes can subtract, and all of his snakes that can't subtract also can't add. Which of these conclusions can be drawn about Tom's snakes?",
      choices: [
        "Purple snakes can add.",
        "Purple snakes are happy.",
        "Snakes that can add are purple.",
        "Happy snakes are not purple.",
        "Happy snakes can't subtract."
      ]
    },
    18: {
      statement:
        "Let $f$ be a function defined on the set of positive rational numbers with the property that $f(a\\cdot b)=f(a)+f(b)$ for all positive rational numbers $a$ and $b$. Suppose that $f$ also has the property that $f(p)=p$ for every prime number $p$. For which of the following numbers $x$ is $f(x)<0$?",
      choices: ["\\frac{17}{32}", "\\frac{11}{16}", "\\frac{7}{9}", "\\frac{7}{6}", "\\frac{25}{11}"]
    }
  },
  AMC10_2022_A: {
    12: {
      statement:
        "On Halloween $31$ children walked into the principal's office asking for candy. They can be classified into three types: Some always lie; some always tell the truth; and some alternately lie and tell the truth. The alternaters arbitrarily choose their first response, either a lie or the truth, but each subsequent statement has the opposite truth value from its predecessor. The principal asked everyone the same three questions in this order.\n\n\"Are you a truth-teller?\" The principal gave a piece of candy to each of the $22$ children who answered yes.\n\n\"Are you an alternater?\" The principal gave a piece of candy to each of the $15$ children who answered yes.\n\n\"Are you a liar?\" The principal gave a piece of candy to each of the $9$ children who answered yes.\n\nHow many pieces of candy in all did the principal give to the children who always tell the truth?",
      choices: ["7", "12", "21", "27", "31"]
    }
  },
  AMC12_2020_A: {
    6: {
      statement:
        "In the plane, $3$ of the unit squares have been shaded. What is the least number of additional unit squares that must be shaded so that the resulting arrangement has two lines of symmetry?"
    },
    13: {
      statement:
        "There are integers $a$, $b$, and $c$, each greater than $1$, such that \\[\\sqrt[a]{N\\sqrt[b]{N\\sqrt[c]{N}}} = \\sqrt[36]{N^{25}}\\] for all $N \\neq 1$. What is $b$?",
      choices: ["2", "3", "4", "5", "6"]
    },
    24: {
      choices: ["1+\\sqrt{2}", "\\sqrt{7}", "\\frac{8}{3}", "\\sqrt{5+\\sqrt{5}}", "2\\sqrt{2}"]
    }
  },
  AMC12_2021_A: {
    2: {
      choices: [
        "It is never true.",
        "It is true if and only if $ab=0$.",
        "It is true if and only if $a+b\\ge 0$.",
        "It is true if and only if $ab=0$ and $a+b\\ge 0$.",
        "It is always true."
      ]
    },
    4: {
      statement:
        "Tom has a collection of $13$ snakes, $4$ of which are purple and $5$ of which are happy. He observes that all of his happy snakes can add, none of his purple snakes can subtract, and all of his snakes that can't subtract also can't add. Which of these conclusions can be drawn about Tom's snakes?",
      choices: [
        "Purple snakes can add.",
        "Purple snakes are happy.",
        "Snakes that can add are purple.",
        "Happy snakes are not purple.",
        "Happy snakes can't subtract."
      ]
    },
    10: {
      statement:
        "Two right circular cones with vertices facing down contain the same amount of liquid. The radii of the tops of the liquid surfaces are 3 cm and 6 cm. Into each cone is dropped a spherical marble of radius 1 cm, which sinks to the bottom and is completely submerged without spilling any liquid. What is the ratio of the rise of the liquid level in the narrow cone to the rise of the liquid level in the wide cone?",
      choices: ["1:1", "47:43", "2:1", "40:13", "4:1"]
    },
    17: {
      statement:
        "Trapezoid $ABCD$ has $\\overline{AB}\\parallel\\overline{CD}$, $BC=CD=43$, and $\\overline{AD}\\perp\\overline{BD}$. Let $O$ be the intersection of the diagonals $\\overline{AC}$ and $\\overline{BD}$, and let $P$ be the midpoint of $\\overline{BD}$. Given that $OP=11$, the length of $AD$ can be written in the form $m\\sqrt{n}$, where $m$ and $n$ are positive integers and $n$ is not divisible by the square of any prime. What is $m+n$?",
      choices: ["65", "132", "157", "194", "215"]
    },
    18: {
      statement:
        "Let $f$ be a function defined on the set of positive rational numbers with the property that $f(a\\cdot b)=f(a)+f(b)$ for all positive rational numbers $a$ and $b$. Suppose that $f$ also has the property that $f(p)=p$ for every prime number $p$. For which of the following numbers $x$ is $f(x)<0$?",
      choices: ["\\frac{17}{32}", "\\frac{11}{16}", "\\frac{7}{9}", "\\frac{7}{6}", "\\frac{25}{11}"]
    }
  },
  AMC12_2022_A: {
    9: {
      statement:
        "On Halloween $31$ children walked into the principal's office asking for candy. They can be classified into three types: Some always lie; some always tell the truth; and some alternately lie and tell the truth. The alternaters arbitrarily choose their first response, either a lie or the truth, but each subsequent statement has the opposite truth value from its predecessor. The principal asked everyone the same three questions in this order.\n\n\"Are you a truth-teller?\" The principal gave a piece of candy to each of the $22$ children who answered yes.\n\n\"Are you an alternater?\" The principal gave a piece of candy to each of the $15$ children who answered yes.\n\n\"Are you a liar?\" The principal gave a piece of candy to each of the $9$ children who answered yes.\n\nHow many pieces of candy in all did the principal give to the children who always tell the truth?",
      choices: ["7", "12", "21", "27", "31"]
    }
  },
  AIME_2021_I: {
    2: {
      statement:
        "ABCD is a rectangle with side lengths $AB=3$ and $BC=11$, and $AECF$ is a rectangle with side lengths $AF=7$ and $FC=9$. The area of the shaded region common to the interiors of both rectangles is $m/n$, where $m$ and $n$ are relatively prime positive integers. Find $m+n$."
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
    15: {
      topicKey: "trigonometry.general",
      techniqueTags: ["trigonometric_modeling", "equation_solving"]
    },
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
  AMC12_2019_A: {
    2: {
      choices: ["50", "66+\\frac{2}{3}", "150", "200", "450"]
    },
    5: {
      choices: ["4", "4\\sqrt{2}", "6", "8", "6\\sqrt{2}"]
    },
    6: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/c/6/6/c66986a019a481aa0dad6c2a690111ffd5a52014.png",
      diagramImageAlt:
        "A repeating infinite pattern of alternating square-and-diagonal motifs arranged along a horizontal line l.",
      choices: ["0", "1", "2", "3", "4"]
    },
    12: {
      choices: ["\\frac{25}{2}", "20", "\\frac{45}{2}", "25", "32"]
    },
    10: {
      diagramImageUrl: "https://latex.artofproblemsolving.com/f/c/4/fc485e1337895925d85375cce1a9d3908ca8b7e3.png",
      diagramImageAlt:
        "Thirteen unit circles packed inside a larger circle, with the shaded region outside the small circles and inside the large circle.",
      choices: [
        "4\\pi\\sqrt{3}",
        "7\\pi",
        "\\pi(3\\sqrt{3}+2)",
        "10\\pi(\\sqrt{3}-1)",
        "\\pi(\\sqrt{3}+6)"
      ]
    },
    20: {
      choices: ["\\frac{1}{3}", "\\frac{7}{16}", "\\frac{1}{2}", "\\frac{9}{16}", "\\frac{2}{3}"]
    },
    21: {
      choices: ["18", "72-36\\sqrt{2}", "36", "72", "72+36\\sqrt{2}"]
    },
    22: {
      choices: ["42", "86", "92", "114", "130"]
    },
    23: {
      choices: ["8", "9", "10", "11", "12"]
    },
    24: {
      choices: ["31", "32", "33", "34", "35"]
    },
    25: {
      choices: ["10", "11", "13", "14", "15"]
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

function cleanImportedStatement(value: string): string {
  return value.replace(/\s*\$\\textbf\{\s*$/u, "").trim();
}

function cleanChoiceMathSyntax(value: string): string {
  return value
    .replace(/^\\\s*([0-9])([0-9])$/u, "\\frac{$1}{$2}")
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

function inferExamTrack(contest: string): DiagnosticExam | null {
  if (contest === "AMC8" || contest === "AMC10" || contest === "AMC12") {
    return contest;
  }

  return null;
}

export function inferTopicKey(statement: string, answerFormat: ProblemInput["answerFormat"]): string | null {
  const text = statement.toLowerCase();

  if (/necessarily follows logically|must be true|cannot be true|always true|logic/u.test(text)) {
    return "logic.general";
  }

  if (/\bsin\b|\bcos\b|\btan\b|\bcot\b|\bsec\b|\bcsc\b|trigon/u.test(text)) {
    return "trigonometry.general";
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

export function inferTechniqueTags(
  statement: string,
  topicKey: string | null,
  answerFormat: ProblemInput["answerFormat"]
): string[] {
  const text = statement.toLowerCase();
  const tags = new Set<string>();

  if (topicKey?.startsWith("probability.")) {
    tags.add("probability_setup");
  }
  if (topicKey?.startsWith("trigonometry.")) {
    tags.add("trigonometric_modeling");
  }
  if (topicKey?.startsWith("counting.")) {
    tags.add("counting_principle");
  }
  if (topicKey === "geometry.coordinate_geometry") {
    tags.add("coordinate_modeling");
  }
  if (topicKey?.startsWith("geometry.")) {
    tags.add("diagram_reading");
  }
  if (topicKey?.startsWith("number_theory.")) {
    tags.add("divisibility_reasoning");
  }
  if (topicKey?.startsWith("algebra.")) {
    tags.add("algebra_setup");
  }
  if (topicKey === "arithmetic.word_problems") {
    tags.add("working_backwards");
  }
  if (answerFormat === "INTEGER" && topicKey?.startsWith("number_theory.")) {
    tags.add("modular_reasoning");
  }
  if (/how many|number of ways|arrangements|permut|combination|committee|select|choose/u.test(text)) {
    tags.add("casework");
  }
  if (/probability|random|coin|dice|die\b/u.test(text)) {
    tags.add("probability_setup");
  }
  if (/coordinate|slope|origin|point \(/u.test(text)) {
    tags.add("coordinate_modeling");
  }
  if (/triangle|circle|polygon|parallelogram|segment|angle|diameter|radius|square|rectangle/u.test(text)) {
    tags.add("diagram_reading");
  }
  if (/maximum|minimum|largest|smallest|least|greatest|optimi/u.test(text)) {
    tags.add("optimization");
  }
  if (/symmetr/u.test(text)) {
    tags.add("symmetry");
  }
  if (/remainder|divisible|prime|factor|multiple/u.test(text)) {
    tags.add("divisibility_reasoning");
  }
  if (/remainder|mod/u.test(text)) {
    tags.add("modular_reasoning");
  }
  if (/solve for|equation|expression|function|polynomial/u.test(text)) {
    tags.add("equation_solving");
  }
  if (/average|mean|estimate|about|approximately/u.test(text)) {
    tags.add("estimation");
  }

  return [...tags];
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
      const statement = normalizeWhitespace(cleanImportedStatement(problem.statement ?? ""));
      const normalizedChoices = normalizeImportedChoices(problem.choices);
      const examTrack = problem.examTrack ?? inferExamTrack(payload.problemSet.contest);
      const inferredTopicKey = problem.topicKey ?? inferTopicKey(statement, problem.answerFormat);
      const techniqueTags =
        problem.techniqueTags && problem.techniqueTags.length > 0
          ? problem.techniqueTags
          : inferTechniqueTags(statement, inferredTopicKey, problem.answerFormat);
      const difficultyBand = problem.difficultyBand ?? inferDifficultyBand(payload.problemSet.contest, problem.number);
      const diagnosticEligible = problem.diagnosticEligible ?? Boolean(examTrack);

      problem = {
        ...problem,
        statement,
        ...(normalizedChoices ? { choices: normalizedChoices } : {}),
        ...(examTrack ? { examTrack } : {}),
        difficultyBand,
        ...(inferredTopicKey ? { topicKey: inferredTopicKey } : {}),
        ...(techniqueTags.length > 0 ? { techniqueTags } : {}),
        diagnosticEligible,
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
