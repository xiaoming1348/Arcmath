import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@arcmath/shared";
import { authOptions } from "@/lib/auth";
import { AdminAnalyticsPanel } from "./analytics-panel";

export default async function AdminAnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fadmin%2Fanalytics");
  }
  if (!canAccessAdmin(session.user.role)) {
    redirect("/unauthorized");
  }

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-2">
        <span className="badge">Per-school analytics</span>
        <h1 className="text-2xl font-semibold text-slate-900">
          School usage & audit log
        </h1>
        <p className="text-sm text-slate-600">
          One row per tenant: seat utilization, class count, recent practice
          volume, and a red/yellow/green health flag. The audit tab lists
          recent sensitive actions so you can investigate support tickets
          without grepping production logs.
        </p>
        <div className="pt-2">
          <Link href="/admin" className="btn-secondary">
            Back to admin
          </Link>
        </div>
      </section>
      <AdminAnalyticsPanel />
    </main>
  );
}
