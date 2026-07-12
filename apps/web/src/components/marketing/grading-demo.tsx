"use client";

/**
 * GradingDemo — the homepage's "how we grade" animated module.
 *
 * Auto-loops through a 5-stage sequence:
 *   0. typed student step:       "a^2 + b^2 ≥ 2ab"
 *   1. SymPy fires    (yellow dot pulse + label appears)
 *   2. Lean fires     (teal dot pulse + label appears)
 *   3. Two LLM judges agree (purple dot pulses + label appears)
 *   4. VERIFIED stamp lands, pause, then reset
 *
 * Implementation: pure React useState + setInterval. No animation
 * lib needed — CSS @keyframes do the heavy lifting.
 */

import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { useT } from "@/i18n/client";

const STEP_DURATION_MS = 1200;
const STAGES = ["idle", "step", "sympy", "lean", "judges", "verified"] as const;
type Stage = (typeof STAGES)[number];

const COPY = {
  en: {
    stepLabel: "STEP 1",
    sympyLabel: "SymPy",
    sympyNote: "symbolic: (a-b)^2 >= 0",
    leanLabel: "Lean kernel",
    leanNote: "proof checked via sq_nonneg",
    judgesLabel: "LLM judges (2/2)",
    judgesNote: "independent: confidence 0.96 / 0.96",
    voting: "Backends voting...",
    committed: "Verdict committed. Confidence 0.99.",
    verified: "Verified"
  },
  zh: {
    stepLabel: "步骤 1",
    sympyLabel: "SymPy",
    sympyNote: "符号检查：(a-b)^2 >= 0",
    leanLabel: "Lean kernel",
    leanNote: "通过 sq_nonneg 完成证明检查",
    judgesLabel: "LLM 复核 (2/2)",
    judgesNote: "独立判断：置信度 0.96 / 0.96",
    voting: "后端正在投票...",
    committed: "结论已提交。置信度 0.99。",
    verified: "已验证"
  }
} as const;

export function GradingDemo({
  title,
  eyebrow
}: {
  title: string;
  eyebrow: string;
}) {
  const { locale } = useT();
  const copy = COPY[locale];
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    let cancelled = false;
    function advance(idx: number) {
      if (cancelled) return;
      setStage(STAGES[idx]);
      const next = (idx + 1) % STAGES.length;
      const pause = STAGES[idx] === "verified" ? STEP_DURATION_MS * 2 : STEP_DURATION_MS;
      setTimeout(() => advance(next), pause);
    }
    advance(1);
    return () => {
      cancelled = true;
    };
  }, []);

  const stageIdx = STAGES.indexOf(stage);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className="section-rail" aria-hidden />
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="display-headline" style={{ fontSize: "clamp(1.75rem, 3.2vw, 2.5rem)" }}>
          {title}
        </h2>
      </header>

      <div
        className="surface-card overflow-hidden p-8 md:p-10"
        style={{ minHeight: 320 }}
      >
        {/* Step input mock */}
        <div
          className="mb-6 flex items-center gap-3"
          style={{
            fontFamily: "var(--font-mono-custom)",
            fontSize: 18,
            opacity: stageIdx >= 1 ? 1 : 0,
            animation:
              stageIdx >= 1 ? "step-type-in 380ms ease-out both" : undefined
          }}
        >
          <span
            className="info-pill"
            style={{ fontFamily: "var(--font-mono-custom)", fontSize: 11 }}
          >
            {copy.stepLabel}
          </span>
          <code
            style={{
              background: "var(--surface-3)",
              padding: "8px 14px",
              borderRadius: "var(--radius-md)",
              fontWeight: 600,
              color: "var(--foreground-strong)"
            }}
          >
            a² + b² ≥ 2ab
          </code>
        </div>

        {/* Engine fan-out */}
        <div className="flex flex-col gap-3">
          <EngineLine
            engine="sympy"
            label={copy.sympyLabel}
            note={copy.sympyNote}
            visible={stageIdx >= 2}
            done={stageIdx >= 3}
            tone="amber"
          />
          <EngineLine
            engine="lean"
            label={copy.leanLabel}
            note={copy.leanNote}
            visible={stageIdx >= 3}
            done={stageIdx >= 4}
            tone="teal"
          />
          <EngineLine
            engine="judges"
            label={copy.judgesLabel}
            note={copy.judgesNote}
            visible={stageIdx >= 4}
            done={stageIdx >= 5}
            tone="lavender"
          />
        </div>

        {/* Final stamp */}
        <div className="mt-7 flex items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {stageIdx >= 5
              ? copy.committed
              : copy.voting}
          </p>
          {stageIdx >= 5 && (
            <span className="verified-stamp" key={stage}>
              ✓ {copy.verified}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EngineLine({
  engine,
  label,
  note,
  visible,
  done,
  tone
}: {
  engine: "sympy" | "lean" | "judges";
  label: string;
  note: string;
  visible: boolean;
  done: boolean;
  tone: "amber" | "teal" | "lavender";
}) {
  const toneVar =
    tone === "amber"
      ? "var(--tile-amber-strong)"
      : tone === "teal"
        ? "var(--tile-teal-strong)"
        : "var(--tile-lavender-strong)";
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 320ms ease, transform 320ms ease",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: done ? "var(--success-soft)" : "var(--surface-card)"
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="engine-dot"
          data-engine={engine === "sympy" ? "sympy" : engine === "lean" ? "lean" : "judge"}
          style={
            done
              ? { background: "var(--success)", animation: "none" }
              : { background: toneVar }
          }
        />
        <span
          className="text-sm font-semibold"
          style={{
            color: done ? "var(--success)" : "var(--foreground)"
          }}
        >
          {label}
        </span>
      </div>
      <span
        className="text-xs"
        style={{
          color: done ? "var(--success)" : "var(--subtle)",
          fontFamily: "var(--font-mono-custom)"
        }}
      >
        {note}
      </span>
    </div>
  );
}
