import type { CSSProperties } from "react";

type BrandMarkProps = {
  className?: string;
  size?: number;
  title?: string;
};

export function BrandMark({ className, size = 40, title }: BrandMarkProps) {
  return (
    <span
      className={["brand-mark", className].filter(Boolean).join(" ")}
      style={{ "--brand-mark-size": `${size}px` } as CSSProperties}
    >
      <svg
        viewBox="0 0 48 48"
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
        focusable="false"
      >
        <rect className="brand-mark__plate" x="4.5" y="4.5" width="39" height="39" rx="11" />
        <path className="brand-mark__grid" d="M14 14H34M14 24H34M14 34H34M14 14V34M24 14V34M34 14V34" />
        <path className="brand-mark__arc" d="M11 31C16.2 16.6 29.5 11.8 38 22.2" />
        <path className="brand-mark__proof" d="M14 29.2L20.4 22.7L25.6 27.8L34.4 17.8" />
        <circle className="brand-mark__node brand-mark__node-a" cx="14" cy="29.2" r="2.2" />
        <circle className="brand-mark__node brand-mark__node-b" cx="34.4" cy="17.8" r="2.2" />
      </svg>
    </span>
  );
}
