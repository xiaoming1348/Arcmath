/**
 * Instant skeleton shown while /problems/[problemId] SSRs.
 *
 * Next.js renders this immediately when the link is clicked, then
 * swaps in the real page once the server is done. Without this file
 * the user would see the previous page's content frozen for the full
 * SSR duration (300-800ms in our HK-to-us-east-1 setup), which feels
 * like the click did nothing.
 *
 * The skeleton mirrors the rough shape of the real page (problem
 * statement card, then workspace section) so the transition feels
 * less jarring.
 */
export default function ProblemPageLoading() {
  return (
    <main
      className="motion-rise space-y-4"
      aria-busy
      aria-label="Loading problem"
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
      <section className="surface-card space-y-4">
        <div className="skel" style={{ height: 14, width: "30%" }} />
        <div className="skel" style={{ height: 24, width: "60%" }} />
        <div className="space-y-2">
          <div className="skel" style={{ height: 14, width: "95%" }} />
          <div className="skel" style={{ height: 14, width: "92%" }} />
          <div className="skel" style={{ height: 14, width: "88%" }} />
          <div className="skel" style={{ height: 14, width: "70%" }} />
        </div>
      </section>
      <section className="surface-card space-y-4">
        <div className="skel" style={{ height: 18, width: "25%" }} />
        <div className="skel" style={{ height: 80, width: "100%" }} />
        <div className="flex gap-2">
          <div className="skel" style={{ height: 36, width: 100 }} />
          <div className="skel" style={{ height: 36, width: 100 }} />
        </div>
      </section>
    </main>
  );
}
