# Interactive Hint Tutor MVP

## Goal

Upgrade the current one-shot `"I'm stuck"` flow into a multi-turn tutor that:

- helps students expose where they are stuck
- checks intermediate reasoning, not just final answers
- stays low-friction on desktop and mobile
- avoids becoming a full chat app or a full symbolic math system

This MVP is for the existing single-problem tutor flow on real contest sets. It does **not** apply to diagnostic tests, which should remain no-hint.

## Existing Baseline

Current implementation:

- UI:
  - [`apps/web/src/components/hint-tutor-panel.tsx`](/Users/yimingsun/Desktop/Arcmath/apps/web/src/components/hint-tutor-panel.tsx)
- Backend:
  - [`apps/web/src/lib/trpc/routers/hint-tutor.ts`](/Users/yimingsun/Desktop/Arcmath/apps/web/src/lib/trpc/routers/hint-tutor.ts)
- AI prompt layer:
  - [`apps/web/src/lib/ai/hint-tutor.ts`](/Users/yimingsun/Desktop/Arcmath/apps/web/src/lib/ai/hint-tutor.ts)

Current behavior is single-turn:

- request one hint
- submit one answer
- receive one explanation

That is not enough for an interactive tutor. The system currently does not persist tutor conversation state or step-by-step student reasoning.

## Product Principles

1. Keep input friction low.
2. Optimize for learning progress, not fancy math input.
3. Make student intent explicit before the model responds.
4. Advance one step at a time.
5. Keep diagnostic mode separate from interactive tutor mode.

## UI Recommendation

### Main structure

Use a three-part tutor panel:

1. Intent bar
2. Conversation area
3. Input composer

### 1. Intent bar

Provide four explicit actions before free-form input:

- `Help me start`
- `Check my step`
- `Check my answer idea`
- `Give me a smaller hint`

Why:

- lowers student hesitation
- improves backend routing
- makes tutor replies more predictable

### 2. Conversation area

Render a lightweight tutor thread, not a generic chat app.

Each tutor turn should be short and actionable:

- one observation
- one next step
- one check question

Avoid long paragraph dumps.

Tutor turns should support math rendering using the same KaTeX-capable rendering path already used for problems.

### 3. Input composer

Use plain text input as the default.

Add light math support, not a full equation editor:

- students can type `x^2+3x`, `(a+b)/2`, `sqrt(5)`, `2^10`
- show live math preview under the input
- offer a tiny helper strip:
  - `^`
  - `/`
  - `sqrt`
  - `pi`
  - `<=`
  - `>=`

Do **not** make LaTeX mastery a prerequisite for using the tutor.

## Why not a full math input box first

Do not start with a full formula editor as the main interaction.

Reasons:

- too much input friction
- poor mobile experience
- most student confusion is strategic, not notation-heavy
- many useful messages are natural language:
  - "I don't know what to set equal"
  - "I got 12 but it seems wrong"
  - "Why do we use modulo here"

Conclusion:

- natural language + math-friendly preview is the right MVP

## Core Student Flows

### Flow A: Need help starting

Student intent:

- `Help me start`

Student message examples:

- "I don't know how to begin."
- "What should I look at first?"

Tutor response shape:

- identify the most relevant condition
- suggest the first concrete action
- ask one short check question

### Flow B: Check my step

Student intent:

- `Check my step`

Student message examples:

- `I set 2x+3=11`
- `I counted 6 cases`
- `I used complementary counting`

Tutor response shape:

- confirm whether the step is valid
- name the likely issue if wrong
- say the next step only

This is the highest-value interactive behavior for learning outcomes.

### Flow C: Check my answer idea

Student intent:

- `Check my answer idea`

Student message examples:

- `I think the answer is 12`
- `I got B because the triangles are similar`

Tutor response shape:

- do not immediately reveal correctness
- ask for the reasoning that led there
- or point to one missing verification step

### Flow D: Smaller hint

Student intent:

- `Give me a smaller hint`

Tutor response shape:

- make the next hint less revealing than the current path
- stay below current disclosure level

## Suggested UI Layout

Desktop:

- keep problem statement in main column
- keep tutor panel sticky in side column
- show thread + composer in one visible card

Mobile:

- stack tutor below the problem
- keep intent bar visible above composer
- use compact chips for intent buttons

### Proposed panel sections

1. Header
- `Hint Tutor`
- current mode badge
- current disclosure level

2. Intent chips

3. Conversation thread

4. Composer
- input box
- math helper strip
- preview area
- send button

5. Optional working memory box
- latest claimed step
- last confirmed idea
- current draft answer

## Backend State Model

The current `ProblemHintUsage` table is not enough for true interactive tutoring.

Add minimal conversation state:

### `TutorSession`

- `id`
- `userId`
- `problemId`
- `practiceRunId?`
- `status` (`ACTIVE`, `CLOSED`)
- `currentIntent`
- `currentHintLevel`
- `createdAt`
- `updatedAt`

Purpose:

- one active tutoring thread per user + problem + run

### `TutorTurn`

- `id`
- `tutorSessionId`
- `actor` (`STUDENT`, `TUTOR`, `SYSTEM`)
- `intent?`
- `rawText`
- `renderedMathText?`
- `metadataJson?`
- `createdAt`

Purpose:

- preserve conversation history
- support report/review later
- make future model calls context-aware

## API Recommendation

Keep the existing router, but add a dedicated multi-turn procedure instead of overloading `getNextHint`.

### New procedure

`hintTutor.respond`

Input:

- `problemId`
- `practiceRunId?`
- `sessionId?`
- `intent`
- `studentMessage`
- `draftAnswer?`

Output:

- `sessionId`
- `turnId`
- `tutorText`
- `nextSuggestedIntent?`
- `hintLevel`
- `stateSummary`

### Keep existing procedures

- `getNextHint`
- `submitAttempt`

Reason:

- preserve current product behavior during rollout
- allow progressive migration

## Prompt Strategy

Do not turn the tutor into a generic chatbot.

The prompt should always include:

- problem statement
- answer format
- choices if any
- diagram description if any
- solution sketch if any
- current tutor intent
- short recent turn history
- current hint level
- current student draft answer if available

Prompt rules:

- advance one step only
- do not reveal final answer
- check the student’s claimed step directly when intent is `Check my step`
- end with one concrete next question

## Safety / Guardrails

Existing protections must stay:

- final-answer leak guard
- curated/precomputed hint priority
- safe fallback path

Additional interactive rules:

- never auto-confirm a final answer without reasoning
- never jump from `Help me start` directly to near-solution hints
- if the student asks for the answer directly, redirect to the next valid step

## Scoring / Learning Value

The tutor should not just log that a hint was used.

Log:

- which intent was used
- how many back-and-forth turns occurred
- whether the student corrected a bad step after feedback

This creates useful future features:

- report quality signals
- teacher view of how students get stuck
- better recommendation logic

## Rollout Plan

### Phase 1: UI MVP

- replace one-shot hint box with:
  - intent chips
  - thread UI
  - plain text composer
  - math preview
- keep backend on top of existing router if needed

### Phase 2: Persistent session

- add `TutorSession`
- add `TutorTurn`
- add `hintTutor.respond`

### Phase 3: Step-aware feedback

- use intent-specific prompt logic
- support step checking
- log intent and turn state

### Phase 4: Stronger math understanding

- lightweight parsing for simple equations/expressions
- improved intermediate-step checking

## What not to build in MVP

- full theorem proving
- full symbolic algebra engine
- full proof editor
- complex whiteboard
- full LaTeX authoring experience

Those are not required to materially improve student learning in the current product.

## Recommended First Implementation Slice

Build this first:

1. intent chips
2. thread UI
3. one text composer with math preview
4. new `hintTutor.respond` API
5. minimal `TutorSession` / `TutorTurn`

This is the smallest slice that changes the experience from:

- `click hint -> receive hint`

to:

- `state intent -> explain current step -> receive targeted next-step tutoring`

## Decision Summary

For this product, the right first version is:

- **chat-style interaction**
- **plain text input**
- **light math assistance**
- **explicit intent buttons**
- **step-aware backend**

Not:

- full LaTeX editor
- full formal proof system
- generic chat app
