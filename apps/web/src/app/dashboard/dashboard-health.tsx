"use client";

import { trpc } from "@/lib/trpc/client";

export function DashboardHealth() {
  const { data, isLoading, error } = trpc.healthcheck.useQuery();

  if (isLoading) {
    return <p className="text-sm text-slate-600">Checking health...</p>;
  }

  if (error) {
    return <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">Healthcheck failed: {error.message}</p>;
  }

  return (
    <div className="rounded-[1.5rem] border border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(209,250,229,0.76))] p-4 text-sm text-emerald-900 shadow-[0_14px_28px_rgba(5,150,105,0.08)]">
      <p className="font-medium">
        status: <strong>{data?.status}</strong>
      </p>
      <p className="mt-1">
        time: <code>{data?.time}</code>
      </p>
    </div>
  );
}
