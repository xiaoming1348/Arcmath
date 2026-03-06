"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/lib/trpc/router";

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl() {
  if (typeof window !== "undefined") {
    return "";
  }

  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export function getTRPCUrl() {
  return `${getBaseUrl()}/api/trpc`;
}
