/**
 * Parser that turns the raw `theorem ... := by ...` blocks in
 * miniF2F-lean4's Test.lean / Valid.lean into structured entries we
 * can convert to GradingFixture.
 *
 * miniF2F uses a stable shape:
 *
 *   theorem mathd_algebra_478 (b h v : ℝ) (h₀ : 0 < b ∧ 0 < h ∧ 0 < v)
 *       (h₁ : v = 1 / 3 * (b * h)) (h₂ : b = 30) (h₃ : h = 13 / 2) :
 *       v = 65 := by sorry
 *
 *   theorem amc12a_2019_p21 (z : ℂ) (h₀ : z = (1 + Complex.I) / Real.sqrt 2) :
 *     (∑ k in Finset.range 12, z ^ (k + 1) ^ 2) *
 *         (∑ k in Finset.range 12, 1 / z ^ (k + 1) ^ 2) = 36 := by
 *     sorry
 *
 * We extract:
 *   - name      : "mathd_algebra_478"
 *   - signature : everything between `theorem <name>` and `:= by ...`
 *   - proofBody : everything after `:= by ` (often just "sorry")
 *   - leadingComment: an immediately preceding `--` line if any
 *
 * The parser is intentionally tolerant: it handles nested parens, Unicode
 * identifiers, multi-line theorem heads, and skips files / blocks that
 * don't match the shape. Pure JS — no Lean needed.
 */

import type { GradingFixture } from "./types";

export type MiniF2FEntry = {
  name: string;
  signature: string;
  proofBody: string;
  leadingComment: string | null;
  split: "test" | "valid";
};

const THEOREM_KEYWORDS = ["theorem", "lemma", "example"] as const;

/**
 * Walk the source and return every `theorem ... := by ...` block.
 * We track paren / brace depth so a comma or `:=` inside `(...)` does
 * not break the scan.
 */
export function parseMiniF2FFile(
  source: string,
  split: "test" | "valid"
): MiniF2FEntry[] {
  const out: MiniF2FEntry[] = [];
  const lines = source.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const headMatch = matchTheoremHead(line);
    if (!headMatch) {
      i += 1;
      continue;
    }

    // Walk forward until we hit `:= by` (or `:= sorry` / `:= …`) at the
    // top paren depth.
    let buf = line;
    let endLine = i;
    while (!hasTopLevelDeclEnd(buf) && endLine < lines.length - 1) {
      endLine += 1;
      buf += "\n" + lines[endLine];
    }
    if (!hasTopLevelDeclEnd(buf)) {
      // Malformed; skip ahead one line.
      i = endLine + 1;
      continue;
    }

    const declSplit = splitAtTopLevelDeclEnd(buf);
    if (declSplit) {
      // Now keep consuming until we hit either the next theorem keyword
      // OR a leading-comment block (`--`) that obviously belongs to the
      // next theorem. We also stop on `end <Namespace>` declarations.
      let proofTail = declSplit.proofTail;
      let j = endLine + 1;
      while (j < lines.length) {
        if (matchTheoremHead(lines[j])) break;
        const trimmed = lines[j].trim();
        // A line-comment at column 0 always belongs to the next decl —
        // miniF2F's convention is to comment-then-theorem. Stop here and
        // let the next loop iteration scan from the comment.
        if (lines[j].startsWith("--")) break;
        if (trimmed.startsWith("end ")) break;
        proofTail += "\n" + lines[j];
        j += 1;
      }

      const leadingComment = findLeadingComment(lines, i);
      const signature = declSplit.signature.replace(/\s+/g, " ").trim();
      // Drop any trailing whitespace-only lines from the proof body and
      // strip the leading `by` keyword so callers see just the tactic
      // block. `term-mode` proofs (no `by`) pass through untouched.
      const proofBody = proofTail
        .replace(/\s+$/g, "")
        .replace(/^\s+/, "")
        .replace(/^by\s+/, "")
        .trim();
      out.push({
        name: headMatch.name,
        signature,
        proofBody,
        leadingComment,
        split
      });
      i = j;
      continue;
    }
    i = endLine + 1;
  }
  return out;
}

function matchTheoremHead(
  line: string
): { name: string; rest: string } | null {
  const trimmed = line.trimStart();
  for (const kw of THEOREM_KEYWORDS) {
    if (trimmed.startsWith(kw + " ") || trimmed.startsWith(kw + "\t")) {
      const after = trimmed.slice(kw.length).trimStart();
      const m = /^([A-Za-z_][A-Za-z0-9_']*)/.exec(after);
      if (m) {
        return { name: m[1], rest: after.slice(m[1].length) };
      }
      return null;
    }
  }
  return null;
}

function hasTopLevelDeclEnd(buf: string): boolean {
  return findTopLevelDeclEndIndex(buf) !== -1;
}

function findTopLevelDeclEndIndex(buf: string): number {
  // Look for `:=` at paren depth 0. We track ( [ { ⟨ matched to their
  // closers; Unicode angle brackets are common in Mathlib.
  const opens = new Set("([{⟨");
  const closes = new Set(")]}⟩");
  let depth = 0;
  for (let i = 0; i < buf.length - 1; i += 1) {
    const ch = buf[i];
    if (opens.has(ch)) depth += 1;
    else if (closes.has(ch)) depth -= 1;
    if (depth === 0 && ch === ":" && buf[i + 1] === "=") {
      return i;
    }
  }
  return -1;
}

function splitAtTopLevelDeclEnd(
  buf: string
): { signature: string; proofTail: string } | null {
  const idx = findTopLevelDeclEndIndex(buf);
  if (idx === -1) return null;
  // signature is everything between `theorem <name>` and `:=`; we strip
  // the leading `theorem foo ` ourselves.
  const head = buf.slice(0, idx);
  const tail = buf.slice(idx + 2); // skip `:=`
  // Drop the `theorem <name>` prefix from `head`.
  const m = /^(\s*)(theorem|lemma|example)\s+([A-Za-z_][A-Za-z0-9_']*)\s*/.exec(
    head
  );
  if (!m) return null;
  const signature = head.slice(m[0].length);
  return { signature, proofTail: tail };
}

function findLeadingComment(lines: string[], index: number): string | null {
  // Pull contiguous `-- …` lines immediately above `index` if any.
  const out: string[] = [];
  let i = index - 1;
  while (i >= 0) {
    const t = lines[i].trim();
    if (t.startsWith("--")) {
      out.unshift(t.replace(/^--\s?/, ""));
      i -= 1;
      continue;
    }
    if (t.length === 0 && out.length === 0) {
      i -= 1;
      continue;
    }
    break;
  }
  return out.length > 0 ? out.join(" ") : null;
}

/**
 * Convert miniF2F entries into v2 fixtures. Each theorem becomes one
 * fixture with a single CLAIM milestone whose `formal.code` carries the
 * Lean statement so the v2 Lean backend can verify a student's proof of
 * it. A reference proof (when the theorem ends with anything other than
 * `sorry`) becomes the CLEAN_CORRECT solution; otherwise we mark the
 * solution ESCALATE so the harness flags the gap.
 */
export function miniF2FEntriesToFixtures(
  entries: MiniF2FEntry[]
): GradingFixture[] {
  return entries.map((entry) => {
    const isStub = /^\s*sorry\s*$/.test(entry.proofBody);
    const hasProof = !isStub;
    const prose =
      entry.leadingComment ?? humanizeLeanSignature(entry.signature);
    const formal = `theorem ${entry.name} ${entry.signature.trim()} := by
${entry.proofBody}`;

    const fixture: GradingFixture = {
      key: `minif2f-${entry.split}-${entry.name}`,
      source: "MINIF2F",
      problemStatement: prose,
      rubric: {
        problemId: `minif2f-${entry.split}-${entry.name}`,
        version: "minif2f-import-v1",
        generatedAt: new Date().toISOString(),
        source: "AUTHORED",
        approvedAt: null,
        goalStatement: prose,
        milestones: [
          {
            id: `minif2f-${entry.split}-${entry.name}::m1`,
            index: 1,
            title: "discharge theorem",
            claim: prose,
            techniques: [],
            dependsOn: [],
            critical: true,
            formal: { kind: "lean4-statement", code: formal }
          }
        ],
        commonPitfalls: []
      },
      studentSolutions: [
        {
          label: hasProof ? "reference-proof" : "stub-only",
          description: hasProof
            ? "miniF2F reference proof"
            : "miniF2F entry has no proof (sorry)",
          category: hasProof ? "CLEAN_CORRECT" : "VALID_SCAFFOLD_WRONG_FINAL",
          steps: [
            {
              latex: entry.proofBody,
              expectedVerdict: hasProof ? "VERIFIED" : "ESCALATE"
            }
          ],
          expectedFinalCorrect: hasProof
        }
      ]
    };
    return fixture;
  });
}

/**
 * Best-effort "Lean signature → English" pass so the grader gets a
 * readable problem statement even when miniF2F's comment was empty.
 * It does NOT try to be a Lean translator — it just normalizes
 * common notation.
 */
export function humanizeLeanSignature(sig: string): string {
  return sig
    .replace(/ℝ/g, "real number")
    .replace(/ℕ/g, "natural number")
    .replace(/ℤ/g, "integer")
    .replace(/ℚ/g, "rational number")
    .replace(/ℂ/g, "complex number")
    .replace(/\(([^()]+)\)\s*:\s*([^,()]+),/g, "let $1 be $2; ")
    .replace(/\s+/g, " ")
    .trim();
}
