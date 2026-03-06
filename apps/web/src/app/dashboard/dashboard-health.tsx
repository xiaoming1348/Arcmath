"use client";

import { trpc } from "@/lib/trpc/client";

export function DashboardHealth() {
  const { data, isLoading, error } = trpc.healthcheck.useQuery();

  if (isLoading) {
    return <p className="text-sm text-slate-600">Checking health...</p>;
  }

  if (error) {
    return <p className="text-red-600">Healthcheck failed: {error.message}</p>;
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p>
        status: <strong>{data?.status}</strong>
      </p>
      <p>
        time: <code>{data?.time}</code>
      </p>
    </div>
  );
}
