"use client";

import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
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

  const previewMutation = trpc.admin.import.preview.useMutation();
  const commitMutation = trpc.admin.import.commit.useMutation();

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

  return (
    <div className="space-y-4">
      <section className="surface-card space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">Contest Import</h1>
        <p className="text-sm text-slate-600">
          Upload AMC/AIME JSON, preview validation and DB impact, then commit idempotently.
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
            <p>Filename: {fileName ?? "inline.json"}</p>
            <p>Problem count: {preview.problemCount}</p>
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
          <p className="text-sm text-slate-700">Problem Set ID: {commitResult.problemSetId}</p>
          <p className="text-sm text-slate-700">Created: {commitResult.createdProblems}</p>
          <p className="text-sm text-slate-700">Updated: {commitResult.updatedProblems}</p>
          <p className="text-sm text-slate-700">Skipped: {commitResult.skippedProblems}</p>
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
    </div>
  );
}
