type SkeletonBarProps = {
  height: number;
  width: number | string;
  className?: string;
};

function SkeletonBar({ height, width, className }: SkeletonBarProps) {
  return (
    <div
      className={`loading-skeleton ${className ?? ""}`}
      style={{ height, width }}
    />
  );
}

function LoadingDots() {
  return (
    <span className="loading-dots" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

export function GenericRouteLoadingSkeleton({
  label = "Loading page"
}: {
  label?: string;
}) {
  return (
    <main className="motion-rise space-y-4" aria-busy aria-label={label}>
      <section className="surface-card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBar height={16} width="34%" />
          <LoadingDots />
        </div>
        <SkeletonBar height={30} width="62%" />
        <div className="space-y-2">
          <SkeletonBar height={14} width="96%" />
          <SkeletonBar height={14} width="88%" />
          <SkeletonBar height={14} width="72%" />
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="surface-card space-y-3">
            <SkeletonBar height={18} width="48%" />
            <SkeletonBar height={12} width="86%" />
            <SkeletonBar height={12} width="68%" />
          </div>
        ))}
      </section>
    </main>
  );
}

export function ProblemCatalogLoadingSkeleton() {
  return (
    <main className="motion-rise space-y-4" aria-busy aria-label="Loading problem catalog">
      <section className="surface-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBar height={16} width={120} />
          <LoadingDots />
        </div>
        <SkeletonBar height={30} width="42%" />
        <SkeletonBar height={14} width="70%" />
      </section>

      <section className="surface-card space-y-4">
        <SkeletonBar height={22} width="28%" />
        <SkeletonBar height={14} width="78%" />
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="space-y-3">
                <SkeletonBar height={20} width="38%" />
                <SkeletonBar height={12} width="52%" />
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <SkeletonBar height={40} width={40} className="shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <SkeletonBar height={14} width="45%" />
                      <SkeletonBar height={12} width="88%" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export function ProblemSetLoadingSkeleton() {
  return (
    <main className="motion-rise space-y-4" aria-busy aria-label="Loading problem set">
      <section className="surface-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBar height={16} width="20%" />
          <LoadingDots />
        </div>
        <SkeletonBar height={28} width="55%" />
        <SkeletonBar height={14} width="75%" />
      </section>
      <section className="surface-card space-y-4">
        <SkeletonBar height={20} width="30%" />
        <SkeletonBar height={14} width="85%" />
        <div className="space-y-3 pt-1">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <SkeletonBar height={18} width="20%" />
                  <SkeletonBar height={14} width="90%" />
                  <SkeletonBar height={12} width="30%" />
                </div>
                <SkeletonBar height={36} width={96} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export function ProblemPageLoadingSkeleton() {
  return (
    <main className="motion-rise space-y-4" aria-busy aria-label="Loading problem">
      <section className="surface-card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBar height={14} width="30%" />
          <LoadingDots />
        </div>
        <SkeletonBar height={24} width="60%" />
        <div className="space-y-2">
          <SkeletonBar height={14} width="95%" />
          <SkeletonBar height={14} width="92%" />
          <SkeletonBar height={14} width="88%" />
          <SkeletonBar height={14} width="70%" />
        </div>
      </section>
      <section className="surface-card space-y-4">
        <SkeletonBar height={18} width="25%" />
        <SkeletonBar height={80} width="100%" />
        <div className="flex gap-2">
          <SkeletonBar height={36} width={100} />
          <SkeletonBar height={36} width={100} />
        </div>
      </section>
    </main>
  );
}
