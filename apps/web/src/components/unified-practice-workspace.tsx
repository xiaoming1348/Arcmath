"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { trpc } from "@/lib/trpc/client";
import { MathFieldEditor } from "@/components/math-field-editor";
import {
  HandwritingOcrUploader,
  type OcrUploadResult
} from "@/components/handwriting-ocr-uploader";
import { HandwritingMultiStepModal } from "@/components/handwriting-multi-step-modal";
import { resizeImageDataUrl } from "@/lib/image-resize";
import { useT } from "@/i18n/client";
import type { Locale, Messages } from "@/i18n/dictionary";

type UnifiedPracticeWorkspaceProps = {
  problemId: string;
  practiceRunId?: string | null;
  // WORKED_SOLUTION ↔ Putnam / STEP / MAT long questions where the
  // platform doesn't auto-grade. The workspace still surfaces the
  // entry chooser + hint flow (so students can ATTEMPT the problem)
  // and submit recording works; the page renders an "official
  // solution" reveal alongside.
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION" | "PROOF" | "WORKED_SOLUTION";
  choiceOptions: Array<{ label: string; text: string }>;
  // Per-assignment hint-tutor gate. Defaults to `true` so the
  // self-directed practice flow (TOPIC_PRACTICE / contest browser)
  // keeps its current behaviour. The teacher-assignment surface
  // passes `false` for assignments where the teacher unchecked the
  // hint-tutor toggle, in which case the entire hint UI is hidden
  // and the requestHint mutation is never sent.
  hintTutorEnabled?: boolean;
};

type EntryMode = "ANSWER_ONLY" | "STUCK_WITH_WORK" | "HINT_GUIDED" | "PROOF_STEPS";
type AttemptStatus = "DRAFT" | "SUBMITTED" | "ABANDONED";

type StepRecord = {
  id: string;
  stepIndex: number;
  latexInput: string;
  classifiedStepType: string;
  verificationBackend: string;
  verdict: string;
  confidence: number | null;
  feedbackText: string | null;
  verificationDetails: unknown;
  createdAt: string | Date;
};

type HintRecord = {
  id: string;
  hintLevel: number;
  hintText: string;
  createdAt: string | Date;
};

type AttemptState = {
  id: string;
  status: AttemptStatus;
  entryMode: EntryMode | null;
  selfReport: string | null;
  hintsUsedCount: number;
  submittedAnswer: string | null;
  normalizedAnswer: string | null;
  isCorrect: boolean;
  explanationText: string | null;
  overallFeedback: string | null;
  submittedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  steps: StepRecord[];
  hintHistory: HintRecord[];
};

// Structured review data returned by the submit mutation. We stash it
// on client-side state so SubmittedReview can render a per-milestone
// checklist next to the free-form overallFeedback. This is in-memory
// only — on page refresh (where getState rehydrates from DB), the
// checklist disappears and the student falls back to reading the
// text-folded copy in overallFeedback. Persisting this survives-refresh
// is a separate task (add a milestoneCoverage JSON column on
// ProblemAttempt).
type MilestoneCoverageEntry = {
  index: number;
  status: string;
  evidence: string;
};

type RecipeStepMeta = {
  index: number;
  title: string;
  technique: string[];
};

type ReviewExtras = {
  milestoneCoverage: MilestoneCoverageEntry[];
  recipeSteps: RecipeStepMeta[];
};

type VerdictTone = "verified" | "plausible" | "unknown" | "invalid" | "error" | "pending";

const VERDICT_TONE: Record<string, { tone: VerdictTone; icon: string; labelKey: keyof Messages }> = {
  VERIFIED: { tone: "verified", icon: "✓", labelKey: "attempt.verdict_verified" },
  PLAUSIBLE: { tone: "plausible", icon: "⚠", labelKey: "attempt.verdict_plausible" },
  UNKNOWN: { tone: "unknown", icon: "?", labelKey: "attempt.verdict_unknown" },
  INVALID: { tone: "invalid", icon: "✗", labelKey: "attempt.verdict_invalid" },
  // ERROR = "verifier could not run on this step" (e.g. SymPy parse
  // failure). Visually we treat it as a softer "needs review" yellow
  // rather than red, because the student may well be correct — we just
  // couldn't prove it automatically. The mentor feedback should also be
  // teaching-toned, not "the system failed". See proof-tutor.ts.
  ERROR: { tone: "error", icon: "?", labelKey: "attempt.verdict_error" },
  PENDING: { tone: "pending", icon: "…", labelKey: "attempt.verdict_pending" }
};

// VerdictBadge styles route through the v3 design system's `tag`
// data-status protocol (see globals.css `.tag[data-status=...]`)
// so verdict chips inherit the same coloring as the rest of the app.
const VERDICT_TAG_STATUS: Record<VerdictTone, string | undefined> = {
  verified: "verified",
  plausible: "pending",
  unknown: undefined,
  invalid: "invalid",
  // ERROR no longer maps to "invalid" red — see the ERROR comment in
  // VERDICT_TONE for why. Stays neutral so the student isn't told
  // "you got it wrong" when in fact only the parser tripped.
  error: "pending",
  pending: undefined
};

/**
 * Multi-step OCR launcher (Sprint 2). One button + hidden file
 * input. The student picks a photo containing several steps, the
 * vision API segments them, and a review modal pops up. After
 * accept-on-each-step, the parent commits via repeated addStep
 * calls.
 *
 * Why a separate component (vs jamming into OcrAwareMathEditor):
 *   - Single-step OCR is per-edit (filling one field). Multi-step
 *     OCR is per-attempt (filling N new steps). The two have
 *     different mental models and different commit paths.
 *   - The composer area can host both UIs side-by-side so students
 *     can pick the right tool for the page they just photographed.
 */
function MultiStepOcrLauncher(props: {
  locale: Locale;
  attemptId: string;
  disabled?: boolean;
  /**
   * Called once per accepted step, in order. The parent fires
   * `addStep` mutations and updates the visible step list. The
   * launcher closes the modal once all callbacks have resolved.
   */
  onCommitOne: (latex: string) => Promise<void>;
}) {
  const { t } = useT();
  const ocrMutation = trpc.unifiedAttempt.ocrHandwritingMultiStep.useMutation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "resizing" | "calling" | "review" | "committing" | "error"
  >("idle");
  const [steps, setSteps] = useState<
    Array<{
      stepNumber: number;
      latex: string;
      confidence: "high" | "medium" | "low" | "none";
      notes: string | null;
    }>
  >([]);
  const [imageNotes, setImageNotes] = useState<string | null>(null);
  const [errorMessageKey, setErrorMessageKey] = useState<keyof Messages | null>(
    null
  );
  const [quotaInfo, setQuotaInfo] = useState<{
    used: number;
    limit: number;
    resetsAtIso: string;
  } | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setSteps([]);
    setImageNotes(null);
    setErrorMessageKey(null);
    setQuotaInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const trigger = useCallback(() => {
    if (props.disabled || phase === "resizing" || phase === "calling") return;
    setErrorMessageKey(null);
    setQuotaInfo(null);
    fileInputRef.current?.click();
  }, [props.disabled, phase]);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setPhase("error");
        setErrorMessageKey("attempt.ocr_error_wrong_type");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setPhase("error");
        setErrorMessageKey("attempt.ocr_error_too_big");
        return;
      }
      try {
        setPhase("resizing");
        const dataUrl = await resizeImageDataUrl(file);
        setPhase("calling");
        const result = await ocrMutation.mutateAsync({
          imageDataUrl: dataUrl,
          uiLocale: props.locale,
          attemptId: props.attemptId
        });
        if (!result.ok) {
          setPhase("error");
          if (result.reason === "quota_exceeded") {
            setQuotaInfo(result.quota);
            setErrorMessageKey("attempt.ocr_quota_exceeded");
          } else {
            setErrorMessageKey("attempt.ocr_unavailable");
          }
          return;
        }
        setSteps(result.steps);
        setImageNotes(result.imageNotes);
        setPhase("review");
      } catch (err) {
        console.error("[multi-step-ocr-launcher] failed", err);
        setPhase("error");
        setErrorMessageKey("attempt.ocr_error_generic");
      }
    },
    [ocrMutation, props.attemptId, props.locale]
  );

  const handleCommit = useCallback(
    async (acceptedLatex: string[]) => {
      setPhase("committing");
      for (const latex of acceptedLatex) {
        // Sequential — preserves the same per-step grading order
        // that typed input gives. Each addStep triggers grading and
        // re-fetches the attempt; concurrent calls would race on
        // stepIndex.
        await props.onCommitOne(latex);
      }
      reset();
    },
    [props, reset]
  );

  const triggerLabel =
    phase === "resizing"
      ? t("attempt.ocr_resizing")
      : phase === "calling"
        ? t("attempt.ocr_calling")
        : t("attempt.ocr_multi_step_trigger");

  const isBusy = phase === "resizing" || phase === "calling";

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp"
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
        disabled={props.disabled || isBusy}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={trigger}
          disabled={props.disabled || isBusy}
        >
          {triggerLabel}
        </button>
        {phase === "error" ? (
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-700"
            onClick={reset}
          >
            {t("attempt.ocr_retry")}
          </button>
        ) : null}
      </div>
      {phase === "idle" ? (
        <p className="text-[11px]" style={{ color: "var(--subtle)" }}>
          {t("attempt.ocr_multi_step_hint")}
        </p>
      ) : null}
      {phase === "error" && errorMessageKey ? (
        <p className="text-xs text-red-600" role="alert">
          {errorMessageKey === "attempt.ocr_quota_exceeded" && quotaInfo
            ? t("attempt.ocr_quota_exceeded", {
                used: String(quotaInfo.used),
                limit: String(quotaInfo.limit)
              })
            : t(errorMessageKey)}
        </p>
      ) : null}
      <HandwritingMultiStepModal
        open={phase === "review" || phase === "committing"}
        steps={steps}
        imageNotes={imageNotes}
        locale={props.locale === "zh" ? "zh" : "en"}
        busy={phase === "committing"}
        onClose={() => {
          if (phase !== "committing") reset();
        }}
        onCommit={handleCommit}
      />
    </div>
  );
}

/**
 * Wraps MathFieldEditor with the parallel photo-OCR input path
 * (Sprint 1). Owns the OCR seed state so a successful scan refills
 * the math field, and bumps a remount key when the seed changes so
 * MathLive picks up the new initialValue cleanly.
 *
 * Design promise — typing is the primary path. The OCR button is
 * an OR alternative, not a wizard. If OCR returns low confidence
 * or fails entirely, the student just keeps typing — nothing about
 * the editor itself changes.
 */
function OcrAwareMathEditor(props: {
  baseInitialValue: string;
  /** Remount key from the parent (e.g. composerKey for the add-step composer) */
  outerKey?: string | number;
  onSave: (latex: string) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  saveLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
  locale: Locale;
}) {
  const { t } = useT();
  const ocrMutation = trpc.unifiedAttempt.ocrHandwritingStep.useMutation();
  // The "seed" value the math field starts with on this mount. Starts
  // as `baseInitialValue` (the step's saved LaTeX, or "" for new
  // steps) and is replaced by OCR output when a scan succeeds. The
  // student can then edit before saving.
  const [seedValue, setSeedValue] = useState(props.baseInitialValue);
  // Bumped on every successful OCR to force MathLive remount so the
  // new seed actually appears in the field. (MathLive doesn't
  // reliably hot-swap value when the parent re-renders without a
  // unique key.) Combined with `outerKey` for composer resets.
  const [ocrRefillKey, setOcrRefillKey] = useState(0);
  // Surfaces alongside the field to tell the student how much to
  // trust the OCR. Cleared when they next save / cancel.
  const [lastConfidence, setLastConfidence] = useState<
    Extract<OcrUploadResult, { ok: true }>["confidence"] | null
  >(null);
  const [lastNotes, setLastNotes] = useState<string | null>(null);
  // Distinct error states the toast layer below renders.
  const [errorBanner, setErrorBanner] = useState<
    "unavailable" | "client_exception" | null
  >(null);

  const handleOcr = useCallback(
    async (imageDataUrl: string): Promise<OcrUploadResult> => {
      try {
        const result = await ocrMutation.mutateAsync({
          imageDataUrl,
          uiLocale: props.locale
        });
        if (!result.ok) {
          setErrorBanner("unavailable");
          return { ok: false, reason: "vision_unavailable" };
        }
        setErrorBanner(null);
        if (result.confidence === "none") {
          // Model couldn't read it. Don't refill — just surface the
          // hint and let the student retry with a better photo.
          setLastConfidence("none");
          setLastNotes(result.notes);
          return result;
        }
        setSeedValue(result.latex);
        setOcrRefillKey((n) => n + 1);
        setLastConfidence(result.confidence);
        setLastNotes(result.notes);
        return result;
      } catch (err) {
        console.error("[ocr-aware-editor] mutation failed", err);
        setErrorBanner("client_exception");
        return { ok: false, reason: "mutation_exception" };
      }
    },
    [ocrMutation, props.locale]
  );

  const confidenceMessage =
    lastConfidence === "high"
      ? t("attempt.ocr_confidence_high")
      : lastConfidence === "medium"
        ? t("attempt.ocr_confidence_medium")
        : lastConfidence === "low"
          ? t("attempt.ocr_confidence_low")
          : lastConfidence === "none"
            ? t("attempt.ocr_confidence_none")
            : null;

  const confidenceTone =
    lastConfidence === "high"
      ? "text-emerald-700"
      : lastConfidence === "medium"
        ? "text-amber-700"
        : lastConfidence === "low"
          ? "text-orange-700"
          : "text-slate-500";

  // Combine the outer key (composer reset) with the OCR refill key
  // so either trigger remounts MathLive cleanly.
  const editorKey = `${props.outerKey ?? "static"}::${ocrRefillKey}`;

  return (
    <>
      <MathFieldEditor
        key={editorKey}
        initialValue={seedValue}
        onSave={(latex) => {
          // Clear OCR meta on save — next edit cycle starts fresh.
          setLastConfidence(null);
          setLastNotes(null);
          setErrorBanner(null);
          props.onSave(latex);
        }}
        onCancel={
          props.onCancel
            ? () => {
                setLastConfidence(null);
                setLastNotes(null);
                setErrorBanner(null);
                props.onCancel?.();
              }
            : undefined
        }
        onDelete={props.onDelete}
        saveLabel={props.saveLabel}
        busy={props.busy}
        autoFocus={props.autoFocus}
        ocrSlot={
          <HandwritingOcrUploader
            locale={props.locale === "zh" ? "zh" : "en"}
            disabled={props.busy}
            callOcr={handleOcr}
            onOcrResult={(r) => {
              // No-op for the success path — handled inside callOcr.
              // For visibility / future analytics we could log here.
              if (!r.ok) console.warn("[ocr-aware-editor]", r.reason);
            }}
          />
        }
      />
      {confidenceMessage ? (
        <p className={`mt-2 text-xs ${confidenceTone}`} aria-live="polite">
          {confidenceMessage}
          {lastNotes ? <span className="ml-2 text-slate-500">· {lastNotes}</span> : null}
        </p>
      ) : null}
      {/* The high-confidence case still benefits from a one-line "review
          before save" reminder — even at high confidence, OCR can flip
          a sign and we want students to glance once. */}
      {lastConfidence === "high" ? (
        <p className="mt-1 text-[11px]" style={{ color: "var(--subtle)" }}>
          {t("attempt.ocr_review_prompt")}
        </p>
      ) : null}
      {errorBanner === "unavailable" ? (
        <p className="mt-2 text-xs text-amber-700" role="alert">
          {t("attempt.ocr_unavailable")}
        </p>
      ) : null}
    </>
  );
}

function VerdictBadge({ verdict, backend }: { verdict: string; backend: string }) {
  const { t } = useT();
  const meta = VERDICT_TONE[verdict] ?? VERDICT_TONE.PENDING;
  const status = VERDICT_TAG_STATUS[meta.tone];
  // Trigger the stamp-land animation when a verdict transitions out of
  // PENDING. `key={verdict}` forces React to re-mount the element so
  // the CSS animation replays on every change.
  const animated = verdict === "VERIFIED" || verdict === "INVALID";
  return (
    <span
      key={verdict}
      className="tag"
      data-status={status}
      title={t("attempt.verdict_checked_by", { backend })}
      style={
        animated
          ? {
              animation:
                "stamp-land 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both"
            }
          : undefined
      }
    >
      <span aria-hidden style={{ marginRight: 4 }}>
        {meta.icon}
      </span>
      <span>{t(meta.labelKey)}</span>
      {verdict !== "PENDING" ? (
        <span
          style={{
            fontFamily: "var(--font-mono-custom)",
            fontWeight: 400,
            fontSize: 10,
            opacity: 0.7,
            marginLeft: 4,
            letterSpacing: "0.06em",
            textTransform: "uppercase"
          }}
        >
          {backend}
        </span>
      ) : null}
    </span>
  );
}

function Markdown({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="problem-statement text-sm leading-6 text-slate-700">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function renderLatexBlock(latex: string): string {
  const trimmed = latex.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("$") || trimmed.startsWith("\\[")) return trimmed;
  return `$$${trimmed}$$`;
}

function StepCard({
  step,
  locked,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  busy
}: {
  step: StepRecord;
  locked: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (latex: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { t, locale } = useT();
  const rendered = useMemo(() => renderLatexBlock(step.latexInput), [step.latexInput]);
  const showVerdict = step.verdict !== "PENDING";
  return (
    <li
      className="surface-card"
      style={{
        padding: 18,
        // Subtle entrance animation each time a step appears.
        animation: "rise-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) both"
      }}
    >
      <div
        className="flex flex-wrap items-center gap-2 text-xs"
        style={{ color: "var(--subtle)" }}
      >
        <span
          className="font-semibold"
          style={{
            color: "var(--foreground)",
            fontFamily: "var(--font-mono-custom)",
            letterSpacing: "0.04em"
          }}
        >
          {t("attempt.step_n_label", { n: step.stepIndex + 1 })}
        </span>
        {showVerdict ? (
          <span style={{ opacity: 0.7 }}>
            {step.classifiedStepType.replaceAll("_", " ").toLowerCase()}
          </span>
        ) : null}
        <span className="ml-auto">
          <VerdictBadge verdict={step.verdict} backend={step.verificationBackend} />
        </span>
      </div>

      {isEditing ? (
        <div className="mt-3">
          <OcrAwareMathEditor
            baseInitialValue={step.latexInput}
            outerKey={step.id}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            onDelete={onDelete}
            saveLabel={t("attempt.step_save")}
            busy={busy}
            autoFocus
            locale={locale}
          />
        </div>
      ) : (
        <div
          className="mt-3 p-4"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)"
          }}
        >
          <div
            className="problem-statement text-sm leading-7"
            style={{ color: "var(--foreground)" }}
          >
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {rendered}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {showVerdict && step.feedbackText ? (
        <div
          className="mt-3 p-4"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            animation: "rise-in 480ms cubic-bezier(0.2, 0.7, 0.2, 1) both"
          }}
        >
          <p
            className="text-[11px] font-semibold uppercase"
            style={{
              color: "var(--subtle)",
              letterSpacing: "0.14em",
              fontFamily: "var(--font-mono-custom)"
            }}
          >
            {t("attempt.tutor_note")}
          </p>
          <div className="mt-2">
            <Markdown text={step.feedbackText} />
          </div>
        </div>
      ) : null}

      {!isEditing && !locked ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <button type="button" className="btn-secondary" onClick={onStartEdit}>
            {t("attempt.step_edit")}
          </button>
          <button
            type="button"
            style={{
              color: "var(--subtle)",
              fontWeight: 500,
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              transition: "color 160ms ease, background 160ms ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--danger)";
              e.currentTarget.style.background = "var(--danger-soft)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--subtle)";
              e.currentTarget.style.background = "transparent";
            }}
            onClick={onDelete}
          >
            {t("attempt.step_delete")}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function EntryChooser({
  onChoose,
  busy
}: {
  onChoose: (params: { entryMode: EntryMode; selfReport: "SOLVED_CONFIDENT" | "ATTEMPTED_STUCK" | "NO_IDEA" }) => void;
  busy: boolean;
}) {
  const { t } = useT();
  const cards: Array<{
    entryMode: EntryMode;
    selfReport: "SOLVED_CONFIDENT" | "ATTEMPTED_STUCK" | "NO_IDEA";
    titleKey: keyof Messages;
    descKey: keyof Messages;
    accent: string;
  }> = [
    {
      entryMode: "ANSWER_ONLY",
      selfReport: "SOLVED_CONFIDENT",
      titleKey: "attempt.entry_card_solved_title",
      descKey: "attempt.entry_card_solved_body",
      accent: "border-emerald-300 hover:bg-emerald-50"
    },
    {
      entryMode: "STUCK_WITH_WORK",
      selfReport: "ATTEMPTED_STUCK",
      titleKey: "attempt.entry_card_stuck_title",
      descKey: "attempt.entry_card_stuck_body",
      accent: "border-amber-300 hover:bg-amber-50"
    },
    {
      entryMode: "HINT_GUIDED",
      selfReport: "NO_IDEA",
      titleKey: "attempt.entry_card_no_idea_title",
      descKey: "attempt.entry_card_no_idea_body",
      accent: "border-sky-300 hover:bg-sky-50"
    }
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("attempt.entry_intro")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.entryMode}
            type="button"
            disabled={busy}
            onClick={() => onChoose({ entryMode: c.entryMode, selfReport: c.selfReport })}
            className={`flex flex-col items-start gap-2 rounded-2xl border-2 bg-white p-4 text-left transition ${c.accent}`}
          >
            <span className="font-semibold text-slate-900">{t(c.titleKey)}</span>
            <span className="text-xs text-slate-600">{t(c.descKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AnswerOnlyInput({
  answerFormat,
  choiceOptions,
  onSubmit,
  busy
}: {
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
  choiceOptions: Array<{ label: string; text: string }>;
  onSubmit: (answer: string) => void;
  busy: boolean;
}) {
  const { t } = useT();
  const [answer, setAnswer] = useState("");
  const trimmed = answer.trim();

  if (answerFormat === "MULTIPLE_CHOICE" && choiceOptions.length > 0) {
    return (
      <div className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">{t("attempt.select_your_answer")}</legend>
          {choiceOptions.map((c) => (
            <label
              key={c.label}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm transition ${
                answer === c.label
                  ? "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,white)]"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="mc-answer"
                value={c.label}
                checked={answer === c.label}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <span className="flex-1 text-slate-700">
                <span className="block font-semibold text-slate-500">{c.label}.</span>
                <Markdown text={c.text} />
              </span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={trimmed.length === 0 || busy}
          onClick={() => onSubmit(trimmed)}
        >
          {busy ? t("attempt.submitting") : t("attempt.submit_answer")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm text-slate-700">
        {t("attempt.your_answer_label")}
        <input
          className="input-field mt-2"
          type="text"
          placeholder={answerFormat === "INTEGER" ? t("attempt.integer_placeholder") : t("attempt.your_answer_placeholder")}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn-primary w-full"
        disabled={trimmed.length === 0 || busy}
        onClick={() => onSubmit(trimmed)}
      >
        {busy ? t("attempt.submitting") : t("attempt.submit_answer")}
      </button>
    </div>
  );
}

export function UnifiedPracticeWorkspace({
  problemId,
  practiceRunId,
  answerFormat,
  choiceOptions,
  hintTutorEnabled = true
}: UnifiedPracticeWorkspaceProps) {
  const { t, locale } = useT();
  const utils = trpc.useUtils();
  const stateQuery = trpc.unifiedAttempt.getState.useQuery(
    { problemId, practiceRunId: practiceRunId ?? undefined },
    { refetchOnWindowFocus: false }
  );

  const chooseEntry = trpc.unifiedAttempt.chooseEntry.useMutation();
  const upgradeMode = trpc.unifiedAttempt.upgradeMode.useMutation();
  const addStep = trpc.unifiedAttempt.addStep.useMutation();
  const editStep = trpc.unifiedAttempt.editStep.useMutation();
  const deleteStep = trpc.unifiedAttempt.deleteStep.useMutation();
  const requestHint = trpc.unifiedAttempt.requestHint.useMutation();
  const nextStepHint = trpc.unifiedAttempt.nextStepHint.useMutation();
  const submit = trpc.unifiedAttempt.submit.useMutation();
  const startNew = trpc.unifiedAttempt.startNewAttempt.useMutation();

  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Held only for the *most recent* submission from this page load.
  // getState does NOT return this today — it's not persisted.
  const [reviewExtras, setReviewExtras] = useState<ReviewExtras | null>(null);
  // When a student reopens an already-submitted attempt, we block the
  // page behind a full-window modal asking whether they want to
  // continue viewing their submission or restart from scratch (clears
  // the prior attempt). This flag flips true when the student picks
  // one option, when they just submitted in this session (so the modal
  // doesn't pop instantly after they tap Submit), or when there is no
  // submitted attempt to gate on.
  const [resumeDecided, setResumeDecided] = useState(false);
  // Inline next-step hint suggested by the AI tutor when the student
  // clicks "Hint for next step" above the composer. Lives only in
  // component state — no DB persistence for v1 of this feature. We
  // auto-clear it when the student commits the next step (so it
  // doesn't linger after the action it was suggesting).
  const [latestNextStepHint, setLatestNextStepHint] = useState<
    string | null
  >(null);

  const attempt = (stateQuery.data?.attempt ?? null) as AttemptState | null;

  const refresh = useCallback(async () => {
    await utils.unifiedAttempt.getState.invalidate({
      problemId,
      practiceRunId: practiceRunId ?? undefined
    });
  }, [utils, problemId, practiceRunId]);

  const handleChoose = async (params: {
    entryMode: EntryMode;
    selfReport: "SOLVED_CONFIDENT" | "ATTEMPTED_STUCK" | "NO_IDEA";
  }) => {
    setError(null);
    try {
      await chooseEntry.mutateAsync({
        problemId,
        practiceRunId: practiceRunId ?? undefined,
        entryMode: params.entryMode,
        selfReport: params.selfReport
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attempt.error_failed_start_attempt"));
    }
  };

  const handleUpgradeMode = async (newMode: EntryMode) => {
    if (!attempt) return;
    setError(null);
    try {
      await upgradeMode.mutateAsync({ attemptId: attempt.id, entryMode: newMode });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attempt.error_failed_change_mode"));
    }
  };

  const handleAddStep = async (latex: string) => {
    if (!attempt) return;
    setError(null);
    try {
      await addStep.mutateAsync({ attemptId: attempt.id, latexInput: latex });
      setComposerKey((k) => k + 1);
      // The hint was for *that* step — it's no longer useful now that
      // the student committed something.
      setLatestNextStepHint(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attempt.error_failed_add_step"));
    }
  };

  const handleRequestNextStepHint = async () => {
    if (!attempt) return;
    setError(null);
    try {
      const result = await nextStepHint.mutateAsync({ attemptId: attempt.id });
      setLatestNextStepHint(result.hintText);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("attempt.error_failed_next_step_hint")
      );
    }
  };

  const handleEditStep = async (latex: string) => {
    if (!editingStepId) return;
    setError(null);
    try {
      await editStep.mutateAsync({ stepId: editingStepId, latexInput: latex });
      setEditingStepId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attempt.error_failed_edit_step"));
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    setError(null);
    try {
      await deleteStep.mutateAsync({ stepId });
      if (editingStepId === stepId) setEditingStepId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attempt.error_failed_delete_step"));
    }
  };

  const handleRequestHint = async () => {
    if (!attempt) return;
    setError(null);
    try {
      await requestHint.mutateAsync({ attemptId: attempt.id });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attempt.error_failed_fetch_hint"));
    }
  };

  const handleSubmit = async () => {
    if (!attempt) return;
    setError(null);
    try {
      const result = await submit.mutateAsync({
        attemptId: attempt.id,
        finalAnswer: finalAnswer.trim().length > 0 ? finalAnswer.trim() : undefined
      });
      setReviewExtras({
        milestoneCoverage: result.milestoneCoverage ?? [],
        recipeSteps: result.recipeSteps ?? []
      });
      setFinalAnswer("");
      // The attempt's status will flip to SUBMITTED on the next refresh.
      // Pre-flip resumeDecided so the gate-modal doesn't pop on top of
      // the student's freshly-rendered grading view.
      setResumeDecided(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attempt.error_failed_submit"));
    }
  };

  const handleStartNew = async () => {
    setError(null);
    try {
      await startNew.mutateAsync({ problemId, practiceRunId: practiceRunId ?? undefined });
      setFinalAnswer("");
      setEditingStepId(null);
      setComposerKey((k) => k + 1);
      setReviewExtras(null);
      // A fresh DRAFT replaces the SUBMITTED row; close the resume gate
      // so it doesn't pop again when the user submits and reloads.
      setResumeDecided(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attempt.error_failed_start_new"));
    }
  };

  // Pre-attempt entry chooser (skipped for proof problems).
  if (!attempt && answerFormat !== "PROOF") {
    return (
      <section className="surface-card space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{t("attempt.workspace_title_default")}</h2>
        </div>
        {stateQuery.isLoading ? (
          <p className="text-sm text-slate-500">{t("attempt.loading_state")}</p>
        ) : (
          <EntryChooser onChoose={handleChoose} busy={chooseEntry.isPending} />
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </section>
    );
  }

  // Proof problems auto-initialize as PROOF_STEPS.
  if (!attempt && answerFormat === "PROOF") {
    const autoInit = async () => {
      await handleChoose({ entryMode: "PROOF_STEPS", selfReport: "ATTEMPTED_STUCK" });
    };
    return (
      <section className="surface-card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t("attempt.workspace_title_proof")}</h2>
        <p className="text-sm text-slate-600">{t("attempt.proof_workspace_help")}</p>
        <button type="button" className="btn-primary" onClick={autoInit} disabled={chooseEntry.isPending}>
          {chooseEntry.isPending ? t("attempt.starting") : t("attempt.start_proof_attempt")}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </section>
    );
  }

  if (!attempt) return null;

  const locked = attempt.status !== "DRAFT";
  // Full-window modal that gates a re-entered SUBMITTED attempt with
  // "继续作答 / 重新作答". Rendered outside the section so it visually
  // covers the whole viewport. We hide it once the student chooses, or
  // immediately after a fresh submit (so the modal doesn't pop on top
  // of their just-graded result).
  const showResumeModal = locked && !resumeDecided;
  const mode: EntryMode = attempt.entryMode ?? (answerFormat === "PROOF" ? "PROOF_STEPS" : "ANSWER_ONLY");
  const steps = attempt.steps;
  const hintHistory = attempt.hintHistory;
  const hintsExhausted = hintHistory.length >= 3;

  const showSteps =
    mode === "STUCK_WITH_WORK" ||
    mode === "PROOF_STEPS" ||
    (mode === "HINT_GUIDED" && steps.length > 0);
  const showAnswerField =
    answerFormat !== "PROOF" &&
    (mode === "ANSWER_ONLY" || mode === "STUCK_WITH_WORK" || mode === "HINT_GUIDED");

  return (
    <>
      {showResumeModal ? (
        <ResumeDecisionModal
          onContinue={() => setResumeDecided(true)}
          onRestart={() => {
            if (
              typeof window !== "undefined" &&
              !window.confirm(t("attempt.continue_or_restart_confirm"))
            ) {
              return;
            }
            void handleStartNew();
          }}
          busy={startNew.isPending}
        />
      ) : null}
    <section className="surface-card space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            {answerFormat === "PROOF" ? t("attempt.workspace_title_proof") : t("attempt.workspace_title_default")}
          </h2>
          <ModeBadge mode={mode} locked={locked} />
        </div>
        {!locked ? (
          <p className="text-sm text-slate-600">
            {mode === "ANSWER_ONLY"
              ? t("attempt.workspace_subtitle_answer_only")
              : mode === "STUCK_WITH_WORK"
                ? t("attempt.workspace_subtitle_stuck")
                : mode === "HINT_GUIDED"
                  ? t("attempt.workspace_subtitle_hint_guided")
                  : t("attempt.workspace_subtitle_proof")}
          </p>
        ) : null}
      </div>

      {/* Hint history (HINT_GUIDED, or if stuck-mode student asked for hints).
          Each hint is rendered as a color-coded tile (level 1/2/3 = amber/
          teal/lavender) so successive hints feel distinct.
          Suppressed when the parent assignment turned hints off. */}
      {hintTutorEnabled && hintHistory.length > 0 ? (
        <div className="space-y-3">
          {hintHistory.map((h, idx) => {
            const tone =
              h.hintLevel === 1
                ? "tile-amber"
                : h.hintLevel === 2
                  ? "tile-teal"
                  : "tile-lavender";
            return (
              <div
                key={h.id}
                className={`tile ${tone}`}
                style={{
                  padding: 18,
                  animation:
                    idx === hintHistory.length - 1
                      ? "hint-reveal 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both"
                      : undefined
                }}
              >
                <p
                  className="mb-2 text-[11px] font-semibold uppercase"
                  style={{
                    letterSpacing: "0.14em",
                    fontFamily: "var(--font-mono-custom)",
                    color: "rgba(15, 17, 21, 0.7)"
                  }}
                >
                  {t("attempt.hint_label", { level: h.hintLevel })}
                </p>
                <Markdown text={h.hintText} />
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Steps list */}
      {showSteps && steps.length > 0 ? (
        <ol className="space-y-3">
          {steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              locked={locked}
              isEditing={editingStepId === step.id}
              onStartEdit={() => setEditingStepId(step.id)}
              onCancelEdit={() => setEditingStepId(null)}
              onSaveEdit={handleEditStep}
              onDelete={() => handleDeleteStep(step.id)}
              busy={editStep.isPending || deleteStep.isPending}
            />
          ))}
        </ol>
      ) : null}

      {/* Step composer — dashed border in muted tone so it reads as
          "empty slot waiting for input" rather than another card.
          Above it sits the "Hint for next step" button + banner which
          drives the per-step real-time feedback loop: write a step,
          see inline verdict + tutor note in the StepCard, optionally
          ask for a forward-looking hint before writing the next one. */}
      {!locked && showSteps && editingStepId === null ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleRequestNextStepHint}
              disabled={nextStepHint.isPending}
            >
              {nextStepHint.isPending
                ? t("attempt.next_step_hint_pending")
                : t("attempt.next_step_hint_button")}
            </button>
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              {t("attempt.next_step_hint_help")}
            </p>
          </div>

          {latestNextStepHint ? (
            <div
              style={{
                padding: 14,
                borderRadius: "var(--radius-md)",
                background: "var(--accent-soft)",
                border:
                  "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                animation:
                  "rise-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) both"
              }}
            >
              <div className="flex items-start gap-2">
                <span
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--accent-strong)",
                    letterSpacing: "0.14em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {t("attempt.next_step_hint_label")}
                </span>
                <button
                  type="button"
                  className="ml-auto text-xs"
                  style={{ color: "var(--subtle)" }}
                  onClick={() => setLatestNextStepHint(null)}
                  aria-label={t("attempt.next_step_hint_dismiss")}
                >
                  ✕
                </button>
              </div>
              <p
                className="mt-2 text-sm leading-6"
                style={{ color: "var(--foreground)" }}
              >
                {latestNextStepHint}
              </p>
            </div>
          ) : null}

          <div
            style={{
              padding: 18,
              background: "var(--surface-2)",
              border: "1.5px dashed var(--border-strong)",
              borderRadius: "var(--radius-lg)"
            }}
          >
            <p
              className="mb-3 text-[12px] font-semibold uppercase"
              style={{
                color: "var(--subtle)",
                letterSpacing: "0.14em",
                fontFamily: "var(--font-mono-custom)"
              }}
            >
              {t("attempt.add_step_label", { n: steps.length + 1 })}
            </p>
            {/* Sprint 2: batch multi-step OCR sits above the single
                composer field. Students who photograph a full page can
                use this to fill multiple steps at once via the review
                modal; students typing or doing single-step OCR ignore
                it. */}
            {attempt ? (
              <div className="mb-3">
                <MultiStepOcrLauncher
                  locale={locale}
                  attemptId={attempt.id}
                  disabled={addStep.isPending}
                  onCommitOne={handleAddStep}
                />
              </div>
            ) : null}
            <OcrAwareMathEditor
              baseInitialValue=""
              outerKey={composerKey}
              onSave={handleAddStep}
              saveLabel={t("attempt.add_step_button")}
              busy={addStep.isPending}
              locale={locale}
            />
            {addStep.isPending ? (
              <p
                className="mt-2 text-xs"
                style={{ color: "var(--subtle)" }}
              >
                {t("attempt.add_step_grading_inline")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Final answer field (for non-proof, non-ANSWER_ONLY we show it pre-submit).
          WORKED_SOLUTION → AnswerOnlyInput renders the same free-text field as
          EXPRESSION (we only have free-text vs choice-list anyway). The submit
          path on the server doesn't auto-grade WORKED_SOLUTION; the page wraps
          this workspace with a "reveal official solution" panel. */}
      {!locked && showAnswerField ? (
        mode === "ANSWER_ONLY" ? (
          <div
            style={{
              padding: 20,
              background: "var(--success-soft)",
              border:
                "1px solid color-mix(in srgb, var(--success) 22%, transparent)",
              borderRadius: "var(--radius-lg)"
            }}
          >
            <AnswerOnlyInput
              answerFormat={
                answerFormat === "WORKED_SOLUTION"
                  ? "EXPRESSION"
                  : (answerFormat as "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION")
              }
              choiceOptions={choiceOptions}
              onSubmit={(a) => {
                setFinalAnswer(a);
                submit
                  .mutateAsync({ attemptId: attempt.id, finalAnswer: a })
                  .then((result) => {
                    setReviewExtras({
                      milestoneCoverage: result.milestoneCoverage ?? [],
                      recipeSteps: result.recipeSteps ?? []
                    });
                    setFinalAnswer("");
                    return refresh();
                  })
                  .catch((err) => setError(err instanceof Error ? err.message : "Failed to submit."));
              }}
              busy={submit.isPending}
            />
          </div>
        ) : (
          <div
            style={{
              padding: 14,
              background: "var(--surface-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)"
            }}
          >
            <label
              className="block text-sm"
              style={{ color: "var(--foreground)" }}
            >
              {t("attempt.final_answer_label_optional")}
              <input
                className="input-field mt-2"
                type="text"
                placeholder={t("attempt.final_answer_placeholder")}
                value={finalAnswer}
                onChange={(e) => setFinalAnswer(e.target.value)}
              />
            </label>
          </div>
        )
      ) : null}

      {/* Mode switching + hint button (only for non-ANSWER_ONLY, non-proof).
          The hint-tutor gate hides every hint button. Mode-switch buttons
          (write steps / got an answer) stay visible because they're not
          AI-assisted — students should still be able to change strategy. */}
      {!locked && answerFormat !== "PROOF" && mode !== "ANSWER_ONLY" ? (
        <div className="flex flex-wrap items-center gap-2">
          {mode === "HINT_GUIDED" ? (
            <>
              {hintTutorEnabled ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRequestHint}
                  disabled={requestHint.isPending || hintsExhausted}
                >
                  {requestHint.isPending
                    ? t("attempt.loading_hint")
                    : hintsExhausted
                      ? t("attempt.all_hints_used")
                      : t("attempt.show_hint_n", { n: hintHistory.length + 1 })}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleUpgradeMode("STUCK_WITH_WORK")}
                disabled={upgradeMode.isPending}
              >
                {t("attempt.try_writing_steps")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleUpgradeMode("ANSWER_ONLY")}
                disabled={upgradeMode.isPending}
              >
                {t("attempt.got_an_answer")}
              </button>
            </>
          ) : mode === "STUCK_WITH_WORK" ? (
            <>
              {hintTutorEnabled && !hintsExhausted ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRequestHint}
                  disabled={requestHint.isPending}
                >
                  {requestHint.isPending
                    ? t("attempt.loading_hint")
                    : t("attempt.stuck_show_hint_n", { n: hintHistory.length + 1 })}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {/* Submit row — emphasized as the page's primary CTA. Uses the
          warm cream sub-surface so the dark pill button is the focal
          point. */}
      {!locked && mode !== "ANSWER_ONLY" ? (
        <div
          className="flex items-center justify-between gap-3 p-4"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)"
          }}
        >
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {mode === "PROOF_STEPS"
              ? t("attempt.submit_row_proof")
              : t("attempt.submit_row_default")}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submit.isPending}
          >
            {submit.isPending ? (
              <>
                <span
                  className="engine-dot"
                  aria-hidden
                  style={{ background: "var(--action-foreground)" }}
                />
                {t("attempt.grading")}
              </>
            ) : (
              t("attempt.submit_for_review")
            )}
          </button>
        </div>
      ) : null}

      {/* Post-submit results */}
      {locked ? (
        <SubmittedReview
          attempt={attempt}
          answerFormat={answerFormat}
          reviewExtras={reviewExtras}
          onStartNew={handleStartNew}
          startBusy={startNew.isPending}
        />
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
    </>
  );
}

/**
 * Full-window modal shown when a student reopens a previously SUBMITTED
 * attempt. Forces an explicit choice (continue viewing or restart from
 * scratch) before they can see the graded view underneath. Used to live
 * as an inline panel on top of SubmittedReview, but pilot students kept
 * missing the Restart affordance — making it a blocking gate puts the
 * choice front-and-center.
 *
 * The Restart path delegates to the same handleStartNew handler used
 * elsewhere; that mutation abandons both DRAFT and SUBMITTED rows so
 * the next /getState returns a fresh DRAFT.
 */
function ResumeDecisionModal({
  onContinue,
  onRestart,
  busy
}: {
  onContinue: () => void;
  onRestart: () => void;
  busy: boolean;
}) {
  const { t } = useT();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-decision-title"
      style={{
        position: "fixed",
        inset: 0,
        // Slightly translucent so the page underneath is hinted at but
        // unreachable. The dialog itself sits on var(--surface-card).
        background: "color-mix(in srgb, var(--background) 78%, transparent)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--surface-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 28,
          boxShadow: "var(--shadow-lg)"
        }}
        className="space-y-4"
      >
        <p
          className="text-[11px] font-semibold uppercase"
          style={{
            color: "var(--subtle)",
            letterSpacing: "0.14em",
            fontFamily: "var(--font-mono-custom)"
          }}
        >
          {t("attempt.continue_or_restart_label")}
        </p>
        <h2
          id="resume-decision-title"
          style={{
            fontSize: "1.4rem",
            fontWeight: 700,
            color: "var(--foreground)"
          }}
        >
          {t("attempt.continue_or_restart_modal_title")}
        </h2>
        <p
          className="text-sm"
          style={{ color: "var(--muted)", lineHeight: 1.55 }}
        >
          {t("attempt.continue_or_restart_body")}
        </p>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn-secondary"
            onClick={onContinue}
            disabled={busy}
          >
            {t("attempt.continue_view_submission")}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onRestart}
            disabled={busy}
          >
            {busy
              ? t("attempt.starting")
              : t("attempt.continue_or_restart_restart")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeBadge({ mode, locked }: { mode: EntryMode; locked: boolean }) {
  const { t } = useT();
  const labelKeys: Record<EntryMode, keyof Messages> = {
    ANSWER_ONLY: "attempt.mode_badge_answer_only",
    STUCK_WITH_WORK: "attempt.mode_badge_stuck",
    HINT_GUIDED: "attempt.mode_badge_hint_guided",
    PROOF_STEPS: "attempt.mode_badge_proof"
  };
  return (
    <span className="badge">
      {t(labelKeys[mode])} {locked ? `· ${t("attempt.mode_badge_submitted_suffix")}` : ""}
    </span>
  );
}

// Milestone-coverage status styling. Each status maps to an inline
// `style` block that draws from the design-system tokens so colors
// match the rest of the app (and bilingual/Chinese gloss reads
// correctly on the cream page).
type CoverageStatusStyle = {
  bg: string;
  border: string;
  color: string;
};
const COVERAGE_META: Record<
  string,
  { labelKey: keyof Messages; icon: string; style: CoverageStatusStyle }
> = {
  ESTABLISHED: {
    labelKey: "attempt.coverage_status_established",
    icon: "✓",
    style: {
      bg: "var(--success-soft)",
      border: "color-mix(in srgb, var(--success) 28%, transparent)",
      color: "var(--success)"
    }
  },
  REPLACED: {
    labelKey: "attempt.coverage_status_replaced",
    icon: "↻",
    style: {
      bg: "var(--accent-soft)",
      border: "color-mix(in srgb, var(--accent) 30%, transparent)",
      color: "var(--accent-strong)"
    }
  },
  PARTIAL: {
    labelKey: "attempt.coverage_status_partial",
    icon: "◐",
    style: {
      bg: "var(--warning-soft)",
      border: "color-mix(in srgb, var(--warning) 30%, transparent)",
      color: "var(--warning)"
    }
  },
  MISSING: {
    labelKey: "attempt.coverage_status_missing",
    icon: "○",
    style: {
      bg: "var(--surface-2)",
      border: "var(--border)",
      color: "var(--muted)"
    }
  },
  INVALID: {
    labelKey: "attempt.coverage_status_invalid",
    icon: "✗",
    style: {
      bg: "var(--danger-soft)",
      border: "color-mix(in srgb, var(--danger) 30%, transparent)",
      color: "var(--danger)"
    }
  }
};

function MilestoneCoverageChecklist({
  coverage,
  recipeSteps
}: {
  coverage: MilestoneCoverageEntry[];
  recipeSteps: RecipeStepMeta[];
}) {
  const { t } = useT();
  if (coverage.length === 0) return null;
  // Merge recipe title + technique tags with coverage entries by index.
  // If recipeSteps is empty (older server, or solutionRecipe unavailable)
  // we still render the status pills with bare indices.
  const byIndex = new Map<number, RecipeStepMeta>();
  for (const s of recipeSteps) byIndex.set(s.index, s);
  return (
    <div className="surface-card" style={{ padding: 20 }}>
      <p
        className="mb-3 text-[11px] font-semibold uppercase"
        style={{
          color: "var(--subtle)",
          letterSpacing: "0.14em",
          fontFamily: "var(--font-mono-custom)"
        }}
      >
        {t("attempt.coverage_heading")}
      </p>
      <ul className="flex flex-col gap-2">
        {coverage
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((c, idx) => {
            const meta = COVERAGE_META[c.status] ?? COVERAGE_META.MISSING;
            const step = byIndex.get(c.index);
            return (
              <li
                key={c.index}
                style={{
                  padding: 14,
                  background: meta.style.bg,
                  border: `1px solid ${meta.style.border}`,
                  color: meta.style.color,
                  borderRadius: "var(--radius-md)",
                  animation: `rise-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) ${
                    idx * 60
                  }ms both`
                }}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span aria-hidden className="text-base leading-none">
                    {meta.icon}
                  </span>
                  <span className="uppercase" style={{ letterSpacing: "0.08em" }}>
                    {t(meta.labelKey)}
                  </span>
                  <span style={{ opacity: 0.7 }}>
                    {t("attempt.coverage_milestone_label", { index: c.index })}
                  </span>
                  {step?.technique && step.technique.length > 0 ? (
                    <span className="ml-auto flex flex-wrap gap-1 text-[10px] font-medium opacity-70">
                      {step.technique.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-current/30 bg-white/60 px-1.5 py-0.5"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
                {step?.title ? (
                  <p className="mt-1 text-sm font-semibold">{step.title}</p>
                ) : null}
                {c.evidence ? (
                  <p className="mt-1 text-sm leading-6 opacity-90">{c.evidence}</p>
                ) : null}
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// Strip the "Milestone coverage:\n ..." block we append server-side to
// overallFeedback. When we render the structured checklist we don't
// want the bullet dump showing up twice.
function stripFoldedCoverage(text: string | null): string | null {
  if (!text) return text;
  const idx = text.indexOf("\n\nMilestone coverage:\n");
  if (idx === -1) return text;
  return text.slice(0, idx);
}

function SubmittedReview({
  attempt,
  answerFormat,
  reviewExtras,
  onStartNew,
  startBusy
}: {
  attempt: AttemptState;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION" | "PROOF" | "WORKED_SOLUTION";
  reviewExtras: ReviewExtras | null;
  onStartNew: () => void;
  startBusy: boolean;
}) {
  const { t } = useT();
  const verifiedCount = attempt.steps.filter((s) => s.verdict === "VERIFIED").length;
  // Note: ERROR means "we couldn't run the verifier on this step" (e.g.
  // SymPy parse failure) — NOT that the step is mathematically wrong.
  // Lumping ERROR into invalidCount produces false-INVALID badges like
  // the "n=1, a=1, b=2, c=2" substitution incident — the student's
  // values were correct but we displayed ✗ because the parser choked.
  // We now route ERROR into softCount (rendered as "needs review") and
  // reserve invalidCount for verdicts we have actual evidence of error.
  const invalidCount = attempt.steps.filter((s) => s.verdict === "INVALID").length;
  const softCount = attempt.steps.filter(
    (s) => s.verdict === "PLAUSIBLE" || s.verdict === "UNKNOWN" || s.verdict === "ERROR"
  ).length;

  const hasStructuredCoverage = (reviewExtras?.milestoneCoverage?.length ?? 0) > 0;
  const feedbackForDisplay = hasStructuredCoverage
    ? stripFoldedCoverage(attempt.overallFeedback)
    : attempt.overallFeedback;

  // WORKED_SOLUTION submissions aren't auto-graded — `isCorrect` is
  // always false on the server, which would otherwise paint the
  // student's answer red. Show their answer in a neutral
  // "ungraded — see official solution below" box instead.
  const autoGraded = answerFormat !== "PROOF" && answerFormat !== "WORKED_SOLUTION";
  return (
    <div className="space-y-3">
      {/* The Continue / Restart choice used to be an inline panel at the
          top of SubmittedReview, but pilot testers regularly missed
          the Restart button. It's now a full-window blocking modal
          rendered by the parent UnifiedPracticeWorkspace before this
          component mounts. SubmittedReview itself just shows the graded
          view below. */}
      <div data-submitted-review-body className="space-y-3">

      {answerFormat !== "PROOF" && attempt.submittedAnswer !== null ? (
        autoGraded ? (
          <div
            style={{
              padding: 18,
              borderRadius: "var(--radius-lg)",
              border: `1px solid ${
                attempt.isCorrect
                  ? "color-mix(in srgb, var(--success) 28%, transparent)"
                  : "color-mix(in srgb, var(--danger) 28%, transparent)"
              }`,
              background: attempt.isCorrect
                ? "var(--success-soft)"
                : "var(--danger-soft)",
              color: attempt.isCorrect ? "var(--success)" : "var(--danger)",
              animation:
                "stamp-land 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both"
            }}
          >
            <p
              className="text-[11px] font-semibold uppercase"
              style={{
                letterSpacing: "0.14em",
                fontFamily: "var(--font-mono-custom)"
              }}
            >
              {t("attempt.review_answer_label")}:{" "}
              {attempt.isCorrect
                ? t("attempt.review_correct_short")
                : t("attempt.review_incorrect_short")}
            </p>
            <p className="mt-2 text-sm">
              {t("attempt.review_your_answer")}:{" "}
              <span className="font-semibold">{attempt.submittedAnswer}</span>
            </p>
            {!attempt.isCorrect && attempt.explanationText ? (
              <div className="mt-2">
                <Markdown text={attempt.explanationText} />
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              padding: 18,
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--foreground)"
            }}
          >
            <p
              className="text-[11px] font-semibold uppercase"
              style={{
                color: "var(--subtle)",
                letterSpacing: "0.14em",
                fontFamily: "var(--font-mono-custom)"
              }}
            >
              {t("attempt.review_answer_label")}:{" "}
              {t("attempt.review_ungraded_short")}
            </p>
            <p className="mt-2 text-sm">
              {t("attempt.review_your_answer")}:{" "}
              <span className="font-semibold">{attempt.submittedAnswer}</span>
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--subtle)" }}>
              {t("attempt.review_ungraded_hint")}
            </p>
          </div>
        )
      ) : null}

      {attempt.steps.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 text-xs"
          style={{ color: "var(--muted)" }}
        >
          <span className="tag" data-status="verified">
            ✓ {verifiedCount}
          </span>
          <span className="tag" data-status="pending">
            ⚠ {softCount}
          </span>
          <span className="tag" data-status="invalid">
            ✗ {invalidCount}
          </span>
          {attempt.submittedAt ? (
            <span className="ml-auto" style={{ color: "var(--subtle)" }}>
              {t("attempt.review_submitted_at", {
                time: new Date(attempt.submittedAt).toLocaleString()
              })}
            </span>
          ) : null}
        </div>
      ) : null}

      {hasStructuredCoverage ? (
        <MilestoneCoverageChecklist
          coverage={reviewExtras!.milestoneCoverage}
          recipeSteps={reviewExtras!.recipeSteps}
        />
      ) : null}

      {feedbackForDisplay ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("attempt.review_overall_label")}</p>
          <Markdown text={feedbackForDisplay} />
        </div>
      ) : null}

      {attempt.hintsUsedCount > 0 ? (
        <p className="text-xs text-slate-500">
          {t("attempt.review_hints_used", { count: attempt.hintsUsedCount })}
        </p>
      ) : null}

      <button type="button" className="btn-secondary w-full" onClick={onStartNew} disabled={startBusy}>
        {startBusy ? t("attempt.starting") : t("attempt.review_start_new")}
      </button>
      </div>
    </div>
  );
}
