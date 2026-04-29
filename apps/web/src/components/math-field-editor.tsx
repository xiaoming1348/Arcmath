"use client";

import { useEffect, useRef, useState } from "react";

type MathFieldElement = HTMLElement & {
  value: string;
  getValue?: () => string;
  setValue?: (value: string) => void;
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
  minHeight = "3rem"
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
          <math-field
            ref={(node: HTMLElement | null) => {
              fieldRef.current = node as MathFieldElement | null;
            }}
            style={{ width: "100%", minHeight, display: "block", fontSize: "1.05rem", outline: "none" }}
          />
        ) : (
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" aria-label="Loading formula editor" />
        )}
      </div>
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
