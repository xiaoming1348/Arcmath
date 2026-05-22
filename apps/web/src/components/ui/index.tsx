/**
 * UI primitive components — Apple/Stripe educational style.
 *
 * Goals:
 *   - Strongly typed props so callers can't drift the design.
 *   - Composable: every component is a styled wrapper around a
 *     basic HTML element with `className` passthrough.
 *   - Internally uses the CSS variables and component classes from
 *     `globals.css` (v3 design system).
 *
 * These are NEW; existing pages keep working via the legacy class
 * names in globals.css. New pages should prefer these typed
 * components.
 */

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  PropsWithChildren,
  ReactNode
} from "react";
import { forwardRef } from "react";

/** Concat helper that strips empty strings and joins with spaces. */
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ============================================================
// Button — primary / secondary / ghost
// ============================================================

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", fullWidth, className, children, ...rest }, ref) => {
    const base =
      variant === "ghost"
        ? "route-chip"
        : variant === "secondary"
          ? "btn-secondary"
          : "btn-primary";
    return (
      <button
        ref={ref}
        className={cn(base, fullWidth && "w-full", className)}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// Same surface for <a> tags (Next Link wraps an <a>).
type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
};

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  ({ variant = "primary", fullWidth, className, children, ...rest }, ref) => {
    const base =
      variant === "ghost"
        ? "route-chip"
        : variant === "secondary"
          ? "btn-secondary"
          : "btn-primary";
    return (
      <a
        ref={ref}
        className={cn(base, fullWidth && "w-full", className)}
        {...rest}
      >
        {children}
      </a>
    );
  }
);
LinkButton.displayName = "LinkButton";

// ============================================================
// Card — the standard surface
// ============================================================

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Tighter inner padding (used for sidebar-style cards). */
  tight?: boolean;
  /** Border-only frame with no inner padding (callers control padding). */
  bare?: boolean;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ tight, bare, className, children, ...rest }, ref) => {
    const padding = bare ? "" : tight ? "p-4" : "p-6";
    return (
      <div
        ref={ref}
        className={cn("surface-card", padding, className)}
        {...rest}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

// ============================================================
// Section + display headline
// ============================================================

type SectionProps = HTMLAttributes<HTMLElement> & {
  tight?: boolean;
};

export function Section({
  tight,
  className,
  children,
  ...rest
}: PropsWithChildren<SectionProps>) {
  return (
    <section
      className={cn(tight ? "section-tight" : "section", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

type SectionHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  lede,
  align = "left",
  className
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3",
        align === "center" && "mx-auto items-center text-center",
        className
      )}
    >
      <span className="section-rail" aria-hidden />
      {eyebrow && <span className="display-eyebrow">{eyebrow}</span>}
      <h2 className="display-headline" style={{ fontSize: "clamp(1.75rem, 3.2vw, 2.5rem)" }}>
        {title}
      </h2>
      {lede && <p className="display-lede">{lede}</p>}
    </header>
  );
}

// ============================================================
// Metric — big number + small label, used on dashboards
// ============================================================

type MetricProps = {
  label: ReactNode;
  value: ReactNode;
  /** Optional small trend / sublabel under the value. */
  trend?: ReactNode;
  trendDirection?: "up" | "down";
  className?: string;
};

export function Metric({
  label,
  value,
  trend,
  trendDirection,
  className
}: MetricProps) {
  return (
    <div className={cn("metric", className)}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {trend && (
        <span className="metric-trend" data-trend={trendDirection ?? "up"}>
          {trend}
        </span>
      )}
    </div>
  );
}

// ============================================================
// Pill / Tag — inline status, taxonomy
// ============================================================

type PillProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "accent" | "verified";
};

export function Pill({
  variant = "default",
  className,
  children,
  ...rest
}: PropsWithChildren<PillProps>) {
  const base =
    variant === "accent"
      ? "badge"
      : variant === "verified"
        ? "badge-verified"
        : "info-pill";
  return (
    <span className={cn(base, className)} {...rest}>
      {children}
    </span>
  );
}

type TagStatus = "verified" | "invalid" | "pending" | "uncertain" | "neutral";

type TagProps = HTMLAttributes<HTMLSpanElement> & {
  status?: TagStatus;
};

export function Tag({
  status = "neutral",
  className,
  children,
  ...rest
}: PropsWithChildren<TagProps>) {
  return (
    <span
      className={cn("tag", className)}
      data-status={status === "neutral" ? undefined : status}
      {...rest}
    >
      {children}
    </span>
  );
}

// ============================================================
// Divider
// ============================================================

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("divider-soft border-0", className)} />;
}

// ============================================================
// Empty state — friendly fallback for empty lists/dashboards
// ============================================================

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div
          className="flex h-14 w-14 items-center justify-center"
          style={{
            borderRadius: "var(--radius-lg)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--subtle)"
          }}
        >
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h4 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
          {title}
        </h4>
        {description && (
          <p
            className="text-sm"
            style={{ color: "var(--muted)", maxWidth: "44ch" }}
          >
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

// ============================================================
// Eyebrow standalone
// ============================================================

export function Eyebrow({
  children,
  className
}: PropsWithChildren<{ className?: string }>) {
  return <span className={cn("eyebrow", className)}>{children}</span>;
}
