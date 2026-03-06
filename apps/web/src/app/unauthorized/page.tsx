import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="motion-rise mx-auto max-w-lg">
      <section className="surface-card space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">Unauthorized</h1>
        <p className="text-slate-600">You do not have permission to access this page.</p>
        <Link className="btn-secondary" href="/">
          Back to home
        </Link>
      </section>
    </main>
  );
}
