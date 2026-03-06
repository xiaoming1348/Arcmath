import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardHealth } from "@/app/dashboard/dashboard-health";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fdashboard");
  }

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Welcome back. This card verifies end-to-end tRPC client/server wiring.
        </p>
      </section>
      <section className="surface-card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">System Health</h2>
        <DashboardHealth />
      </section>
    </main>
  );
}
