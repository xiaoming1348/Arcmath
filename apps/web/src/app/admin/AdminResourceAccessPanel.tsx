"use client";

import { FormEvent, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function AdminResourceAccessPanel() {
  const [emailInput, setEmailInput] = useState("");
  const [targetEmail, setTargetEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pdfProblemSetId, setPdfProblemSetId] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [autoResolveProblemSetId, setAutoResolveProblemSetId] = useState("");
  const [cacheProblemSetId, setCacheProblemSetId] = useState("");
  const [cacheForceRefresh, setCacheForceRefresh] = useState(false);
  const [generateProblemSetId, setGenerateProblemSetId] = useState("");
  const [generateForceRefresh, setGenerateForceRefresh] = useState(false);
  const [batchContest, setBatchContest] = useState<"" | "AMC8" | "AMC10" | "AMC12" | "AIME">("");
  const [batchYearFrom, setBatchYearFrom] = useState("");
  const [batchYearTo, setBatchYearTo] = useState("");
  const [batchLimit, setBatchLimit] = useState("");
  const [batchForceRefresh, setBatchForceRefresh] = useState(false);
  const [batchDryRun, setBatchDryRun] = useState(true);
  const [batchRetryFailedOnly, setBatchRetryFailedOnly] = useState(false);
  const [batchMaxErrors, setBatchMaxErrors] = useState("");
  const [batchSummary, setBatchSummary] = useState<{
    scanned: number;
    generated_cached: number;
    skipped_already_cached: number;
    skipped_no_problems: number;
    render_failed: number;
    cache_failed: number;
    aborted: boolean;
  } | null>(null);
  const statsQuery = trpc.admin.resourceAccess.officialPdfCacheStats.useQuery(
    {},
    {
      retry: false
    }
  );

  const lookupQuery = trpc.admin.resourceAccess.lookupUser.useQuery(
    { email: targetEmail ?? "placeholder@example.com" },
    {
      enabled: Boolean(targetEmail),
      retry: false
    }
  );

  const clearMutation = trpc.admin.resourceAccess.clearUserLocks.useMutation({
    onSuccess: async (result) => {
      setNotice(`Released ${result.clearedCount} lock record(s). Remaining used: ${result.remaining}.`);
      await lookupQuery.refetch();
    },
    onError: (error) => {
      setNotice(error.message);
    }
  });

  const verifyPdfMutation = trpc.admin.resourceAccess.verifyOfficialPdf.useMutation({
    onSuccess: (result) => {
      setNotice(`Official PDF verified for "${result.problemSet.title}".`);
    },
    onError: (error) => {
      setNotice(error.message);
    }
  });

  const autoResolvePdfMutation = trpc.admin.resourceAccess.autoResolveOfficialPdf.useMutation({
    onSuccess: (result) => {
      setNotice(`Resolved and verified official PDF for "${result.problemSet.title}".`);
      setPdfProblemSetId(result.problemSet.id);
      setPdfUrl(result.problemSet.verifiedPdfUrl ?? "");
    },
    onError: (error) => {
      setNotice(error.message);
    }
  });

  const cachePdfMutation = trpc.admin.resourceAccess.cacheOfficialPdf.useMutation({
    onSuccess: async (result) => {
      const cacheSummary = `Cached locally: ${result.cache.path} (${result.cache.size} bytes, sha256 ${result.cache.sha256.slice(0, 12)}...)`;
      setNotice(`${result.problemSet.title} - ${cacheSummary}`);
      setCacheProblemSetId(result.problemSet.id);
      await statsQuery.refetch();
    },
    onError: (error) => {
      setNotice(error.message);
    }
  });

  const generatePdfMutation = trpc.admin.resourceAccess.generatePdfFromProblems.useMutation({
    onSuccess: async (result) => {
      const cacheSummary = `Generated and cached: ${result.cache.path} (${result.cache.size} bytes, sha256 ${result.cache.sha256.slice(0, 12)}...)`;
      setNotice(`${result.problemSet.title} - ${cacheSummary}`);
      setGenerateProblemSetId(result.problemSet.id);
      await statsQuery.refetch();
    },
    onError: (error) => {
      setNotice(error.message);
    }
  });

  const batchGenerateMutation = trpc.admin.resourceAccess.backfillGeneratedPdfs.useMutation({
    onSuccess: async (result) => {
      setBatchSummary(result);
      setNotice(
        `Batch generation complete. scanned=${result.scanned}, generated=${result.generated_cached}, skipped_no_problems=${result.skipped_no_problems}, render_failed=${result.render_failed}, cache_failed=${result.cache_failed}`
      );
      await statsQuery.refetch();
    },
    onError: (error) => {
      setNotice(error.message);
    }
  });

  const canSubmit = useMemo(() => normalizeEmail(emailInput).length > 3, [emailInput]);

  const onLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = normalizeEmail(emailInput);
    if (!email) {
      return;
    }
    setNotice(null);
    setTargetEmail(email);
  };

  const parseOptionalInt = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      return undefined;
    }
    return parsed;
  };

  return (
    <section className="surface-card space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Resource Lock Manager</h2>
      <p className="text-sm text-slate-600">
        Search uses no quota. Free quota is consumed only on PDF download. Use this panel to release lock usage for a specific user.
      </p>

      <form className="flex flex-col gap-2 md:flex-row md:items-end" onSubmit={onLookup}>
        <label className="text-sm text-slate-700">
          User Email
          <input
            type="email"
            className="input-field"
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            placeholder="student@example.com"
          />
        </label>
        <button type="submit" className="btn-primary" disabled={!canSubmit || lookupQuery.isFetching}>
          {lookupQuery.isFetching ? "Checking..." : "Check Lock Status"}
        </button>
      </form>

      {notice ? <p className="text-sm text-amber-700">{notice}</p> : null}
      {lookupQuery.error ? <p className="text-sm text-red-600">{lookupQuery.error.message}</p> : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Generated PDF Cache Stats</h3>
          <button
            type="button"
            className="btn-secondary"
            disabled={statsQuery.isFetching}
            onClick={() => {
              void statsQuery.refetch();
            }}
          >
            {statsQuery.isFetching ? "Refreshing..." : "Refresh Stats"}
          </button>
        </div>
        {statsQuery.error ? (
          <p className="mt-2 text-sm text-red-600">{statsQuery.error.message}</p>
        ) : statsQuery.data ? (
          <div className="mt-2 space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-semibold">Coverage:</span> {statsQuery.data.coveragePercent}% ({statsQuery.data.cachedCount}/
              {statsQuery.data.totalProblemSets})
            </p>
            <p>
              <span className="font-semibold">Missing:</span> {statsQuery.data.missingCount}{" "}
              <span className="font-semibold">Failed:</span> {statsQuery.data.failedCount}
            </p>
            <p>
              <span className="font-semibold">Generatable:</span> {statsQuery.data.generatableCount}{" "}
              <span className="font-semibold">Needs generation:</span> {statsQuery.data.needsGenerationCount}{" "}
              <span className="font-semibold">No problems:</span> {statsQuery.data.noProblemCount}
            </p>
            <p className="text-xs text-slate-600">
              By contest:{" "}
              {statsQuery.data.breakdown.byContest.length > 0
                ? statsQuery.data.breakdown.byContest
                    .map((row) => `${row.contest} ${row.cached}/${row.total}`)
                    .join(" | ")
                : "n/a"}
            </p>
            <p className="text-xs text-slate-600">
              By year band:{" "}
              {statsQuery.data.breakdown.byYearBand.length > 0
                ? statsQuery.data.breakdown.byYearBand
                    .map((row) => `${row.yearBand} ${row.cached}/${row.total}`)
                    .join(" | ")
                : "n/a"}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Loading stats...</p>
        )}
      </div>

      {lookupQuery.data ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>
              <span className="font-semibold">User:</span> {lookupQuery.data.user.email} ({lookupQuery.data.user.role})
            </p>
            <p>
              <span className="font-semibold">Used:</span> {lookupQuery.data.used}/{lookupQuery.data.freeLimit}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={clearMutation.isPending || lookupQuery.data.used === 0}
              onClick={() => {
                clearMutation.mutate({ email: lookupQuery.data.user.email });
              }}
            >
              {clearMutation.isPending ? "Releasing..." : "Release All Locks For User"}
            </button>
          </div>

          {lookupQuery.data.accesses.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Current Lock Records</h3>
              <ul className="space-y-2">
                {lookupQuery.data.accesses.map((access) => (
                  <li key={access.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <p className="font-medium text-slate-900">
                      {access.problemSet.title} ({access.problemSet.contest} {access.problemSet.year}
                      {access.problemSet.exam ? ` ${access.problemSet.exam}` : ""})
                    </p>
                    <p className="text-xs text-slate-500">Created: {new Date(access.createdAt).toLocaleString()}</p>
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-red-700 underline"
                      disabled={clearMutation.isPending}
                      onClick={() => {
                        clearMutation.mutate({
                          email: lookupQuery.data.user.email,
                          problemSetId: access.problemSet.id
                        });
                      }}
                    >
                      Release This Lock Slot
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No lock records for this user.</p>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Generate PDF From Stored Problems
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Build a downloadable PDF from imported problem text and cache it in configured storage.
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr,auto]">
          <input
            type="text"
            className="input-field"
            placeholder="problemSetId"
            value={generateProblemSetId}
            onChange={(event) => setGenerateProblemSetId(event.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={generatePdfMutation.isPending || generateProblemSetId.trim().length === 0}
            onClick={() => {
              generatePdfMutation.mutate({
                problemSetId: generateProblemSetId.trim(),
                force: generateForceRefresh
              });
            }}
          >
            {generatePdfMutation.isPending ? "Generating..." : "Generate PDF From Stored Problems"}
          </button>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={generateForceRefresh}
            onChange={(event) => setGenerateForceRefresh(event.target.checked)}
          />
          Force refresh (regenerate even if cache exists)
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Batch Generate PDFs (Stored Problems)
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Run scoped generation across many sets without CLI. Uses the same service as route fallback and backfill CLI.
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <label className="text-xs text-slate-700">
            Contest
            <select
              className="input-field"
              value={batchContest}
              onChange={(event) =>
                setBatchContest(event.target.value as "" | "AMC8" | "AMC10" | "AMC12" | "AIME")
              }
            >
              <option value="">All</option>
              <option value="AMC8">AMC8</option>
              <option value="AMC10">AMC10</option>
              <option value="AMC12">AMC12</option>
              <option value="AIME">AIME</option>
            </select>
          </label>
          <label className="text-xs text-slate-700">
            Year From
            <input
              type="number"
              className="input-field"
              value={batchYearFrom}
              onChange={(event) => setBatchYearFrom(event.target.value)}
              placeholder="2010"
            />
          </label>
          <label className="text-xs text-slate-700">
            Year To
            <input
              type="number"
              className="input-field"
              value={batchYearTo}
              onChange={(event) => setBatchYearTo(event.target.value)}
              placeholder="2025"
            />
          </label>
          <label className="text-xs text-slate-700">
            Limit
            <input
              type="number"
              className="input-field"
              value={batchLimit}
              onChange={(event) => setBatchLimit(event.target.value)}
              placeholder="100"
            />
          </label>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={batchForceRefresh}
              onChange={(event) => setBatchForceRefresh(event.target.checked)}
            />
            Force
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={batchDryRun}
              onChange={(event) => setBatchDryRun(event.target.checked)}
            />
            Dry Run
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={batchRetryFailedOnly}
              onChange={(event) => setBatchRetryFailedOnly(event.target.checked)}
            />
            Retry Failed Only
          </label>
          <label className="text-xs text-slate-700">
            Max Errors
            <input
              type="number"
              className="input-field"
              value={batchMaxErrors}
              onChange={(event) => setBatchMaxErrors(event.target.value)}
              placeholder="10"
            />
          </label>
        </div>
        <div className="mt-2">
          <button
            type="button"
            className="btn-primary"
            disabled={batchGenerateMutation.isPending}
            onClick={() => {
              setBatchSummary(null);
              batchGenerateMutation.mutate({
                contest: batchContest || undefined,
                yearFrom: parseOptionalInt(batchYearFrom),
                yearTo: parseOptionalInt(batchYearTo),
                limit: parseOptionalInt(batchLimit),
                force: batchForceRefresh,
                dryRun: batchDryRun,
                retryFailedOnly: batchRetryFailedOnly,
                maxErrors: parseOptionalInt(batchMaxErrors)
              });
            }}
          >
            {batchGenerateMutation.isPending ? "Running..." : "Run Batch Generation"}
          </button>
        </div>
        {batchSummary ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
            <p>
              scanned={batchSummary.scanned} generated={batchSummary.generated_cached} cached_skip=
              {batchSummary.skipped_already_cached}
            </p>
            <p>
              no_problems={batchSummary.skipped_no_problems} render_failed={batchSummary.render_failed} cache_failed=
              {batchSummary.cache_failed}
            </p>
            <p>aborted={batchSummary.aborted ? "true" : "false"}</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-300 bg-slate-100 p-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Official PDF Fallback Tools (Deprecated)
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Legacy/manual fallback only. Primary production workflow is generated PDFs from stored problems.
        </p>
      </div>

      <div className="rounded-xl border border-slate-300 bg-slate-100 p-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Auto Resolve Official PDF</h3>
        <p className="mt-1 text-xs text-slate-600">
          Resolve from ProblemSet sourceUrl and persist verified official PDF automatically.
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr,auto]">
          <input
            type="text"
            className="input-field"
            placeholder="problemSetId"
            value={autoResolveProblemSetId}
            onChange={(event) => setAutoResolveProblemSetId(event.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={autoResolvePdfMutation.isPending || autoResolveProblemSetId.trim().length === 0}
            onClick={() => {
              autoResolvePdfMutation.mutate({
                problemSetId: autoResolveProblemSetId.trim()
              });
            }}
          >
            {autoResolvePdfMutation.isPending ? "Resolving..." : "Auto Resolve Official PDF"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-300 bg-slate-100 p-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Cache Official PDF Locally</h3>
        <p className="mt-1 text-xs text-slate-600">
          Download and cache the official PDF under local filesystem storage for stable serving.
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr,auto]">
          <input
            type="text"
            className="input-field"
            placeholder="problemSetId"
            value={cacheProblemSetId}
            onChange={(event) => setCacheProblemSetId(event.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={cachePdfMutation.isPending || cacheProblemSetId.trim().length === 0}
            onClick={() => {
              cachePdfMutation.mutate({
                problemSetId: cacheProblemSetId.trim(),
                force: cacheForceRefresh
              });
            }}
          >
            {cachePdfMutation.isPending ? "Caching..." : "Cache Official PDF Locally"}
          </button>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={cacheForceRefresh}
            onChange={(event) => setCacheForceRefresh(event.target.checked)}
          />
          Force refresh (re-download even if cache exists)
        </label>
      </div>

      <div className="rounded-xl border border-slate-300 bg-slate-100 p-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Verify Official PDF URL</h3>
        <p className="mt-1 text-xs text-slate-600">
          Manual override. This link is shown on `/resources` only if server validation confirms it is a real PDF.
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr,2fr,auto]">
          <input
            type="text"
            className="input-field"
            placeholder="problemSetId"
            value={pdfProblemSetId}
            onChange={(event) => setPdfProblemSetId(event.target.value)}
          />
          <input
            type="url"
            className="input-field"
            placeholder="https://...pdf"
            value={pdfUrl}
            onChange={(event) => setPdfUrl(event.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={verifyPdfMutation.isPending || pdfProblemSetId.trim().length === 0 || pdfUrl.trim().length === 0}
            onClick={() => {
              verifyPdfMutation.mutate({
                problemSetId: pdfProblemSetId.trim(),
                pdfUrl: pdfUrl.trim()
              });
            }}
          >
            {verifyPdfMutation.isPending ? "Verifying..." : "Verify URL"}
          </button>
        </div>
      </div>
    </section>
  );
}
