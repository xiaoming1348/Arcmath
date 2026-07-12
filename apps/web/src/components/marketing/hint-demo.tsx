"use client";

/**
 * HintDemo — the homepage's "progressive hints" animated module.
 *
 * Three-stage reveal:
 *   1. "I'm stuck" press → hint level 1 appears (direction)
 *   2. another press     → hint level 2 (setup)
 *   3. another press     → hint level 3 (almost there)
 * Then a brief pause and the cycle resets.
 */

import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { useT } from "@/i18n/client";

const COPY = {
  en: {
    introBefore: "Click",
    stuck: "I'm stuck",
    introAfter: "and reveal one hint at a time - direction first, computation last.",
    hintPrefix: "Hint",
    hints: [
      {
        level: 1,
        label: "Direction",
        text:
          "What single algebraic identity transforms (a-b)^2 into a sum of three terms?"
      },
      {
        level: 2,
        label: "Setup",
        text:
          "Expand (a-b)^2 = a^2 - 2ab + b^2. The inequality is the same as showing this expansion is >= 0."
      },
      {
        level: 3,
        label: "Almost there",
        text:
          "Any real number squared is >= 0. Apply that to (a-b)^2 and rearrange to land at a^2 + b^2 >= 2ab."
      }
    ]
  },
  zh: {
    introBefore: "点击",
    stuck: "我卡住了",
    introAfter: "后逐层展示提示：先给方向，最后才给计算细节。",
    hintPrefix: "提示",
    hints: [
      {
        level: 1,
        label: "方向",
        text: "哪一个代数恒等式可以把 (a-b)^2 展开成三项？"
      },
      {
        level: 2,
        label: "设定",
        text: "展开 (a-b)^2 = a^2 - 2ab + b^2。原不等式等价于证明这个展开式 >= 0。"
      },
      {
        level: 3,
        label: "接近完成",
        text: "任意实数的平方都 >= 0。把这一点用于 (a-b)^2，再整理即可得到 a^2 + b^2 >= 2ab。"
      }
    ]
  }
} as const;

const TICK_MS = 1800;

export function HintDemo({
  title,
  eyebrow
}: {
  title: string;
  eyebrow: string;
}) {
  const { locale } = useT();
  const copy = COPY[locale];
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let n = 1;
    const advance = () => {
      if (cancelled) return;
      setRevealed(n);
      n = n >= copy.hints.length ? 0 : n + 1;
      setTimeout(advance, n === 0 ? TICK_MS * 1.6 : TICK_MS);
    };
    setTimeout(advance, 600);
    return () => {
      cancelled = true;
    };
  }, [copy.hints.length]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className="section-rail" aria-hidden />
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="display-headline" style={{ fontSize: "clamp(1.75rem, 3.2vw, 2.5rem)" }}>
          {title}
        </h2>
      </header>

      <div className="surface-card p-8 md:p-10 overflow-hidden" style={{ minHeight: 360 }}>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          {copy.introBefore} <span className="font-semibold" style={{ color: "var(--foreground)" }}>{copy.stuck}</span> {copy.introAfter}
        </p>

        <div className="flex flex-col gap-3">
          {copy.hints.map((h, i) => (
            <div
              key={h.level}
              className="flex items-start gap-4 px-5 py-4"
              style={{
                opacity: revealed > i ? 1 : 0.25,
                transition: "opacity 320ms ease, transform 320ms ease",
                animation:
                  revealed === i + 1
                    ? "hint-reveal 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both"
                    : undefined,
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border)",
                background:
                  revealed > i ? "var(--surface-card)" : "transparent"
              }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center"
                style={{
                  borderRadius: "var(--radius-pill)",
                  background:
                    revealed > i
                      ? i === 0
                        ? "var(--tile-amber)"
                        : i === 1
                          ? "var(--tile-teal)"
                          : "var(--tile-lavender)"
                      : "var(--surface-3)",
                  color: "var(--foreground-strong)",
                  fontFamily: "var(--font-mono-custom)",
                  fontWeight: 700,
                  fontSize: 13
                }}
              >
                {h.level}
              </span>
              <div className="flex flex-col gap-1">
                <span
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--subtle)",
                    letterSpacing: "0.12em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {copy.hintPrefix} · {h.label}
                </span>
                <p
                  className="text-sm"
                  style={{ color: "var(--foreground)" }}
                >
                  {h.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
