"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

/**
 * Multi-step review modal (Sprint 2).
 *
 * Lifecycle:
 *   1. Parent opens the modal with the OCR'd steps array.
 *   2. Each step row shows: index · confidence chip · rendered preview
 *      · per-step note · per-step action buttons (Accept / Edit / Skip).
 *   3. The student walks the list. Edited steps update local state;
 *      skipped steps are excluded from the final commit.
 *   4. "Save all" calls `onCommit` with the final ordered array of
 *      LaTeX strings — the parent then fires `addStep` mutations
 *      one by one (preserving the same per-step grading flow as
 *      typed input).
 *
 * Why local edits (vs hot-routing to MathLive immediately): students
 * need a readable rendered preview first, while rare symbol fixes are
 * still fastest in one compact textarea.
 */

export type OcrMultiStepInputItem = {
  stepNumber: number;
  latex: string;
  confidence: "high" | "medium" | "low" | "none";
  notes: string | null;
  sourceLabel?: string;
};

export type HandwritingMultiStepModalProps = {
  open: boolean;
  steps: OcrMultiStepInputItem[];
  imageNotes: string | null;
  locale: "en" | "zh";
  reviewMode?: "steps" | "sections";
  /** True while the parent is mid-commit (firing addStep mutations). */
  busy?: boolean;
  onClose: () => void;
  /**
   * Called with the final ordered list of LaTeX strings the student
   * accepted. Steps marked "skipped" are excluded. Parent should fire
   * addStep mutations sequentially and update the visible step list.
   */
  onCommit: (acceptedLatex: string[]) => void;
};

type RowState = {
  // Current text — initialised from OCR latex, updated on edits.
  text: string;
  // Whether the student excluded this step from the commit.
  skipped: boolean;
};

const LABELS: Record<"en" | "zh", {
  title: string;
  sectionTitle: string;
  subtitle: string;
  sectionSubtitle: string;
  imageNotesPrefix: string;
  empty: string;
  emptySections: string;
  step: string;
  section: string;
  confHigh: string;
  confMedium: string;
  confLow: string;
  confNone: string;
  skip: string;
  unskip: string;
  edit: string;
  collapse: string;
  saveAll: string;
  saveSelected: string;
  saveSelectedSections: string;
  cancel: string;
  busy: string;
  latexLabel: string;
}> = {
  en: {
    title: "Review and save steps",
    sectionTitle: "Review and save solution sections",
    subtitle:
      "Edit any step that looks off. Skip steps you'd rather type yourself.",
    sectionSubtitle:
      "Check each section at a high level. Edit only if something important is wrong.",
    imageNotesPrefix: "Image note:",
    empty:
      "OCR didn't find any steps in this photo. Close this dialog and try a clearer photo or type the steps directly.",
    emptySections:
      "OCR didn't find readable solution text. Close this dialog and try clearer photos or type the solution directly.",
    step: "Step",
    section: "Section",
    confHigh: "High confidence",
    confMedium: "Medium · check the symbols",
    confLow: "Low · please verify",
    confNone: "Unreadable",
    skip: "Skip",
    unskip: "Include",
    edit: "Edit",
    collapse: "Done",
    saveAll: "Save all",
    saveSelected: "Save {n} step(s)",
    saveSelectedSections: "Save {n} section(s)",
    cancel: "Cancel",
    busy: "Saving…",
    latexLabel: "LaTeX"
  },
  zh: {
    title: "校对并保存步骤",
    sectionTitle: "校对并保存解答段落",
    subtitle: "校对任何识别有问题的步骤。想自己重新打字的步骤选「跳过」即可。",
    sectionSubtitle: "按段落快速检查。只有重要内容识别错了再编辑。",
    imageNotesPrefix: "图片注记：",
    empty: "OCR 在这张照片里没找到任何步骤。请关闭对话框，换张清楚一点的照片，或直接打字。",
    emptySections: "OCR 没有识别出可读的解答内容。请关闭对话框，换更清楚的照片，或直接打字。",
    step: "第",
    section: "段落",
    confHigh: "可信度：高",
    confMedium: "可信度：中——请核对符号",
    confLow: "可信度：低——请仔细校对",
    confNone: "无法识别",
    skip: "跳过",
    unskip: "包含",
    edit: "编辑",
    collapse: "完成",
    saveAll: "全部保存",
    saveSelected: "保存 {n} 步",
    saveSelectedSections: "保存 {n} 段",
    cancel: "取消",
    busy: "保存中…",
    latexLabel: "LaTeX"
  }
};

function renderLatexPreview(latex: string): string {
  const trimmed = latex.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("$") || line.startsWith("\\[") || line.includes("$")) {
        return line;
      }
      return `$$${line}$$`;
    })
    .join("\n\n");
}

export function HandwritingMultiStepModal(props: HandwritingMultiStepModalProps) {
  const labels = LABELS[props.locale];
  const reviewMode = props.reviewMode ?? "steps";
  const isSectionReview = reviewMode === "sections";
  // Track per-row state. Re-initialise when the modal re-opens with a
  // new set of steps (the parent passes a new array reference).
  const [rows, setRows] = useState<Record<number, RowState>>(() =>
    Object.fromEntries(
      props.steps.map((s, idx) => [idx, { text: s.latex, skipped: false }])
    )
  );
  // Editing row UI state. -1 = no row in edit mode (the default).
  const [editingIdx, setEditingIdx] = useState<number>(-1);

  // Re-seed on `steps` prop change (e.g. user re-uploaded a photo).
  // Tracked via JSON.stringify of latex+confidence rather than a full
  // ref equality so re-rendering with the same steps doesn't reset
  // accidentally.
  const stepsKey = useMemo(
    () =>
      props.steps
        .map((s) => `${s.sourceLabel ?? ""}::${s.latex}::${s.confidence}`)
        .join("|"),
    [props.steps]
  );
  useEffect(() => {
    setRows(
      Object.fromEntries(
        props.steps.map((s, idx) => [idx, { text: s.latex, skipped: false }])
      )
    );
    setEditingIdx(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey]);

  const toggleSkip = useCallback((idx: number) => {
    setRows((r) => ({
      ...r,
      [idx]: { ...r[idx], skipped: !r[idx].skipped }
    }));
  }, []);

  const updateText = useCallback((idx: number, text: string) => {
    setRows((r) => ({ ...r, [idx]: { ...r[idx], text } }));
  }, []);

  const acceptedRows = useMemo(
    () =>
      props.steps
        .map((s, idx) => ({ idx, latex: rows[idx]?.text ?? s.latex, skipped: rows[idx]?.skipped ?? false }))
        .filter((r) => !r.skipped && r.latex.trim().length > 0),
    [props.steps, rows]
  );

  const commit = useCallback(() => {
    if (acceptedRows.length === 0) return;
    props.onCommit(acceptedRows.map((r) => r.latex.trim()));
  }, [acceptedRows, props]);

  if (!props.open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ocr-multi-step-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
    >
      <div
        className="surface-card"
        style={{
          width: "min(860px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: 22
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="ocr-multi-step-modal-title"
              className="text-lg font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              {isSectionReview ? labels.sectionTitle : labels.title}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {isSectionReview ? labels.sectionSubtitle : labels.subtitle}
            </p>
          </div>
          <button
            type="button"
            className="text-sm"
            style={{ color: "var(--subtle)" }}
            onClick={props.onClose}
            disabled={props.busy}
          >
            ×
          </button>
        </div>

        {props.imageNotes ? (
          <p
            className="mt-3 text-xs"
            style={{
              padding: 10,
              borderRadius: "var(--radius-md)",
              background: "var(--warning-soft)",
              border:
                "1px solid color-mix(in srgb, var(--warning) 28%, transparent)",
              color: "var(--foreground)"
            }}
          >
            <strong>{labels.imageNotesPrefix}</strong> {props.imageNotes}
          </p>
        ) : null}

        {props.steps.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
            {isSectionReview ? labels.emptySections : labels.empty}
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {props.steps.map((s, idx) => {
              const row = rows[idx] ?? { text: s.latex, skipped: false };
              const isEditing = editingIdx === idx;
              const showSourceHeader =
                Boolean(s.sourceLabel) &&
                (idx === 0 || props.steps[idx - 1]?.sourceLabel !== s.sourceLabel);
              const itemLabel = isSectionReview ? labels.section : labels.step;
              const confLabel =
                s.confidence === "high"
                  ? labels.confHigh
                  : s.confidence === "medium"
                    ? labels.confMedium
                    : s.confidence === "low"
                      ? labels.confLow
                      : labels.confNone;
              const confTone =
                s.confidence === "high"
                  ? "text-emerald-700"
                  : s.confidence === "medium"
                    ? "text-amber-700"
                    : s.confidence === "low"
                      ? "text-orange-700"
                      : "text-slate-500";
              return (
                <Fragment key={idx}>
                  {showSourceHeader ? (
                    <li className="list-none pt-2 first:pt-0">
                      <div
                        className="text-[11px] font-semibold uppercase"
                        style={{
                          color: "var(--subtle)",
                          letterSpacing: "0.08em",
                          fontFamily: "var(--font-mono-custom)"
                        }}
                      >
                        {s.sourceLabel}
                      </div>
                    </li>
                  ) : null}
                <li
                  className="border p-3"
                  style={{
                    background: row.skipped
                      ? "var(--surface-2)"
                      : "var(--surface-card)",
                    borderColor: "var(--border)",
                    borderRadius: "var(--radius-md)",
                    opacity: row.skipped ? 0.55 : 1
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-xs font-semibold uppercase"
                        style={{
                          color: "var(--subtle)",
                          letterSpacing: "0.08em",
                          fontFamily: "var(--font-mono-custom)"
                        }}
                      >
                        {itemLabel} {s.stepNumber}
                      </span>
                    </div>
                    <span className={`text-xs ${confTone}`}>{confLabel}</span>
                  </div>

                  <div
                    className="problem-statement mt-2 overflow-x-auto p-3 text-sm leading-7"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--foreground)"
                    }}
                  >
                    {row.text.trim().length > 0 ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {renderLatexPreview(row.text)}
                      </ReactMarkdown>
                    ) : (
                      <span style={{ color: "var(--subtle)" }}>(empty)</span>
                    )}
                  </div>

                  {isEditing ? (
                    <label
                      className="mt-2 block text-[11px] font-semibold uppercase"
                      style={{
                        color: "var(--subtle)",
                        letterSpacing: "0.08em",
                        fontFamily: "var(--font-mono-custom)"
                      }}
                    >
                      {labels.latexLabel}
                      <textarea
                        className="mt-1 w-full rounded-md border p-2 text-sm font-mono normal-case"
                        style={{
                          borderColor: "var(--border)",
                          minHeight: "4.5rem",
                          letterSpacing: 0
                        }}
                        value={row.text}
                        onChange={(e) => updateText(idx, e.target.value)}
                        autoFocus
                      />
                    </label>
                  ) : null}

                  {s.notes ? (
                    <p
                      className="mt-2 text-[11px]"
                      style={{ color: "var(--subtle)" }}
                    >
                      {s.notes}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!isEditing ? (
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => setEditingIdx(idx)}
                        disabled={row.skipped || props.busy}
                      >
                        {labels.edit}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        onClick={() => setEditingIdx(-1)}
                      >
                        {labels.collapse}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => toggleSkip(idx)}
                      disabled={props.busy}
                    >
                      {row.skipped ? labels.unskip : labels.skip}
                    </button>
                  </div>
                </li>
                </Fragment>
              );
            })}
          </ol>
        )}

        <div
          className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={props.onClose}
            disabled={props.busy}
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={props.busy || acceptedRows.length === 0}
            onClick={commit}
          >
            {props.busy
              ? labels.busy
              : acceptedRows.length === props.steps.length
                ? labels.saveAll
                : (isSectionReview
                    ? labels.saveSelectedSections
                    : labels.saveSelected
                  ).replace(
                    "{n}",
                    String(acceptedRows.length)
                  )}
          </button>
        </div>
      </div>
    </div>
  );
}
