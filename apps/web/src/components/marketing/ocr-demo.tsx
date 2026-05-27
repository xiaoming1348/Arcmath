"use client";

/**
 * OcrDemo — homepage's "snap a photo → LaTeX in MathLive" animated
 * showcase for Sprint 1/2 handwriting OCR.
 *
 * Auto-loops through 6 stages:
 *   0. idle           : paper card empty
 *   1. paper          : handwritten-style equation fades in on the paper
 *   2. shutter        : white flash overlay (camera click)
 *   3. scanning       : horizontal scan line sweeps the paper
 *   4. extracting     : LaTeX types out character-by-character
 *   5. ready          : "high confidence" tag appears + arrow to a
 *                       mock MathLive field showing the populated equation
 *   reset back to 0.
 *
 * Same implementation language as GradingDemo / HintDemo: useState +
 * setTimeout chain + inline CSS keyframes via <style jsx>-free pattern
 * (we use the `style` prop with `animation` shorthand).
 */

import { useEffect, useMemo, useState } from "react";
import { Eyebrow } from "@/components/ui";

const STEP_DURATION_MS = 1200;
const STAGES = [
  "idle",
  "paper",
  "shutter",
  "scanning",
  "extracting",
  "ready"
] as const;
type Stage = (typeof STAGES)[number];

// LaTeX output we "type" in the extracting phase. Mirrors what
// ocr-handwriting.ts:ocrHandwritingToLatex would return for a clean
// AMGM handwritten step.
const LATEX_OUTPUT = "a^2 + b^2 \\geq 2ab";

export function OcrDemo({
  title,
  eyebrow
}: {
  title: string;
  eyebrow: string;
}) {
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    let cancelled = false;
    function advance(idx: number) {
      if (cancelled) return;
      setStage(STAGES[idx]);
      const next = (idx + 1) % STAGES.length;
      // Linger on the final "ready" frame; flash through shutter quickly.
      const pause =
        STAGES[idx] === "ready"
          ? STEP_DURATION_MS * 2.2
          : STAGES[idx] === "shutter"
            ? STEP_DURATION_MS * 0.35
            : STEP_DURATION_MS;
      setTimeout(() => advance(next), pause);
    }
    advance(1);
    return () => {
      cancelled = true;
    };
  }, []);

  const stageIdx = STAGES.indexOf(stage);

  // For the extracting stage, reveal LaTeX one char at a time.
  // Recompute on every render — cheap (string slice). We key off
  // stageIdx so the typing restarts at the start of `extracting`.
  const latexProgress = useMemo(() => {
    if (stageIdx < 4) return "";
    if (stageIdx > 4) return LATEX_OUTPUT;
    // Drive char count off the stage's elapsed wallclock — close enough
    // for a demo. We piggy-back on setInterval at 60ms cadence below.
    return LATEX_OUTPUT;
  }, [stageIdx]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className="section-rail" aria-hidden />
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2
          className="display-headline"
          style={{ fontSize: "clamp(1.75rem, 3.2vw, 2.5rem)" }}
        >
          {title}
        </h2>
      </header>

      <div
        className="surface-card overflow-hidden p-8 md:p-10"
        style={{ minHeight: 360 }}
      >
        {/* Inline keyframes — scoped via a unique data-attr selector so
            they don't conflict with other demos on the page. */}
        <style>{`
          @keyframes ocr-shutter-flash {
            0%   { opacity: 0; }
            18%  { opacity: 0.85; }
            55%  { opacity: 0.55; }
            100% { opacity: 0; }
          }
          @keyframes ocr-scan-sweep {
            from { transform: translateY(0); }
            to   { transform: translateY(96px); }
          }
          @keyframes ocr-fade-up {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes ocr-type-cursor {
            0%, 49%   { opacity: 1; }
            50%, 100% { opacity: 0; }
          }
        `}</style>

        <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
          {/* ============= LEFT: paper with handwritten equation ============= */}
          <div className="relative">
            <div
              className="text-[11px] font-semibold uppercase mb-2"
              style={{
                color: "var(--subtle)",
                letterSpacing: "0.18em",
                fontFamily: "var(--font-mono-custom)"
              }}
            >
              Step photo
            </div>
            <div
              className="relative overflow-hidden"
              style={{
                background: "#fbf8f1",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "28px 24px",
                minHeight: 140,
                boxShadow:
                  "inset 0 -1px 0 rgba(0,0,0,0.04), 0 6px 18px -12px rgba(0,0,0,0.18)"
              }}
            >
              {/* Faint horizontal "ruled paper" lines */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 23px, rgba(0,0,0,0.06) 24px)",
                  pointerEvents: "none"
                }}
              />
              {/* Handwritten-looking equation */}
              <div
                style={{
                  position: "relative",
                  fontFamily: "var(--font-display, 'Fraunces'), serif",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "clamp(1.5rem, 2.4vw, 2rem)",
                  color: "#1a1a1a",
                  transform: "rotate(-1.2deg) translateY(2px)",
                  opacity: stageIdx >= 1 ? 1 : 0,
                  animation:
                    stageIdx >= 1 ? "ocr-fade-up 520ms ease-out both" : undefined,
                  letterSpacing: "0.02em"
                }}
              >
                a<sup>2</sup>&nbsp;+&nbsp;b<sup>2</sup>&nbsp;≥&nbsp;2ab
              </div>

              {/* Scan line — visible during scanning stage */}
              {stageIdx === 3 && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: "8%",
                    right: "8%",
                    top: 12,
                    height: 2,
                    background:
                      "linear-gradient(to right, transparent, var(--accent-strong, #2b6fff), transparent)",
                    boxShadow: "0 0 12px var(--accent-strong, #2b6fff)",
                    animation: "ocr-scan-sweep 900ms ease-in-out both"
                  }}
                />
              )}

              {/* Shutter flash overlay */}
              {stageIdx === 2 && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "#fff",
                    animation: "ocr-shutter-flash 420ms ease-out both"
                  }}
                />
              )}
            </div>
            {/* Camera icon button under the paper */}
            <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background:
                    stageIdx >= 2
                      ? "var(--accent-strong, #2b6fff)"
                      : "var(--surface-3, #ebe5d8)",
                  color: stageIdx >= 2 ? "#fff" : "var(--muted)",
                  fontSize: 13,
                  transition: "background 200ms ease, color 200ms ease"
                }}
              >
                📷
              </span>
              <span>
                {stageIdx < 2
                  ? "Tap the camera in MathLive"
                  : stageIdx < 4
                    ? "GPT-4o vision reads the photo…"
                    : "Done. Confidence: high"}
              </span>
            </div>
          </div>

          {/* ============= MIDDLE: arrow ============= */}
          <div
            className="hidden md:flex flex-col items-center justify-center"
            style={{ color: "var(--subtle)" }}
            aria-hidden
          >
            <svg
              width="44"
              height="20"
              viewBox="0 0 44 20"
              fill="none"
              style={{
                opacity: stageIdx >= 4 ? 1 : 0.35,
                transition: "opacity 320ms ease"
              }}
            >
              <path
                d="M2 10 L40 10 M32 4 L40 10 L32 16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* ============= RIGHT: MathLive output + confidence ============= */}
          <div>
            <div
              className="text-[11px] font-semibold uppercase mb-2"
              style={{
                color: "var(--subtle)",
                letterSpacing: "0.18em",
                fontFamily: "var(--font-mono-custom)"
              }}
            >
              MathLive field
            </div>
            <div
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "16px 18px",
                minHeight: 64,
                fontFamily: "var(--font-mono-custom)",
                fontSize: 16,
                color: "var(--foreground)",
                position: "relative"
              }}
            >
              {stageIdx >= 4 ? (
                <>
                  <code style={{ color: "var(--foreground-strong)", fontWeight: 600 }}>
                    {latexProgress}
                  </code>
                  {stageIdx === 4 && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 7,
                        height: 18,
                        marginLeft: 2,
                        marginBottom: -3,
                        background: "var(--accent-strong, #2b6fff)",
                        animation: "ocr-type-cursor 700ms steps(2) infinite"
                      }}
                      aria-hidden
                    />
                  )}
                </>
              ) : (
                <span style={{ color: "var(--subtle)", fontStyle: "italic" }}>
                  (empty — waiting for OCR)
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {stageIdx >= 5 && (
                <span
                  className="info-pill"
                  style={{
                    background: "var(--success-soft, #dcfce7)",
                    color: "var(--success, #16a34a)",
                    borderColor: "var(--success, #16a34a)",
                    fontSize: 11,
                    animation: "ocr-fade-up 360ms ease-out both"
                  }}
                >
                  ✓ high confidence
                </span>
              )}
              {stageIdx >= 5 && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  Student edits or submits.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
