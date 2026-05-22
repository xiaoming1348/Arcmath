/**
 * MathGlyphs — large faded math symbols scattered as background
 * decoration inside a positioned-parent container. Used on the
 * homepage hero to break up the all-text feel without dropping in
 * a stock illustration.
 *
 * Usage:
 *   <div className="relative ...">
 *     <MathGlyphs />
 *     ...real content...
 *   </div>
 */

import type { CSSProperties } from "react";

type Glyph = {
  ch: string;
  top: string;
  left?: string;
  right?: string;
  size: string;
  spin?: "true" | "reverse";
  rotate?: number;
  /** Optional explicit opacity to override the default 0.05. */
  opacity?: number;
};

const DEFAULT_GLYPHS: Glyph[] = [
  { ch: "∫", top: "8%",  right: "4%",  size: "240px", spin: "true",    rotate: -8 },
  { ch: "∑", top: "62%", left: "-2%",  size: "180px", spin: "reverse", rotate: 12, opacity: 0.06 },
  { ch: "π", top: "30%", left: "55%",  size: "140px",                  rotate: 4 },
  { ch: "∂", top: "78%", right: "12%", size: "120px", spin: "true",    rotate: -4 },
  { ch: "ℕ", top: "20%", left: "12%",  size: "100px",                  rotate: -6, opacity: 0.04 }
];

export function MathGlyphs({
  glyphs = DEFAULT_GLYPHS
}: {
  glyphs?: Glyph[];
}) {
  return (
    <>
      {glyphs.map((g, i) => {
        const style: CSSProperties = {
          top: g.top,
          left: g.left,
          right: g.right,
          fontSize: g.size,
          transform: `rotate(${g.rotate ?? 0}deg)`,
          opacity: g.opacity
        };
        return (
          <span
            key={`${g.ch}-${i}`}
            aria-hidden
            className="math-glyph"
            data-spin={g.spin}
            style={style}
          >
            {g.ch}
          </span>
        );
      })}
    </>
  );
}
