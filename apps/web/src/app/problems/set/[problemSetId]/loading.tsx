/**
 * Instant skeleton shown while /problems/set/[problemSetId] SSRs.
 * Same rationale as the per-problem loading.tsx — gives the click
 * immediate visual feedback while the page server-renders.
 */
export default function ProblemSetPageLoading() {
  return (
    <main
      className="motion-rise space-y-4"
      aria-busy
      aria-label="Loading problem set"
    >
      <style>{`
        @keyframes arcmath-skel {
          0%, 100% { opacity: 0.65; }
          50%      { opacity: 0.35; }
        }
        .skel {
          background: var(--surface-2, #ebe5d8);
          border-radius: 6px;
          animation: arcmath-skel 1.2s ease-in-out infinite;
        }
      `}</style>
      <section className="surface-card space-y-3">
        <div className="skel" style={{ height: 14, width: "20%" }} />
        <div className="skel" style={{ height: 28, width: "55%" }} />
        <div className="skel" style={{ height: 14, width: "75%" }} />
      </section>
      <section className="surface-card space-y-4">
        <div className="skel" style={{ height: 20, width: "30%" }} />
        <div className="skel" style={{ height: 14, width: "85%" }} />
        <div className="space-y-3 pt-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2" style={{ flex: 1 }}>
                  <div className="skel" style={{ height: 18, width: "20%" }} />
                  <div className="skel" style={{ height: 14, width: "90%" }} />
                  <div className="skel" style={{ height: 12, width: "30%" }} />
                </div>
                <div className="skel" style={{ height: 36, width: 90 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
