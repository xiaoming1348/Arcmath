/**
 * Answer equivalence helpers for the EXPRESSION/INTEGER answer formats.
 *
 * v1 (`answer-grading.ts`) collapses whitespace and lowercases. That is
 * not enough for competition answers: students write `2\sqrt{3}` vs
 * `\sqrt{12}`, `3/2` vs `1.5` vs `1\frac{1}{2}`, `(1+\sqrt 5)/2` vs
 * `\frac{1+\sqrt{5}}{2}`. The v2 grader's "RULE" backend uses these
 * helpers to commit to VERIFIED on textbook-equivalent forms BEFORE we
 * fall back to SymPy or an LLM.
 *
 * Pure JS — no Python, no API. Anything that requires real CAS power
 * (irrational simplification beyond the small table here, transcendental
 * equality) goes through the SymPy backend.
 */

/** Pre-normalize Unicode and operator-equivalent macros. Run FIRST. */
function normalizeUnicode(text: string): string {
  return text
    .replace(/−/g, "-") // unicode minus
    .replace(/×/g, "*") // ×
    .replace(/·/g, "*") // ·
    .replace(/÷/g, "/") // ÷
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\left|\\right/g, "");
}

/** Strip whitespace and braces. Run AFTER fraction rewriting. */
function stripStructural(text: string): string {
  return text.replace(/[{}]/g, "").replace(/\s+/g, "").trim();
}

/**
 * Turn `\frac{a}{b}`, `\dfrac{a}{b}`, `\tfrac{a}{b}` into `(a)/(b)` while
 * the braces still delimit the numerator and denominator. Must run
 * BEFORE `stripStructural` — otherwise multi-digit cases like
 * `\frac{12}{16}` are ambiguous (would split as `121/6`).
 *
 * Repeats to a fixed point so nested fractions like `\frac{1}{\frac{2}{3}}`
 * collapse to `(1)/((2)/(3))`.
 */
function rewriteFractions(text: string): string {
  // Normalize the macro spelling: \dfrac and \tfrac → \frac.
  let s = text.replace(/\\[dt]frac/g, "\\frac");

  const bracePattern = /\\frac\{([^{}]*)\}\{([^{}]*)\}/g;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(bracePattern, "($1)/($2)");
  }

  // Bare-digit form `\frac34` (no braces). Single-digit numerator and
  // denominator only — anything multi-digit is ambiguous without braces.
  s = s.replace(/\\frac(-?\d)(-?\d)/g, "($1)/($2)");
  // Parenthesised form `\frac(...)(...)`.
  s = s.replace(/\\frac\(([^()]+)\)\(([^()]+)\)/g, "($1)/($2)");
  return s;
}

function normalize(text: string): string {
  return stripStructural(rewriteFractions(normalizeUnicode(text)));
}

/** Drop trailing `.0` style decimal noise. */
function trimZeroFraction(value: string): string {
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

// We avoid BigInt LITERAL syntax (e.g. `1n`) so this file compiles under
// the project's ES2017 target. The runtime values are still bigint —
// `BigInt(0)` etc. are available everywhere bigint runtime is.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const NEG_ONE = BigInt(-1);
const TEN = BigInt(10);

/** Try to evaluate the expression as a rational. Returns null on failure. */
function tryEvalRational(text: string): { num: bigint; den: bigint } | null {
  const cleaned = text.replace(/^\+/, "");
  // Pure integer.
  if (/^-?\d+$/.test(cleaned)) {
    return { num: BigInt(cleaned), den: ONE };
  }
  // Pure decimal.
  const dec = /^-?\d+\.\d+$/.exec(cleaned);
  if (dec) {
    return decimalToRational(cleaned);
  }
  // p/q form.
  const frac = /^\(?(-?\d+(?:\.\d+)?)\)?\/\(?(-?\d+(?:\.\d+)?)\)?$/.exec(
    cleaned
  );
  if (frac) {
    const a = decimalToRational(frac[1]);
    const b = decimalToRational(frac[2]);
    if (!a || !b || b.num === ZERO) return null;
    return reduce({
      num: a.num * b.den,
      den: a.den * b.num
    });
  }
  return null;
}

function decimalToRational(text: string): { num: bigint; den: bigint } | null {
  if (/^-?\d+$/.test(text)) return { num: BigInt(text), den: ONE };
  const m = /^(-?)(\d+)\.(\d+)$/.exec(text);
  if (!m) return null;
  const sign = m[1] === "-" ? NEG_ONE : ONE;
  const intPart = BigInt(m[2]);
  const fracPart = BigInt(m[3]);
  const den = TEN ** BigInt(m[3].length);
  return reduce({ num: sign * (intPart * den + fracPart), den });
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < ZERO ? -a : a;
  let y = b < ZERO ? -b : b;
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

function reduce(r: { num: bigint; den: bigint }): { num: bigint; den: bigint } {
  if (r.den === ZERO) return r;
  if (r.den < ZERO) {
    r = { num: -r.num, den: -r.den };
  }
  const g = gcd(r.num, r.den);
  if (g === ZERO) return r;
  return { num: r.num / g, den: r.den / g };
}

function rationalsEqual(
  a: { num: bigint; den: bigint },
  b: { num: bigint; den: bigint }
): boolean {
  const ar = reduce(a);
  const br = reduce(b);
  return ar.num === br.num && ar.den === br.den;
}

/**
 * "Are these two answer strings textbook-equivalent?" Returns:
 *   - "EQUAL" if we can prove yes
 *   - "DIFFERENT" if we can prove no
 *   - "UNKNOWN" if we don't have a rule for it (SymPy backend will try)
 */
export function compareAnswers(
  submitted: string,
  canonical: string
): "EQUAL" | "DIFFERENT" | "UNKNOWN" {
  const a = trimZeroFraction(normalize(submitted));
  const b = trimZeroFraction(normalize(canonical));

  if (a === b) return "EQUAL";

  // Try rational equality.
  const ra = tryEvalRational(a);
  const rb = tryEvalRational(b);
  if (ra && rb) {
    return rationalsEqual(ra, rb) ? "EQUAL" : "DIFFERENT";
  }

  // Sign-flip detection on otherwise-equal forms.
  if (a === `-${b}` || b === `-${a}`) return "DIFFERENT";

  return "UNKNOWN";
}
