# Diagnostic Blueprint

## Goal
Build a first-step placement flow for `AMC8`, `AMC10`, and `AMC12` that:

1. gives each new student a short diagnostic,
2. estimates current readiness for the chosen exam,
3. identifies weak content areas and technique gaps,
4. routes the student into either:
   - concept repair + guided practice, or
   - practice-heavy improvement.

This document is intentionally product-facing and implementation-facing. It is meant to guide the next feature tranche, not just describe an idea.

## Research basis
Primary source:
- [MAA AMC official competition page](https://maa.org/student-programs/amc/)

Key official scope statements used here:
- `AMC 8`: middle-school mathematics, especially counting/probability, estimation, proportional reasoning, elementary geometry, spatial visualization, graphs/tables, plus some beginning algebra and coordinate geometry.
- `AMC 10`: elementary algebra, basic geometry, area/volume formulas, elementary number theory, elementary probability; excludes trigonometry, advanced algebra, advanced geometry.
- `AMC 12`: full high-school mathematics curriculum including trigonometry, advanced algebra, and advanced geometry; excludes calculus.

Additional basis:
- Current repository `topicKey` taxonomy and real imported contest corpus.
- Existing tutor/report flow already implemented in the app.

Important limitation:
- A `10`-question diagnostic can cover every first-level topic family.
- It cannot reliably cover every fine-grained subskill in one pass.
- Therefore the right model is:
  - first-pass placement test
  - then targeted follow-up practice or micro-checks if needed.

## Product principle
Diagnostic and practice must stay separate.

### Diagnostic mode
- Goal: measure current level.
- No hints during the run.
- No "I'm stuck" flow.
- No live explanation until the run is complete.
- Output: placement report.

### Practice mode
- Goal: help the student improve.
- Hints and explanations are allowed.
- Continue-practice recommendations are allowed.

If these two modes are mixed, the report will be polluted by hint usage and the placement signal becomes unreliable.

## Recommended first MVP
Each exam gets a dedicated `10`-question placement test:

- `4 EASY`
- `4 MEDIUM`
- `2 HARD`

The test should cover every major topic family for that exam.

## Blueprint by exam
The code version of these blueprints lives in:
- [apps/web/src/lib/diagnostic-blueprints.ts](/Users/yimingsun/Desktop/Arcmath/apps/web/src/lib/diagnostic-blueprints.ts)

### AMC 8
Topic families:
- Arithmetic, ratios, and percent
- Beginning algebra and patterns
- Geometry and spatial visualization
- Counting and probability
- Graphs, tables, and data interpretation

Typical technique tags:
- `ratio_reasoning`
- `estimation`
- `pattern_finding`
- `diagram_reading`
- `spatial_visualization`
- `counting_principle`
- `probability_setup`

### AMC 10
Topic families:
- Algebra and functional reasoning
- Geometry and measurement
- Elementary number theory
- Counting and probability
- Coordinate and word-problem modeling

Typical technique tags:
- `algebra_setup`
- `equation_solving`
- `function_analysis`
- `angle_chasing`
- `coordinate_modeling`
- `casework`
- `modular_reasoning`
- `working_backwards`

### AMC 12
Topic families:
- Advanced algebra and functions
- Geometry and coordinate geometry
- Trigonometry
- Number theory
- Counting and probability

Typical technique tags:
- `function_analysis`
- `optimization`
- `trigonometric_modeling`
- `angle_chasing`
- `modular_reasoning`
- `casework`
- `symmetry`

## Diagnostic selection rules
For a first MVP, use deterministic selection.

Given a chosen `examTrack`, the generator should:

1. pull only problems tagged for that exam track,
2. enforce exact difficulty mix `4/4/2`,
3. enforce coverage of all first-level topic families,
4. avoid repeated near-duplicate topic buckets when possible,
5. prefer high-confidence clean problems:
   - correct formatting,
   - diagram present when needed,
   - stable grading behavior.

## Report outputs
The placement report should include:

### 1. Overall readiness band
Examples:
- `AMC 8 Foundation`
- `AMC 8 Developing`
- `AMC 10 Foundation`
- `AMC 10 Competitive`
- `AMC 12 Developing`
- `AMC 12 AIME-track`

### 2. Topic reinforcement priorities
Show the top `2-3` weak topic families.

Examples:
- algebra setup
- geometry/diagram reasoning
- counting/probability
- number theory
- trigonometry

### 3. Technique weakness signals
Keep topic and technique separate.

Examples:
- weak at `geometry.general`, but especially unstable in `diagram_reading`
- weak at `counting.general`, but especially unstable in `casework`
- weak at `algebra.general`, but especially unstable in `function_analysis`

### 4. Near-term recommendations
Examples:
- first repair linear-equation fluency and basic geometry
- do not move into hard counting yet
- reinforce medium geometry before attempting another hard mixed set

### 5. Conversion path
After the report:
- `Take targeted classes + practice`
- `Practice only`

This is where later paid flows can attach.

## Data model recommendation
Minimal additions that fit the current system:

### Problem-level
Add later, not immediately:
- `examTrack`
- `techniqueTags`
- `diagnosticEligible`

Why:
- `topicKey` and `difficultyBand` already exist.
- The next missing signal is technique-level tagging.

### Run-level
Current `PracticeRun` should not be reused blindly.

Recommended next step:
- either add `runType` to `PracticeRun`,
- or introduce a very small `DiagnosticRun`.

For MVP discipline, `runType` on the existing run model is probably enough.

## Selection/reporting logic
Keep the scoring deterministic.

### Inputs
- correctness
- difficulty
- topicKey
- techniqueTags
- skip/blank behavior

### Suggested weighting
- correct easy: low positive signal
- correct medium: stronger positive signal
- correct hard: strongest positive signal
- incorrect easy: strong weakness signal
- incorrect medium: medium weakness signal
- incorrect hard: useful, but not as damaging as missing easy
- skipped easy/medium: stronger concern than skipped hard

This gives a much more honest placement than raw percentage alone.

## Recommended implementation order
### Phase 1
Research + taxonomy alignment
- done in this doc and the blueprint config file

### Phase 2
Metadata expansion
- add `examTrack`
- add `techniqueTags`
- add `diagnosticEligible`

### Phase 3
Diagnostic pool curation
- build a small high-confidence pool for each exam
- start with `30-40` problems per exam

### Phase 4
Diagnostic run product flow
- exam selection screen
- deterministic 10-question run generation
- no hints during the run

### Phase 5
Placement report
- deterministic scoring
- AI can improve wording only

### Phase 6
Paid path attachment
- classes + targeted practice
- practice-only track

## Practical note for this repo
Do not try to make the first placement version fully adaptive.

The smallest credible first version is:
- one blueprint per exam,
- deterministic selection,
- deterministic report,
- AI wording layer optional.

That is enough to launch a real student-facing placement product without overbuilding.

