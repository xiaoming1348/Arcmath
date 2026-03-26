import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { grantAllLiveRealTutorProblemSets, listGrantedRealTutorProblemSetIds } from "@/lib/tutor-premium-access";

type MembershipPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
    unlocked?: string;
  }>;
};

export default async function MembershipPage({ searchParams }: MembershipPageProps) {
  const { callbackUrl, unlocked } = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/membership")}`);
  }

  const grantedSetIds = await listGrantedRealTutorProblemSetIds(prisma, session.user.id);
  const premiumUnlocked = session.user.role === "ADMIN" || grantedSetIds.length > 0;

  async function unlockPremiumAccess() {
    "use server";

    const currentSession = await getServerSession(authOptions);
    if (!currentSession?.user) {
      redirect(`/login?callbackUrl=${encodeURIComponent("/membership")}`);
    }

    await grantAllLiveRealTutorProblemSets({
      prisma,
      userId: currentSession.user.id
    });

    redirect(callbackUrl && callbackUrl.startsWith("/") ? `${callbackUrl}${callbackUrl.includes("?") ? "&" : "?"}unlocked=1` : "/membership?unlocked=1");
  }

  return (
    <main className="motion-rise mx-auto max-w-4xl space-y-4">
      <section className="surface-card space-y-3">
        <span className="badge">Premium Access</span>
        <h1 className="text-2xl font-semibold text-slate-900">Membership</h1>
        <p className="text-sm text-slate-600">
          This is a demo unlock flow. Clicking the button below immediately grants access to the paid real contest practice catalog for your account.
        </p>
        {unlocked ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Premium practice access is now unlocked for this account.
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card space-y-4">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Real Contest Practice</h2>
            <p className="text-sm text-slate-600">
              Unlock the full real-set tutor catalog, including AMC 8, AMC 10, AMC 12, and AIME practice sets that are hidden from the free diagnostic flow.
            </p>
          </div>

          <ul className="space-y-2 text-sm text-slate-700">
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Access all live real tutor sets</li>
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Use the existing hint tutor on real contest problems</li>
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Continue from diagnostics into targeted real-problem practice</li>
          </ul>

          {premiumUnlocked ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/problems" className="btn-primary">
                Open Problem Catalog
              </Link>
            </div>
          ) : (
            <form action={unlockPremiumAccess}>
              <button type="submit" className="btn-primary">
                Unlock Premium Practice (Demo)
              </button>
            </form>
          )}
        </div>

        <div className="surface-card space-y-4">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">What premium unlocks</h2>
            <p className="text-sm text-slate-600">
              This unlock is currently focused on reviewed real contest practice. Institution-side assignments and resources now live inside each organization workspace instead of a separate tutoring surface.
            </p>
          </div>

          <ul className="space-y-2 text-sm text-slate-700">
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Reviewed AMC and AIME real contest sets</li>
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">The existing hint tutor on premium real problems</li>
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">A clean upgrade path from diagnostics into harder practice</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
