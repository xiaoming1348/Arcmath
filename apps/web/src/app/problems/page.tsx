import Link from "next/link";

export default function ProblemsPage() {
  return (
    <main className="motion-rise">
      <section className="surface-card space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">Problems</h1>
        <p className="text-slate-600">
          This section is reserved for future AI-tutor generated practice and personalized assignments.
        </p>
        <p className="text-slate-600">
          Historical AMC/AIME archives are now under <Link className="underline" href="/resources">Resources</Link>.
        </p>
      </section>
    </main>
  );
}
