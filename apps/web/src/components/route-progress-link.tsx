"use client";

import Link, { type LinkProps } from "next/link";
import type {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactNode
} from "react";
import { useState } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";

type RouteProgressLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href"> & {
    children: ReactNode;
    showSpinner?: boolean;
  };

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}

function hrefToString(href: LinkProps["href"]): string {
  if (typeof href === "string") {
    return href;
  }

  const pathname = href.pathname ?? "";
  const query = href.query ? `?${new URLSearchParams(href.query as Record<string, string>).toString()}` : "";
  const hash = href.hash ? `#${href.hash}` : "";
  return `${pathname}${query}${hash}`;
}

export function RouteProgressLink({
  children,
  className,
  href,
  onClick,
  showSpinner = true,
  target,
  ...props
}: RouteProgressLinkProps) {
  const [pending, setPending] = useState(false);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      isModifiedEvent(event) ||
      target === "_blank" ||
      props.download
    ) {
      return;
    }

    const destination = hrefToString(href);
    if (destination.startsWith("#")) {
      return;
    }

    setPending(true);
  }

  return (
    <Link
      {...props}
      href={href}
      target={target}
      onClick={handleClick}
      aria-busy={pending || undefined}
      className={className}
    >
      {children}
      {showSpinner ? (
        <span
          className="inline-flex h-4 w-4 items-center justify-center"
          aria-hidden={!pending}
          style={{ opacity: pending ? 1 : 0 }}
        >
          <LoadingSpinner size={14} />
        </span>
      ) : null}
    </Link>
  );
}
