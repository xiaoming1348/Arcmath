"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { translator } from "@/i18n/client";
import type { Locale } from "@/i18n/dictionary";

/**
 * Teacher-v1 JSON upload panel.
 *
 * Flow:
 *   1. Paste (or drag+drop) a JSON blob.
 *   2. Preview — runs the zod schema + counts + "existing set?" lookup
 *      without writing anything to the DB.
 *   3. Commit — writes the ProblemSet (stamped ORG_ONLY under this
 *      teacher's school) and optionally auto-assigns to a class.
 *
 * We deliberately keep the preview + commit paths as separate mutations
 * (mirroring the admin importer). It means the teacher can tweak the
 * JSON, re-preview, and only commit when the summary looks right — the
 * "I uploaded the wrong year" footgun bites hardest after the commit,
 * not before.
 */
export function TeacherUploadPanel({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const [jsonText, setJsonText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [autoAssignClassId, setAutoAssignClassId] = useState("");
  const [autoAssignDueAt, setAutoAssignDueAt] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const previewMutation = trpc.teacher.uploadPreview.useMutation({
    onError: (err) => setLocalError(err.message)
  });
  const commitMutation = trpc.teacher.uploadCommit.useMutation({
    onError: (err) => setLocalError(err.message)
  });

  const classesQuery = trpc.teacher.classes.list.useQuery();
  const classes = classesQuery.data ?? [];

  const preview = previewMutation.data ?? null;
  const commit = commitMutation.data ?? null;

  const canCommit = useMemo(() => {
    return Boolean(preview?.isValid) && !commitMutation.isPending;
  }, [preview, commitMutation.isPending]);

  return (
    <>
      <section className="surface-card space-y-3">
        <label className="space-y-2 text-sm text-slate-700">
          <span>{t("teacher.upload.paste_label")}</span>
          <textarea
            className="input-field min-h-[240px] font-mono text-xs"
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            placeholder={'{"schemaVersion": "arcmath-problem-set-v1", ...}'}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-secondary cursor-pointer">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setJsonText(text);
                setFileName(file.name);
                setLocalError(null);
                // Reset downstream state — a new file implies the old
                // preview/commit no longer applies.
                previewMutation.reset();
                commitMutation.reset();
              }}
            />
            Upload .json file
          </label>
          {fileName ? (
            <span className="text-xs text-slate-500">{fileName}</span>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            disabled={!jsonText.trim() || previewMutation.isPending}
            onClick={() => {
              setLocalError(null);
              commitMutation.reset();
              previewMutation.mutate({ jsonText });
            }}
          >
            {previewMutation.isPending
              ? t("common.loading")
              : t("teacher.upload.preview_button")}
          </button>
        </div>

        {localError ? (
          <p className="text-sm text-red-600">{localError}</p>
        ) : null}
      </section>

      {preview ? (
        <section className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Preview</h2>
          {preview.errors.length > 0 ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-semibold">Errors</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview.warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-semibold">Warnings</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <dl className="grid gap-3 md:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Title
              </dt>
              <dd className="text-sm text-slate-900">
                {preview.titleSuggestion ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Problems
              </dt>
              <dd className="text-sm text-slate-900">{preview.problemCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Proof problems
              </dt>
              <dd className="text-sm text-slate-900">
                {preview.proofProblemCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Already exists?
              </dt>
              <dd className="text-sm text-slate-900">
                {preview.existingSet ? "Yes (will update)" : "No (will create)"}
              </dd>
            </div>
          </dl>

          {preview.sample.length > 0 ? (
            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <summary className="cursor-pointer text-slate-700">
                Problem preview ({preview.sample.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {preview.sample.map((sample) => (
                  <li key={sample.number} className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">
                      #{sample.number}
                    </span>{" "}
                    — {sample.statementPreview}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {preview?.isValid ? (
        <section className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("teacher.upload.commit_button")}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              <span>{t("teacher.upload.auto_assign_label")}</span>
              <select
                className="input-field"
                value={autoAssignClassId}
                onChange={(event) => setAutoAssignClassId(event.target.value)}
              >
                <option value="">{t("teacher.upload.no_class_option")}</option>
                {classes.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name}
                  </option>
                ))}
              </select>
            </label>
            {autoAssignClassId ? (
              <label className="space-y-2 text-sm text-slate-700">
                <span>{t("teacher.class.assign_due_at_label")}</span>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={autoAssignDueAt}
                  onChange={(event) => setAutoAssignDueAt(event.target.value)}
                />
              </label>
            ) : null}
          </div>
          <button
            type="button"
            className="btn-primary w-fit"
            disabled={!canCommit}
            onClick={() => {
              setLocalError(null);
              let dueDate: Date | undefined;
              if (autoAssignClassId && autoAssignDueAt) {
                const d = new Date(autoAssignDueAt);
                if (Number.isNaN(d.getTime())) {
                  setLocalError("Invalid due date");
                  return;
                }
                dueDate = d;
              }
              commitMutation.mutate({
                jsonText,
                filename: fileName ?? undefined,
                autoAssignClassId: autoAssignClassId || undefined,
                autoAssignDueAt: dueDate
              });
            }}
          >
            {commitMutation.isPending
              ? t("common.loading")
              : t("teacher.upload.commit_button")}
          </button>
        </section>
      ) : null}

      {commit ? (
        <section className="surface-card space-y-2">
          <p className="text-sm text-emerald-700">
            {t("teacher.upload.success", {
              count: commit.createdProblems + commit.updatedProblems,
              proofs: commit.preprocessQueuedCount
            })}
          </p>
          <ul className="text-xs text-slate-500">
            <li>Created: {commit.createdProblems}</li>
            <li>Updated: {commit.updatedProblems}</li>
            <li>Skipped: {commit.skippedProblems}</li>
          </ul>
          {commit.assignmentId ? (
            <Link
              href={`/teacher/classes/${autoAssignClassId}`}
              className="btn-secondary w-fit"
            >
              Open class
            </Link>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
