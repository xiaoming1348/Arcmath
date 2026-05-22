/**
 * Confidence merging.
 *
 * Pure function over a set of `BackendVote`s; no I/O, no LLM calls. The
 * goal is to produce one (verdict, confidence, evidence) triple that
 * downstream code (escalation gate, teacher queue, UI) can rely on.
 *
 * Design constraints (see GRADING_ENGINE_V2.md §5):
 *  1. Deterministic backends override LLM judges. SymPy/Lean disagreeing
 *     with an LLM judge does NOT compromise — the deterministic answer
 *     wins (with the LLM dissent recorded as evidence).
 *  2. Two backends agreeing must increase confidence (noisy-OR), not
 *     average.
 *  3. Two backends conflicting and neither is deterministic must produce
 *     UNCERTAIN, never a "split the difference" verdict.
 *  4. ABSTAIN votes are noise — drop them before merge.
 */

import {
  type BackendVote,
  type StepVerdict,
  isDeterministicSource
} from "./types";

export type MergeOutcome = {
  verdict: StepVerdict;
  confidence: number;
  evidence: string;
  /**
   * Active votes — the subset that contributed to the final verdict
   * (i.e. votes excluded by deterministic-override are listed in
   * `dissenting`).
   */
  active: BackendVote[];
  dissenting: BackendVote[];
};

const EMPTY: MergeOutcome = {
  verdict: "UNCERTAIN",
  confidence: 0,
  evidence: "no backend produced a verdict",
  active: [],
  dissenting: []
};

/** Combine two independent probabilities of agreement (noisy-OR). */
function noisyOr(a: number, b: number): number {
  const aa = Math.min(Math.max(a, 0), 1);
  const bb = Math.min(Math.max(b, 0), 1);
  return 1 - (1 - aa) * (1 - bb);
}

function dedupEvidence(votes: BackendVote[]): string {
  return votes
    .map((v) => `[${v.source}@${v.confidence.toFixed(2)}] ${v.evidence}`)
    .join("\n");
}

export function mergeVotes(rawVotes: BackendVote[]): MergeOutcome {
  const votes = rawVotes.filter((v) => v.outcome !== "ABSTAIN");
  if (votes.length === 0) {
    return EMPTY;
  }

  const det = votes.filter((v) => isDeterministicSource(v.source));
  const llm = votes.filter((v) => !isDeterministicSource(v.source));

  // === 1. Deterministic backends present ===
  if (det.length > 0) {
    // If two deterministic backends conflict, that's a real software bug —
    // we still need to return something, and we surface it as UNCERTAIN
    // with all the details so the teacher catches it.
    const detVerified = det.filter((v) => v.outcome === "VERIFIED");
    const detInvalid = det.filter((v) => v.outcome === "INVALID");

    if (detVerified.length > 0 && detInvalid.length > 0) {
      return {
        verdict: "UNCERTAIN",
        confidence: 0,
        evidence:
          "deterministic backends disagree — software bug or rubric error:\n" +
          dedupEvidence([...detVerified, ...detInvalid]),
        active: [],
        dissenting: [...detVerified, ...detInvalid, ...llm]
      };
    }

    const winningSide = detVerified.length > 0 ? detVerified : detInvalid;
    const verdict: StepVerdict =
      detVerified.length > 0 ? "VERIFIED" : "INVALID";

    // Combine confidences across agreeing deterministic backends.
    let conf = winningSide[0].confidence;
    for (let i = 1; i < winningSide.length; i++) {
      conf = noisyOr(conf, winningSide[i].confidence);
    }

    // LLM judges that agree get to nudge confidence up (small effect).
    const agreeingLlms = llm.filter((v) =>
      verdict === "VERIFIED" ? v.outcome === "VERIFIED" : v.outcome === "INVALID"
    );
    for (const judge of agreeingLlms) {
      // LLM bumps are capped: we model judge accuracy at ≤ 0.85, and only
      // push confidence toward 1, never away.
      conf = noisyOr(conf, Math.min(judge.confidence, 0.85) * 0.5);
    }

    const dissentingLlms = llm.filter((v) =>
      verdict === "VERIFIED" ? v.outcome === "INVALID" : v.outcome === "VERIFIED"
    );

    return {
      verdict,
      confidence: Math.min(conf, 1),
      evidence: dedupEvidence([...winningSide, ...agreeingLlms]),
      active: [...winningSide, ...agreeingLlms],
      dissenting: dissentingLlms
    };
  }

  // === 2. Only LLM judges present ===
  //
  // Policy (GRADING_ENGINE_V2.md §2): LLM-only votes NEVER commit to
  // VERIFIED. The trust contract with teachers and students is that
  // any "this step is correct" claim must be backed by a deterministic
  // backend (SymPy / Lean / rule / equivalence prover). LLMs are smart
  // enough to recognize true claims even when the student did not
  // prove them — so two judges agreeing on VERIFIED for a true-but-
  // unjustified step would create a false-VERIFIED. We refuse.
  //
  // We DO allow LLM-only INVALID commits when judges agree at high
  // confidence, because:
  //   - false-INVALID is recoverable (routes to teacher review with
  //     reasoning attached) whereas false-VERIFIED is a trust-breaker.
  //   - LLMs are usually right about specific algebraic errors.
  // INVALID still requires ≥2 judges at ≥0.92 each. Single-judge
  // INVALID is treated like single-judge VERIFIED: UNCERTAIN.
  const llmVerified = llm.filter((v) => v.outcome === "VERIFIED");
  const llmInvalid = llm.filter((v) => v.outcome === "INVALID");

  if (llmVerified.length === 0 && llmInvalid.length === 0) return EMPTY;

  if (llmVerified.length > 0 && llmInvalid.length > 0) {
    return {
      verdict: "UNCERTAIN",
      confidence: 0,
      evidence:
        "LLM judges disagree:\n" +
        dedupEvidence([...llmVerified, ...llmInvalid]),
      active: [],
      dissenting: [...llmVerified, ...llmInvalid]
    };
  }

  // VERIFIED side:
  //   - Single LLM judge → never commits. Always UNCERTAIN.
  //   - Two+ LLM judges agreeing at ≥ 0.95 each, AND at least one
  //     ABSTAIN-but-existing deterministic vote with supporting evidence
  //     (e.g. SymPy probe-pass = ABSTAIN with stage="numeric_probe"),
  //     can commit VERIFIED at capped confidence 0.92.
  //   - Otherwise → UNCERTAIN.
  //
  // Why allow this carve-out at all: most routine inequalities like
  // `(a-b)^2 ≥ 0` cannot be SYMBOLICALLY proven by our current SymPy
  // backend (it only does symbolic equality and numeric inequality
  // probes). Without this rule, every basic algebraic step in a proof
  // gets escalated, making the tool unusable. Adding the "SymPy probe
  // passed" coincidence requirement prevents the LLMs from
  // hallucinating VERIFIED on unparseable or genuinely-unknown claims.
  if (llmVerified.length > 0) {
    const sympyProbePassed = rawVotes.some(
      (v) =>
        v.source === "SYMPY" &&
        v.outcome === "ABSTAIN" &&
        typeof v.details?.["stage"] === "string" &&
        ((v.details["stage"] as string).includes("numeric_probe") ||
          (v.details["stage"] as string).startsWith("standalone_expression"))
    );

    // Empirical threshold: 0.95.
    // We briefly tried 0.97 to clamp a perceived false-VERIFIED, but it
    // had unacceptable collateral on routine inequalities (judges
    // typically hit 0.95-0.96 on `(a-b)^2 ≥ 0` style steps, not 0.97+),
    // and the original false-VERIFIED turned out to be a step-level
    // correct case in an off-by-one chain — properly the rubric/
    // milestone-coverage layer's job, not the step grader's.
    const allHighEnough =
      llmVerified.length >= 2 &&
      llmVerified.every((v) => v.confidence >= 0.95);

    if (sympyProbePassed && allHighEnough) {
      let conf = llmVerified[0].confidence;
      for (let i = 1; i < llmVerified.length; i++) {
        conf = noisyOr(conf, llmVerified[i].confidence);
      }
      return {
        verdict: "VERIFIED",
        confidence: Math.min(conf, 0.92),
        evidence:
          `dual LLM judge consensus + SymPy probe-pass:\n${dedupEvidence(llmVerified)}`,
        active: llmVerified,
        dissenting: []
      };
    }

    return {
      verdict: "UNCERTAIN",
      confidence:
        llmVerified.length === 1
          ? llmVerified[0].confidence
          : llmVerified.reduce((acc, v) => noisyOr(acc, v.confidence), 0),
      evidence:
        `${llmVerified.length} LLM judge(s) said VERIFIED but the ` +
        `dual-judge + SymPy probe-pass coincidence rule did not fire; ` +
        `needs teacher review.\n` +
        dedupEvidence(llmVerified),
      active: [],
      dissenting: llmVerified
    };
  }

  // INVALID side (≥1 judge, no opposition).
  if (llmInvalid.length === 1) {
    return {
      verdict: "UNCERTAIN",
      confidence: llmInvalid[0].confidence,
      evidence:
        `single LLM judge said INVALID; needs review.\n${dedupEvidence(llmInvalid)}`,
      active: [],
      dissenting: llmInvalid
    };
  }

  let conf = llmInvalid[0].confidence;
  for (let i = 1; i < llmInvalid.length; i++) {
    conf = noisyOr(conf, llmInvalid[i].confidence);
  }
  const allHigh = llmInvalid.every((v) => v.confidence >= 0.92);
  if (!allHigh) {
    return {
      verdict: "UNCERTAIN",
      confidence: conf,
      evidence:
        `${llmInvalid.length} LLM judges agree on INVALID but at least one ` +
        `is below 0.92 confidence; needs review.\n${dedupEvidence(llmInvalid)}`,
      active: [],
      dissenting: llmInvalid
    };
  }
  return {
    verdict: "INVALID",
    confidence: Math.min(conf, 0.95),
    evidence: dedupEvidence(llmInvalid),
    active: llmInvalid,
    dissenting: []
  };
}
