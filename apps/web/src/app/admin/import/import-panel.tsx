"use client";

import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AppRouter } from "@/lib/trpc/router";
import { trpc } from "@/lib/trpc/client";

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsText(file);
  });
}

export function ImportPanel() {
  type RouterOutput = inferRouterOutputs<AppRouter>;
  type PreviewOutput = RouterOutput["admin"]["import"]["preview"];
  type CommitOutput = RouterOutput["admin"]["import"]["commit"];

  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [jsonText, setJsonText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewOutput | null>(null);
  const [commitResult, setCommitResult] = useState<CommitOutput | null>(null);
  // Poll active when a teacher-format commit produced PROOF rows that
  // need preprocessing. We turn polling off once all rows leave PENDING.
  const [pollActive, setPollActive] = useState(false);

  const previewMutation = trpc.admin.import.preview.useMutation();
  const commitMutation = trpc.admin.import.commit.useMutation();

  const problemSetIdForPolling =
    commitResult && "problemSetId" in commitResult ? commitResult.problemSetId : null;
  const preprocessStatusQuery = trpc.admin.import.preprocessStatus.useQuery(
    problemSetIdForPolling ? { problemSetId: problemSetIdForPolling } : { problemSetId: "" },
    {
      enabled: Boolean(problemSetIdForPolling) && pollActive,
      // Poll every 3s — preprocess takes 15-30s per problem, so 3s gives
      // decent responsiveness without hammering the DB.
      refetchInterval: pollActive ? 3000 : false
    }
  );

  // Stop polling once the backend reports 0 pending problems.
  useEffect(() => {
    if (!preprocessStatusQuery.data) return;
    if (preprocessStatusQuery.data.pendingCount === 0 && pollActive) {
      setPollActive(false);
    }
  }, [preprocessStatusQuery.data, pollActive]);

  // Start polling whenever a fresh commit returns PROOF preprocess work.
  useEffect(() => {
    if (
      commitResult &&
      "preprocessQueuedCount" in commitResult &&
      typeof commitResult.preprocessQueuedCount === "number" &&
      commitResult.preprocessQueuedCount > 0
    ) {
      setPollActive(true);
    } else {
      setPollActive(false);
    }
  }, [commitResult]);

  const importLink = useMemo(() => {
    if (!preview?.problemSetKey) {
      return "/resources";
    }

    const params = new URLSearchParams();
    params.set("contest", preview.problemSetKey.contest);
    params.set("year", String(preview.problemSetKey.year));
    if (preview.problemSetKey.exam) {
      params.set("exam", preview.problemSetKey.exam);
    }
    return `/resources?${params.toString()}`;
  }, [preview]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setCommitResult(null);
    setLocalError(null);
    previewMutation.reset();
    commitMutation.reset();

    if (!file) {
      setFileName(undefined);
      setJsonText("");
      return;
    }

    try {
      const text = await readTextFile(file);
      setFileName(file.name);
      setJsonText(text);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to read selected file");
    }
  }

  async function runPreview() {
    setLocalError(null);
    setCommitResult(null);
    try {
      const result = await previewMutation.mutateAsync({ jsonText, filename: fileName });
      setPreview(result);
    } catch (error) {
      setPreview(null);
      setLocalError(error instanceof Error ? error.message : "Preview failed");
    }
  }

  async function runCommit() {
    setLocalError(null);
    try {
      const result = await commitMutation.mutateAsync({ jsonText, filename: fileName });
      setCommitResult(result);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Commit failed");
    }
  }

  const previewErrors = preview?.errors ?? [];
  const previewWarnings = preview?.warnings ?? [];
  const canCommit = Boolean(preview?.isValid) && !commitMutation.isPending;
  const previewFormat = preview && "format" in preview ? preview.format : null;
  const previewProofCount =
    preview && "proofProblemCount" in preview ? preview.proofProblemCount : 0;
  const commitFormat = commitResult && "format" in commitResult ? commitResult.format : null;
  const preprocessQueued =
    commitResult && "preprocessQueuedCount" in commitResult
      ? commitResult.preprocessQueuedCount
      : 0;

  return (
    <div className="space-y-4">
      <section className="surface-card space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">Contest & Homework Import</h1>
        <p className="text-sm text-slate-600">
          Upload contest JSON (AMC/AIME) or a teacher-format homework set
          (<code>schemaVersion: &quot;arcmath-problem-set-v1&quot;</code>). The
          system auto-detects the format. PROOF problems are queued for
          milestone-checklist generation after commit.
        </p>

        <label className="block text-sm text-slate-700">
          JSON File
          <input className="input-field" type="file" accept=".json,application/json" onChange={onFileChange} />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={!jsonText || previewMutation.isPending}
            onClick={runPreview}
          >
            {previewMutation.isPending ? "Previewing..." : "Preview"}
          </button>
          <button type="button" className="btn-secondary" disabled={!canCommit} onClick={runCommit}>
            {commitMutation.isPending ? "Committing..." : "Commit"}
          </button>
        </div>

        {localError ? <p className="text-sm text-red-600">{localError}</p> : null}
        {previewMutation.error ? <p className="text-sm text-red-600">{previewMutation.error.message}</p> : null}
        {commitMutation.error ? <p className="text-sm text-red-600">{commitMutation.error.message}</p> : null}
      </section>

      {preview ? (
        <section className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Preview Report</h2>
          <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            <p>Valid: {preview.isValid ? "Yes" : "No"}</p>
            <p>Format: {previewFormat ?? "unknown"}</p>
            <p>Filename: {fileName ?? "inline.json"}</p>
            <p>Problem count: {preview.problemCount}</p>
            <p>PROOF problems: {previewProofCount}</p>
            <p>Existing set: {preview.existingSet ? "Yes" : "No"}</p>
            <p>
              Key:{" "}
              {preview.problemSetKey
                ? `${preview.problemSetKey.contest} ${preview.problemSetKey.year}${preview.problemSetKey.exam ? ` ${preview.problemSetKey.exam}` : ""}`
                : "N/A"}
            </p>
            <p>Title: {preview.titleSuggestion ?? "N/A"}</p>
          </div>

          {preview.existingProblemNumbers.length > 0 ? (
            <p className="text-sm text-amber-700">
              Existing problem numbers: {preview.existingProblemNumbers.join(", ")}
            </p>
          ) : null}

          {previewWarnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
              {previewWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          {previewErrors.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-600">
              {previewErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          {preview.sample.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sample Problems</h3>
              <ul className="space-y-2">
                {preview.sample.map((item) => (
                  <li key={item.number} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-slate-900">#{item.number}</p>
                    <p className="text-slate-600">{item.statementPreview}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {commitResult ? (
        <section className="surface-card space-y-2">
          <h2 className="text-lg font-semibold text-emerald-900">Commit Successful</h2>
          <p className="text-sm text-slate-700">Format: {commitFormat ?? "unknown"}</p>
          <p className="text-sm text-slate-700">Problem Set ID: {commitResult.problemSetId}</p>
          <p className="text-sm text-slate-700">Created: {commitResult.createdProblems}</p>
          <p className="text-sm text-slate-700">Updated: {commitResult.updatedProblems}</p>
          <p className="text-sm text-slate-700">Skipped: {commitResult.skippedProblems}</p>
          {preprocessQueued > 0 ? (
            <p className="text-sm text-emerald-800">
              {preprocessQueued} PROOF problem(s) queued for milestone generation.
            </p>
          ) : null}
          {commitResult.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
              {commitResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <Link className="btn-secondary" href={importLink}>
            View Imported Resources
          </Link>
        </section>
      ) : null}

      {preprocessStatusQuery.data && problemSetIdForPolling ? (
        <PreprocessProgress
          data={preprocessStatusQuery.data}
          stillPolling={pollActive}
        />
      ) : null}
    </div>
  );
}

type PreprocessStatusData =
  inferRouterOutputs<AppRouter>["admin"]["import"]["preprocessStatus"];

function PreprocessProgress({
  data,
  stillPolling
}: {
  data: PreprocessStatusData;
  stillPolling: boolean;
}) {
  const total = data.total;
  if (total === 0) return null;
  const done =
    (data.counts.VERIFIED ?? 0) +
    (data.counts.FAILED ?? 0) +
    (data.counts.MANUAL_REVIEW ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section className="surface-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Preprocessing Progress
        </h2>
        <span className="text-sm text-slate-600">
          {done}/{total} done{stillPolling ? " — polling..." : ""}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-2 rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(data.counts).map(([status, count]) => {
          if (count === 0) return null;
          const color =
            status === "VERIFIED"
              ? "bg-emerald-100 text-emerald-800"
              : status === "FAILED"
                ? "bg-red-100 text-red-800"
                : status === "MANUAL_REVIEW"
                  ? "bg-amber-100 text-amber-800"
                  : status === "PENDING"
                    ? "bg-sky-100 text-sky-800"
                    : "bg-slate-100 text-slate-700";
          return (
            <span
              key={status}
              className={`rounded-full px-2 py-0.5 font-medium ${color}`}
            >
              {status.toLowerCase().replace(/_/g, " ")}: {count}
            </span>
          );
        })}
      </div>

      <details className="text-sm text-slate-700">
        <summary className="cursor-pointer">Per-problem detail</summary>
        <ul className="mt-2 space-y-1">
          {data.problems.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">#{p.number}</span>
              <span className="text-slate-500">{p.formalizedStatus}</span>
              {p.hasRecipe ? (
                <span className="text-emerald-700">✓ recipe</span>
              ) : null}
              {p.formalizedReason ? (
                <span
                  className="truncate text-slate-500"
                  title={p.formalizedReason}
                >
                  — {p.formalizedReason.slice(0, 80)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
