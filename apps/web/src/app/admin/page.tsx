import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { AdminResourceAccessPanel } from "@/app/admin/AdminResourceAccessPanel";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card">
        <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>
        <p className="mt-2 text-slate-600">This route is protected by middleware and only allows ADMIN users.</p>
        <div className="mt-4">
          <Link className="btn-primary" href="/admin/import">
            Open Contest Import
          </Link>
        </div>
      </section>

      <section className="surface-card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Authenticated User</h2>
        <pre className="overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          {JSON.stringify(session?.user ?? null, null, 2)}
        </pre>
      </section>

      <AdminResourceAccessPanel />
    </main>
  );
}
