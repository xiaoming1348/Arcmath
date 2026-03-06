"use client";

import type { ReactNode } from "react";
import { TRPCProvider } from "@/lib/trpc/provider";

export function Providers({ children }: { children: ReactNode }) {
  return <TRPCProvider>{children}</TRPCProvider>;
}
