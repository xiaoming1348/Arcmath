"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * "Start over" button. Shown on the problem-set page next to
 * Continue/Review for problems the student has already touched.
 *
 * Flow:
 *   click → open confirm modal
 *        → confirm → POST /api/problems/<id>/attempts/restart
 *        → on success, navigate to the practice URL (which auto-creates
 *          a fresh attempt because the user no longer has any).
 *   The modal can also be dismissed with Cancel or by clicking the
 *   backdrop; in those cases nothing happens.
 *
 * We use a hand-rolled modal instead of `window.confirm()` because:
 *   - we need bilingual copy + markdown-ish emphasis on "permanently
 *     deleted" that native confirm can't render
 *   - the existing component library doesn't ship a Dialog yet
 */
export function RestartAttemptButton({
  problemId,
  href,
  labels
}: {
  problemId: string;
  /** Where to navigate after the delete succeeds — same URL the
   *  Start/Continue link would use. */
  href: string;
  labels: {
    button: string;
    confirmTitle: string;
    confirmBody: string;
    confirmYes: string;
    confirmCancel: string;
    inProgress: string;
    error: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function doRestart() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fetch(
          `/api/problems/${encodeURIComponent(problemId)}/attempts/restart`,
          { method: "POST" }
        );
        if (!r.ok) {
          setError(labels.error);
          return;
        }
        // Close modal and navigate. router.push triggers a full RSC
        // refresh so the parent problem-set page re-fetches with the
        // attempt rows gone (badges back to "not started").
        setOpen(false);
        router.push(href);
        router.refresh();
      } catch {
        setError(labels.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        {labels.button}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restart-confirm-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 15, 23, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50
          }}
        >
          <div
            className="surface-card"
            style={{
              maxWidth: 460,
              width: "100%",
              padding: "24px 24px 20px 24px",
              borderRadius: "var(--radius-lg, 16px)",
              boxShadow: "0 24px 64px -20px rgba(0,0,0,0.4)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="restart-confirm-title"
              className="text-lg font-semibold mb-2"
              style={{ color: "var(--foreground)" }}
            >
              {labels.confirmTitle}
            </h2>
            <p
              className="text-sm mb-5"
              style={{ color: "var(--muted)", lineHeight: 1.55 }}
            >
              {/* Render simple **bold** by hand so we don't pull in a
                  markdown lib for one sentence. */}
              {renderBold(labels.confirmBody)}
            </p>
            {error && (
              <p
                className="text-sm mb-3"
                style={{ color: "#dc2626" }}
                role="alert"
              >
                {error}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {labels.confirmCancel}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={doRestart}
                disabled={pending}
                style={
                  pending
                    ? undefined
                    : {
                        background: "#dc2626",
                        borderColor: "#dc2626",
                        color: "#fff"
                      }
                }
              >
                {pending ? labels.inProgress : labels.confirmYes}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Tiny **bold** renderer. Splits on `**...**` and wraps the inside
 * in <strong>. No nesting, no escaping — sufficient for our copy.
 */
function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} style={{ color: "var(--foreground)" }}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
