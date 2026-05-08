"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";

/**
 * Platform-admin analytics + audit log viewer.
 *
 * Two tabs:
 *   - Schools: one row per tenant with seat utilization, class count,
 *     recent practice-run count (configurable window), teacher-upload
 *     count, and a rollup health flag.
 *   - Audit: chronological list of sensitive admin/teacher actions,
 *     filterable by org and action namespace. Not meant as a full-
 *     text search; the point is to have *a* place to read the log
 *     during incident response.
 *
 * Deliberately no export-to-CSV or time-series charts for the pilot —
 * we'll add them once there's a real question we can't answer with
 * the table view.
 */

type TabKey = "schools" | "audit";

export function AdminAnalyticsPanel() {
  const [tab, setTab] = useState<TabKey>("schools");

  return (
    <section className="surface-card space-y-4">
      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "schools"} onClick={() => setTab("schools")}>
          Schools
        </TabButton>
        <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>
          Audit log
        </TabButton>
      </div>
      {tab === "schools" ? <SchoolsTab /> : <AuditTab />}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={
        active
          ? "rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white"
          : "rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-600 hover:border-[var(--accent)]"
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SchoolsTab() {
  const [rangeDays, setRangeDays] = useState<number>(14);
  const query = trpc.admin.analytics.schools.useQuery({ rangeDays });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>Activity window:</span>
        {[7, 14, 30, 90].map((n) => (
          <button
            key={n}
            type="button"
            className={
              rangeDays === n
                ? "rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-[var(--accent)]"
            }
            onClick={() => setRangeDays(n)}
          >
            {n}d
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : query.error ? (
        <p className="text-sm text-red-600">{query.error.message}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold"></th>
                <th className="px-3 py-2 text-left font-semibold">School</th>
                <th className="px-3 py-2 text-left font-semibold">Plan</th>
                <th className="px-3 py-2 text-right font-semibold">Teachers</th>
                <th className="px-3 py-2 text-right font-semibold">Students</th>
                <th className="px-3 py-2 text-right font-semibold">Classes</th>
                <th className="px-3 py-2 text-right font-semibold">Asgmts</th>
                <th className="px-3 py-2 text-right font-semibold">
                  Runs / {rangeDays}d
                </th>
                <th className="px-3 py-2 text-right font-semibold">Uploads</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.rows ?? []).map((row) => (
                <tr
                  key={row.organizationId}
                  className="border-t border-slate-100"
                >
                  <td className="px-3 py-2">
                    <HealthDot tone={row.health} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-900">
                        {row.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.slug} · {row.defaultLocale}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.planType}
                    {row.trialEndsAt ? (
                      <span className="ml-1 text-xs text-slate-500">
                        (trial ends{" "}
                        {new Date(row.trialEndsAt).toLocaleDateString()})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {row.teachers}/{row.teacherSeatMax}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {row.students}/{row.studentSeatMax}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {row.classes}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {row.assignments}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {row.recentRuns}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {row.uploads}
                  </td>
                </tr>
              ))}
              {(query.data?.rows.length ?? 0) === 0 ? (
                <tr>
                  <td
                    className="px-3 py-4 text-center text-sm text-slate-500"
                    colSpan={9}
                  >
                    No schools yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditTab() {
  const [orgId, setOrgId] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [limit, setLimit] = useState<number>(50);

  const schoolsQuery = trpc.admin.analytics.schools.useQuery({ rangeDays: 30 });
  const query = trpc.admin.analytics.auditLog.useQuery({
    organizationId: orgId || undefined,
    action: actionFilter || undefined,
    limit
  });

  const schoolOptions = useMemo(
    () => schoolsQuery.data?.rows ?? [],
    [schoolsQuery.data?.rows]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-slate-600">
          <span>School</span>
          <select
            className="input-field"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            <option value="">(all)</option>
            {schoolOptions.map((s) => (
              <option key={s.organizationId} value={s.organizationId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-slate-600">
          <span>Action contains</span>
          <input
            className="input-field"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="e.g. teacher.class."
          />
        </label>
        <label className="space-y-1 text-xs text-slate-600">
          <span>Limit</span>
          <select
            className="input-field"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : query.error ? (
        <p className="text-sm text-red-600">{query.error.message}</p>
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <p className="text-sm text-slate-500">No events in range.</p>
      ) : (
        <ul className="space-y-2">
          {query.data!.items.map((evt) => (
            <li
              key={evt.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="font-mono text-xs text-[var(--accent)]">
                    {evt.action}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(evt.createdAt).toLocaleString()}
                    {evt.organizationName
                      ? ` · ${evt.organizationName}`
                      : " · (platform-wide)"}
                    {evt.actorEmail ? ` · ${evt.actorEmail}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-600">
                  {evt.targetType}
                  {evt.targetId ? (
                    <>
                      {" "}
                      <span className="font-mono text-[10px] text-slate-400">
                        {evt.targetId}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              {evt.payload ? (
                <pre className="mt-2 overflow-x-auto rounded-xl bg-white px-3 py-2 text-[11px] text-slate-700">
                  {JSON.stringify(evt.payload, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HealthDot({ tone }: { tone: "green" | "yellow" | "red" }) {
  const color =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "yellow"
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      aria-hidden
    />
  );
}
