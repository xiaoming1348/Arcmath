export default function MembershipPage() {
  return (
    <main className="motion-rise mx-auto max-w-2xl space-y-4">
      <section className="surface-card space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">Membership</h1>
        <p className="text-slate-600">
          Membership checkout is not integrated yet. This placeholder page marks the upgrade step.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>Planned unlocks:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Full AMC/AIME resource archive access</li>
            <li>Future premium AI tutoring features</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
