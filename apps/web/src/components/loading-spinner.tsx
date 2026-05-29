/**
 * Inline loading spinner — 14×14 SVG, rotates via CSS.
 *
 * Use inside a button that's `disabled` during an async action, in
 * place of (or alongside) text like "Loading…". Keeps the button
 * width stable because the SVG is fixed-size; text-only swaps cause
 * the button to grow/shrink which is jarring.
 */
export function LoadingSpinner({
  size = 14,
  color = "currentColor",
  className
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className}
      style={{ display: "inline-block", verticalAlign: "-2px" }}
    >
      <style>{`
        @keyframes arcmath-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <g style={{ transformOrigin: "center", animation: "arcmath-spin 0.8s linear infinite" }}>
        <circle
          cx="8"
          cy="8"
          r="6"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="28 60"
          opacity={0.8}
        />
      </g>
    </svg>
  );
}
