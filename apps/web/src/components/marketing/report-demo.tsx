"use client";

/**
 * ReportDemo — the homepage's "personalized report" animated module.
 *
 * A simulated learning-report card. Bars animate filling on view,
 * milestone list checks off one at a time, and an overall accuracy
 * counter ticks up from 0 to its target.
 */

import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { useT } from "@/i18n/client";

const COPY = {
  en: {
    overall: "Overall accuracy",
    summary: "18 problems graded · 2 escalated to teacher review.",
    coverage: "Milestone coverage",
    topics: [
      { topic: "Algebra", pct: 92, tone: "amber" as const },
      { topic: "Number theory", pct: 78, tone: "teal" as const },
      { topic: "Combinatorics", pct: 64, tone: "lavender" as const },
      { topic: "Inequality", pct: 48, tone: "coral" as const }
    ],
    milestones: [
      "Spotted (a-b)^2 >= 0 in step 1",
      "Expanded correctly in step 2",
      "Reached the SOS conclusion",
      "Skipped justifying step 3 - review"
    ]
  },
  zh: {
    overall: "整体正确率",
    summary: "18 道题已批改 · 2 道升级给老师复核。",
    coverage: "关键步骤覆盖",
    topics: [
      { topic: "代数", pct: 92, tone: "amber" as const },
      { topic: "数论", pct: 78, tone: "teal" as const },
      { topic: "组合", pct: 64, tone: "lavender" as const },
      { topic: "不等式", pct: 48, tone: "coral" as const }
    ],
    milestones: [
      "第 1 步识别出 (a-b)^2 >= 0",
      "第 2 步展开正确",
      "得出平方和结论",
      "第 3 步理由不足 - 需要复核"
    ]
  }
} as const;

export function ReportDemo({
  title,
  eyebrow
}: {
  title: string;
  eyebrow: string;
}) {
  const { locale } = useT();
  const copy = COPY[locale];
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);
  const [checked, setChecked] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Reveal when scrolled into view.
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Tick the accuracy counter 0 → 86.
  useEffect(() => {
    if (!visible) return;
    let n = 0;
    const target = 86;
    const tick = setInterval(() => {
      n += 2;
      if (n >= target) {
        n = target;
        clearInterval(tick);
      }
      setCount(n);
    }, 28);
    return () => clearInterval(tick);
  }, [visible]);

  // Reveal milestones in sequence after reveal.
  useEffect(() => {
    if (!visible) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setChecked(i);
      if (i >= copy.milestones.length) clearInterval(id);
    }, 400);
    return () => clearInterval(id);
  }, [copy.milestones.length, visible]);

  return (
    <div className="flex flex-col gap-6" ref={containerRef}>
      <header className="flex flex-col gap-3">
        <span className="section-rail" aria-hidden />
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="display-headline" style={{ fontSize: "clamp(1.75rem, 3.2vw, 2.5rem)" }}>
          {title}
        </h2>
      </header>

      <div className="surface-card p-8 md:p-10" style={{ minHeight: 420 }}>
        <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
          {/* Accuracy big number */}
          <div className="flex flex-col gap-3">
            <span
              className="text-[11px] font-semibold uppercase"
              style={{
                color: "var(--subtle)",
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono-custom)"
              }}
            >
              {copy.overall}
            </span>
            <div
              className="flex items-baseline gap-2"
              style={{
                fontFamily: "var(--font-display-custom)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "var(--foreground-strong)"
              }}
            >
              <span style={{ fontSize: "clamp(3.5rem, 8vw, 6rem)", lineHeight: 1 }}>
                {count}
              </span>
              <span style={{ fontSize: "2rem", color: "var(--muted)" }}>%</span>
            </div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {copy.summary}
            </p>

            <div className="mt-6 flex flex-col gap-3">
              {copy.topics.map((b, i) => (
                <Bar key={b.topic} {...b} visible={visible} delay={i * 80} />
              ))}
            </div>
          </div>

          {/* Milestone list */}
          <div className="flex flex-col gap-3">
            <span
              className="text-[11px] font-semibold uppercase"
              style={{
                color: "var(--subtle)",
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono-custom)"
              }}
            >
              {copy.coverage}
            </span>
            {copy.milestones.map((m, i) => {
              const done = checked > i;
              const isReview = i === copy.milestones.length - 1;
              return (
                <div
                  key={m}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{
                    opacity: done ? 1 : 0.25,
                    transition: "opacity 280ms ease",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    background: done
                      ? isReview
                        ? "var(--warning-soft)"
                        : "var(--success-soft)"
                      : "transparent"
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "var(--radius-sm)",
                      background: done
                        ? isReview
                          ? "var(--warning)"
                          : "var(--success)"
                        : "var(--border-strong)",
                      color: "white",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: 2
                    }}
                  >
                    {done ? (isReview ? "!" : "✓") : ""}
                  </span>
                  <span
                    className="text-sm"
                    style={{
                      color: done ? "var(--foreground)" : "var(--muted)"
                    }}
                  >
                    {m}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({
  topic,
  pct,
  tone,
  visible,
  delay
}: {
  topic: string;
  pct: number;
  tone: "amber" | "teal" | "lavender" | "coral";
  visible: boolean;
  delay: number;
}) {
  const fill =
    tone === "amber"
      ? "var(--tile-amber-strong)"
      : tone === "teal"
        ? "var(--tile-teal-strong)"
        : tone === "lavender"
          ? "var(--tile-lavender-strong)"
          : "var(--tile-coral-strong)";
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-xs font-medium"
        style={{ color: "var(--muted)", width: 96 }}
      >
        {topic}
      </span>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: "var(--radius-pill)",
          background: "var(--surface-3)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            height: "100%",
            background: fill,
            borderRadius: "var(--radius-pill)",
            width: visible ? `${pct}%` : "0%",
            transition: `width 900ms cubic-bezier(0.2, 0.7, 0.2, 1) ${delay}ms`
          }}
        />
      </div>
      <span
        className="text-[11px] font-semibold"
        style={{
          color: "var(--foreground)",
          fontFamily: "var(--font-mono-custom)",
          width: 36,
          textAlign: "right"
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
