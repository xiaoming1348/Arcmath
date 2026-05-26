"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type MathFieldElement = HTMLElement & {
  value: string;
  getValue?: () => string;
  setValue?: (value: string) => void;
  // MathLive exposes these as JS properties on the element. We set
  // them via useEffect because some React/web-component edge cases
  // don't reliably forward boolean attributes from JSX. See the
  // useEffect below.
  smartMode?: boolean;
  smartFence?: boolean;
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.Ref<MathFieldElement>;
      };
    }
  }
}

export type MathFieldEditorProps = {
  initialValue: string;
  onSave: (latex: string) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  saveLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
  busy?: boolean;
  minHeight?: string;
  /**
   * Optional auxiliary input affordance — typically the handwriting
   * OCR uploader. Rendered between the math field and the action
   * buttons so the visual hierarchy is: [edit math] [or pick file]
   * [save / cancel]. Kept opt-in so callers that don't want OCR
   * (e.g. the final-answer field) stay clean.
   */
  ocrSlot?: ReactNode;
};

export function MathFieldEditor({
  initialValue,
  onSave,
  onCancel,
  onDelete,
  saveLabel = "Save",
  placeholder,
  autoFocus,
  busy,
  minHeight = "3rem",
  ocrSlot
}: MathFieldEditorProps) {
  const fieldRef = useRef<MathFieldElement | null>(null);
  const [ready, setReady] = useState(false);
  const [currentValue, setCurrentValue] = useState(initialValue);

  useEffect(() => {
    let mounted = true;
    import("mathlive")
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch((err: unknown) => {
        console.error("[math-field-editor] failed to load mathlive", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el || !ready) return;
    if (typeof el.setValue === "function") {
      el.setValue(initialValue);
    } else {
      el.value = initialValue;
    }
    if (placeholder) el.setAttribute("placeholder", placeholder);
    // Enable smart-mode imperatively. The JSX attribute is a backup;
    // setting the JS property here is what MathLive actually reads at
    // runtime in some versions. Without this, proof writers cannot
    // type prose with spaces — "Suppose n is even" renders as
    // "Supposenisven" because letters juxtapose in pure math mode.
    el.smartMode = true;
    // smart-fence keeps auto-closing of brackets, which we generally
    // want for math typing. Same boolean property reset.
    el.smartFence = true;
    setCurrentValue(initialValue);
    if (autoFocus) {
      setTimeout(() => el.focus?.(), 50);
    }
  }, [initialValue, placeholder, ready, autoFocus]);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el || !ready) return;
    const handler = (event: Event) => {
      const target = event.target as MathFieldElement | null;
      setCurrentValue(target?.value ?? "");
    };
    el.addEventListener("input", handler);
    return () => {
      el.removeEventListener("input", handler);
    };
  }, [ready]);

  const trimmed = currentValue.trim();
  const canSave = trimmed.length > 0 && !busy;

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        {ready ? (
          // smart-mode: MathLive auto-detects "word-like" letter
          // sequences and switches to text mode for them, so a student
          // can write "Suppose n=1 and a=2" with spaces between words
          // and have it render properly. Without this attribute, the
          // entire input stays in math mode — variables juxtapose
          // (no rendered spaces) and prose becomes unreadable.
          //
          // text-mode escape: pressing Esc or quote-key explicitly
          // toggles between math/text mode if smart detection misses.
          // See https://cortexjs.io/mathlive/guides/interacting/
          <math-field
            ref={(node: HTMLElement | null) => {
              fieldRef.current = node as MathFieldElement | null;
            }}
            smart-mode="true"
            style={{ width: "100%", minHeight, display: "block", fontSize: "1.05rem", outline: "none" }}
          />
        ) : (
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" aria-label="Loading formula editor" />
        )}
      </div>
      <p className="text-[11px]" style={{ color: "var(--subtle)" }}>
        {/* Pilot guidance — tell students how to mix prose + math without
            digging through MathLive docs. */}
        Tip: words typed together (e.g. <code>Suppose</code>, <code>therefore</code>) auto-switch to text mode.
        Single letters stay as math variables. Press <kbd>Esc</kbd> to force-toggle modes mid-step.
      </p>
      {/* OCR slot — sits between the math field and the save buttons so
          it's clear to the student that this is an ALTERNATIVE input
          path (not part of the main edit/save flow). Hidden entirely
          when the parent doesn't pass the slot, so existing call sites
          that don't want OCR aren't affected. */}
      {ocrSlot ? <div className="pt-1">{ocrSlot}</div> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={!canSave} onClick={() => onSave(trimmed)}>
          {busy ? "Saving…" : saveLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className="ml-auto text-xs text-slate-500 hover:text-red-600"
            onClick={onDelete}
            disabled={busy}
          >
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
