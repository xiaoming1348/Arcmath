import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@arcmath/shared";
import { authOptions } from "@/lib/auth";
import { ReviewQueuePanel } from "./review-queue-panel";

export default async function AdminReviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fadmin%2Freview");
  }
  if (!canAccessAdmin(session.user.role)) {
    redirect("/unauthorized");
  }

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-2">
        <span className="badge">Content review queue</span>
        <h1 className="text-2xl font-semibold text-slate-900">
          Review & publish queue
        </h1>
        <p className="text-sm text-slate-600">
          Triage problems that need a human: missing solution sketches,
          formalization failures, or sets that haven't been published yet.
        </p>
        <div className="pt-2">
          <Link href="/admin" className="btn-secondary">
            Back to admin
          </Link>
        </div>
      </section>
      <ReviewQueuePanel />
    </main>
  );
}
