"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/i18n/client";
import type { AppRouter } from "@/lib/trpc/router";

/**
 * Student dashboard panel. Three concerns:
 *   1. Overview strip (classes, upcoming, overdue, completed).
 *   2. Grouped assignment list — overdue first (red), then upcoming /
 *      in-progress, then completed for reference.
 *   3. Join-class form, always rendered so existing students can join
 *      additional classes and brand-new students have something to do
 *      when the list is empty.
 *
 * Status math lives server-side in the tRPC router so the UI can stay
 * presentation-only. The "Start / Continue / Review" CTA dispatches
 * a startAssignment mutation which finds-or-creates the right
 * PracticeRun, then routes into the existing practice session page.
 */

type StudentRouterOutputs = inferRouterOutputs<AppRouter>["student"];
type AssignmentRow = StudentRouterOutputs["assignments"]["items"][number];
type ResourceAssignmentRow =
  StudentRouterOutputs["assignments"]["resourceItems"][number];
type ClassRow = StudentRouterOutputs["overview"]["classes"][number];

export function StudentHomePanel() {
  const { t } = useT();
  const router = useRouter();
  const overviewQuery = trpc.student.overview.useQuery();
  const assignmentsQuery = trpc.student.assignments.useQuery();
  const utils = trpc.useContext();

  const startMutation = trpc.student.startAssignment.useMutation({
    onSuccess: ({ runId, problemSetId }) => {
      router.push(`/problems/set/${problemSetId}?runId=${runId}`);
    }
  });

  const buckets = useMemo(() => {
    const items = assignmentsQuery.data?.items ?? [];
    return {
      overdue: items.filter((it) => it.status === "OVERDUE"),
      active: items.filter(
        (it) => it.status === "NOT_STARTED" || it.status === "IN_PROGRESS"
      ),
      completed: items.filter((it) => it.status === "COMPLETED")
    };
  }, [assignmentsQuery.data?.items]);
  const resourceBuckets = useMemo(() => {
    const items = assignmentsQuery.data?.resourceItems ?? [];
    return {
      overdue: items.filter((it) => it.status === "OVERDUE"),
      active: items.filter(
        (it) => it.status === "NOT_SUBMITTED" || it.status === "SUBMITTED"
      ),
      completed: items.filter((it) => it.status === "GRADED")
    };
  }, [assignmentsQuery.data?.resourceItems]);

  const isEmpty =
    !assignmentsQuery.isLoading &&
    (assignmentsQuery.data?.items.length ?? 0) === 0 &&
    (assignmentsQuery.data?.resourceItems.length ?? 0) === 0 &&
    (overviewQuery.data?.classes.length ?? 0) === 0;

  return (
    <>
      <section className="grid gap-3 md:grid-cols-4">
        <CountCard
          label={t("student.home.classes_card")}
          value={overviewQuery.data?.classes.length}
        />
        <CountCard
          label={t("student.home.upcoming_card")}
          value={overviewQuery.data?.upcomingCount}
          tone="blue"
        />
        <CountCard
          label={t("student.home.overdue_card")}
          value={overviewQuery.data?.overdueCount}
          tone="red"
        />
        <CountCard
          label={t("student.home.completed_card")}
          value={overviewQuery.data?.completedCount}
          tone="green"
        />
      </section>

      {/* Roster-creation product policy: students are auto-enrolled
          when their school admin creates the class with their name in
          the roster. The legacy "Join via code" form is no longer
          mounted, but the form component below remains in the file
          so existing tests continue to import it. */}

      <section className="surface-card space-y-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("student.home.classes_heading")}
          </h2>
        </header>
        {overviewQuery.isLoading ? (
          <p className="text-sm text-slate-500">{t("common.loading")}</p>
        ) : overviewQuery.data?.classes.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {overviewQuery.data.classes.map((klass) => (
              <ClassTile key={klass.classId} klass={klass} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">{t("student.home.empty_classes")}</p>
        )}
      </section>

      <section className="surface-card space-y-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("student.home.assignments_heading")}
          </h2>
        </header>

        {assignmentsQuery.isLoading ? (
          <p className="text-sm text-slate-500">{t("common.loading")}</p>
        ) : assignmentsQuery.error ? (
          <p className="text-sm text-red-600">{assignmentsQuery.error.message}</p>
        ) : isEmpty ? (
          <p className="text-sm text-slate-600">
            {t("student.home.empty_assignments")}
          </p>
        ) : (
          <div className="space-y-5">
            {buckets.overdue.length > 0 ? (
              <AssignmentGroup
                heading={t("student.home.section_overdue")}
                tone="red"
                items={buckets.overdue}
                onStart={(id) => startMutation.mutate({ assignmentId: id })}
                isLaunching={startMutation.isPending}
              />
            ) : null}
            {buckets.active.length > 0 ? (
              <AssignmentGroup
                heading={t("student.home.section_upcoming")}
                tone="blue"
                items={buckets.active}
                onStart={(id) => startMutation.mutate({ assignmentId: id })}
                isLaunching={startMutation.isPending}
              />
            ) : null}
            {buckets.completed.length > 0 ? (
              <AssignmentGroup
                heading={t("student.home.section_completed")}
                tone="green"
                items={buckets.completed}
                onStart={(id) => startMutation.mutate({ assignmentId: id })}
                isLaunching={startMutation.isPending}
              />
            ) : null}
            {resourceBuckets.overdue.length > 0 ? (
              <ResourceAssignmentGroup
                heading="PDF assignments overdue"
                tone="red"
                items={resourceBuckets.overdue}
              />
            ) : null}
            {resourceBuckets.active.length > 0 ? (
              <ResourceAssignmentGroup
                heading="PDF assignments"
                tone="blue"
                items={resourceBuckets.active}
              />
            ) : null}
            {resourceBuckets.completed.length > 0 ? (
              <ResourceAssignmentGroup
                heading="Graded PDF assignments"
                tone="green"
                items={resourceBuckets.completed}
              />
            ) : null}
          </div>
        )}

        {startMutation.error ? (
          <p className="text-sm text-red-600">{startMutation.error.message}</p>
        ) : null}
      </section>
    </>
  );
}

// --- sub-components --------------------------------------------------------

function ClassTile({ klass }: { klass: ClassRow }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-semibold text-slate-900">{klass.className}</p>
      {klass.organizationName ? (
        <p className="text-xs text-slate-500">{klass.organizationName}</p>
      ) : null}
    </li>
  );
}

function AssignmentGroup({
  heading,
  tone,
  items,
  onStart,
  isLaunching
}: {
  heading: string;
  tone: "red" | "blue" | "green";
  items: AssignmentRow[];
  onStart: (assignmentId: string) => void;
  isLaunching: boolean;
}) {
  const toneBar =
    tone === "red"
      ? "bg-red-500"
      : tone === "green"
        ? "bg-emerald-500"
        : "bg-[var(--accent)]";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${toneBar}`} aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          {heading}
        </h3>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <AssignmentRowCard
            key={item.assignmentId}
            item={item}
            onStart={onStart}
            isLaunching={isLaunching}
          />
        ))}
      </ul>
    </div>
  );
}

function AssignmentRowCard({
  item,
  onStart,
  isLaunching
}: {
  item: AssignmentRow;
  onStart: (assignmentId: string) => void;
  isLaunching: boolean;
}) {
  const { t } = useT();
  const dueLabel = useMemo(() => formatDueLabel(item.dueAt, t), [item.dueAt, t]);
  const statusLabel =
    item.status === "COMPLETED"
      ? t("student.home.completed")
      : item.status === "OVERDUE"
        ? t("student.home.overdue")
        : item.status === "IN_PROGRESS"
          ? t("student.home.in_progress")
          : t("student.home.not_started");

  const ctaLabel =
    item.status === "COMPLETED"
      ? t("student.home.review_button")
      : item.status === "IN_PROGRESS"
        ? t("student.home.continue_button")
        : t("student.home.start_button");

  return (
    <li className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">
            {item.title}
          </p>
          <p className="text-xs text-slate-500">
            {t("student.home.assignment_from", { className: item.className })} ·{" "}
            {t("student.home.problem_count", { count: item.totalProblems })}
          </p>
          <p className="text-xs text-slate-500">
            {statusLabel} · {dueLabel}
          </p>
          {item.totalProblems > 0 && (item.status !== "NOT_STARTED") ? (
            <p className="text-xs text-slate-500">
              {t("student.home.progress_line", {
                attempted: item.attempted,
                total: item.totalProblems,
                correct: item.correct
              })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-1 min-w-[140px]">
          <button
            type="button"
            className="btn-primary"
            disabled={isLaunching}
            onClick={() => onStart(item.assignmentId)}
          >
            {ctaLabel}
          </button>
          {item.snapshotId ? (
            <Link
              className="text-xs text-center text-[var(--accent)] underline"
              href={`/reports/${item.snapshotId}`}
            >
              {t("student.home.open_report")}
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ResourceAssignmentGroup({
  heading,
  tone,
  items
}: {
  heading: string;
  tone: "red" | "blue" | "green";
  items: ResourceAssignmentRow[];
}) {
  const toneBar =
    tone === "red"
      ? "bg-red-500"
      : tone === "green"
        ? "bg-emerald-500"
        : "bg-[var(--accent)]";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${toneBar}`} aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          {heading}
        </h3>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <ResourceAssignmentRowCard key={item.assignmentId} item={item} />
        ))}
      </ul>
    </div>
  );
}

function ResourceAssignmentRowCard({
  item
}: {
  item: ResourceAssignmentRow;
}) {
  const { t } = useT();
  const utils = trpc.useContext();
  const [answerText, setAnswerText] = useState(
    item.submission?.answerText ?? ""
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const dueLabel = useMemo(() => formatDueLabel(item.dueAt, t), [item.dueAt, t]);
  const due =
    typeof item.dueAt === "string"
      ? new Date(item.dueAt)
      : item.dueAt;
  const isPastDue =
    due != null && due.getTime() < Date.now() && !item.allowLateSubmissions;
  const canSubmit =
    !isPastDue && item.status !== "OVERDUE" && item.status !== "GRADED";

  const submitMutation = trpc.student.resourceAssignments.submit.useMutation({
    onSuccess: () => {
      setLocalError(null);
      utils.student.assignments.invalidate();
      utils.student.overview.invalidate();
    },
    onError: (err) => setLocalError(err.message)
  });

  return (
    <li className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="text-xs text-slate-500">
            {t("student.home.assignment_from", { className: item.className })} ·{" "}
            PDF
          </p>
          <p className="text-xs text-slate-500">
            {translateResourceStudentStatus(item.status)} · {dueLabel}
            {item.allowLateSubmissions ? " · late allowed" : ""}
          </p>
          {formatResourceScope(item) ? (
            <p className="text-xs font-medium text-slate-600">
              Selected: {formatResourceScope(item)}
            </p>
          ) : null}
          {item.instructions ? (
            <p className="whitespace-pre-wrap pt-1 text-sm text-slate-700">
              {item.instructions}
            </p>
          ) : null}
          {item.studentPrompt ? (
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assignment prompt
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {item.studentPrompt}
              </p>
            </div>
          ) : null}
        </div>
        <a
          href={item.resourceDownloadUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >
          Open PDF
        </a>
      </div>

      {item.submission ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Submitted {formatDate(item.submission.submittedAt)}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {item.submission.answerText || "File submission"}
          </p>
          {item.submission.attachmentFilename ? (
            <a
              className="mt-2 inline-flex text-xs font-semibold text-[var(--accent)] underline"
              href={`/api/resource-submissions/${item.submission.id}/attachment`}
              target="_blank"
              rel="noreferrer"
            >
              {item.submission.attachmentFilename}
              {item.submission.attachmentSize
                ? ` · ${Math.ceil(item.submission.attachmentSize / 1024)} KB`
                : ""}
            </a>
          ) : null}
          {item.submission.gradedAt ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">
                Grade: {item.submission.gradeScore} / {item.submission.gradeMax}
              </p>
              {item.submission.feedback ? (
                <p className="mt-1 whitespace-pre-wrap">
                  {item.submission.feedback}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {canSubmit ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!answerText.trim() && !attachmentFile) {
              setLocalError("Enter your answer or attach a file before submitting.");
              return;
            }
            let attachment:
              | { filename: string; mimeType: string; base64: string }
              | undefined;
            if (attachmentFile) {
              if (attachmentFile.size > 8 * 1024 * 1024) {
                setLocalError("Attachment must be 8 MB or smaller.");
                return;
              }
              if (
                ![
                  "application/pdf",
                  "image/jpeg",
                  "image/png",
                  "image/webp"
                ].includes(attachmentFile.type)
              ) {
                setLocalError("Attach a PDF, JPG, PNG, or WebP file.");
                return;
              }
              attachment = {
                filename: attachmentFile.name,
                mimeType: attachmentFile.type,
                base64: await readFileAsBase64(attachmentFile)
              };
            }
            submitMutation.mutate({
              assignmentId: item.assignmentId,
              answerText,
              attachment
            });
          }}
        >
          <label className="space-y-2 text-sm text-slate-700">
            <span>Your answer</span>
            <textarea
              className="input-field min-h-28"
              value={answerText}
              onChange={(event) => setAnswerText(event.target.value)}
              placeholder="Paste your written solution or final answers here."
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700">
            <span>Attach work (optional)</span>
            <input
              className="input-field"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                setAttachmentFile(event.target.files?.[0] ?? null);
                setLocalError(null);
              }}
            />
          </label>
          {attachmentFile ? (
            <p className="text-xs text-slate-500">
              Selected: {attachmentFile.name} ·{" "}
              {Math.ceil(attachmentFile.size / 1024)} KB
            </p>
          ) : null}
          <button
            type="submit"
            className="btn-primary"
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending
              ? t("common.loading")
              : item.submission
                ? "Update submission"
                : "Submit answers"}
          </button>
          {localError ? (
            <p className="text-sm text-red-600">{localError}</p>
          ) : null}
        </form>
      ) : item.status === "OVERDUE" || isPastDue ? (
        <p className="mt-3 text-sm text-red-600">
          This assignment is past due and late submissions are closed.
        </p>
      ) : null}
    </li>
  );
}

function JoinClassForm({ onJoined }: { onJoined: () => void }) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const joinMutation = trpc.student.joinClass.useMutation({
    onSuccess: (res) => {
      setFlash({
        kind: "ok",
        text: res.alreadyEnrolled
          ? t("student.join.already_enrolled", { className: res.className })
          : t("student.join.success", { className: res.className })
      });
      setCode("");
      onJoined();
    },
    onError: (err) => {
      // Map a couple of common messages back to localized copy.
      const msg = err.message ?? "";
      let text = err.message;
      if (err.data?.code === "NOT_FOUND") text = t("student.join.not_found");
      else if (msg.includes("already in another school"))
        text = t("student.join.cross_org");
      else if (msg.includes("seat limit")) text = t("student.join.seat_full");
      setFlash({ kind: "err", text });
    }
  });

  return (
    <section className="surface-card space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("student.join.title")}
        </h2>
        <p className="text-xs text-slate-500">{t("student.join.subtitle")}</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = code.trim();
          if (!trimmed) return;
          setFlash(null);
          joinMutation.mutate({ joinCode: trimmed });
        }}
      >
        <label className="space-y-1 text-xs text-slate-600">
          <span>{t("student.join.code_label")}</span>
          <input
            className="input-field font-mono uppercase tracking-[0.3em]"
            value={code}
            maxLength={12}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn-primary"
          disabled={joinMutation.isPending || code.trim().length === 0}
        >
          {t("student.join.submit")}
        </button>
      </form>
      {flash ? (
        <p
          className={
            flash.kind === "ok"
              ? "text-sm text-emerald-700"
              : "text-sm text-red-600"
          }
        >
          {flash.text}
        </p>
      ) : null}
    </section>
  );
}

function CountCard({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: number | undefined;
  tone?: "neutral" | "red" | "blue" | "green";
}) {
  const accent =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-emerald-600"
        : tone === "blue"
          ? "text-[var(--accent)]"
          : "text-slate-900";
  return (
    <div className="surface-card">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${accent}`}>
        {typeof value === "number" ? value : "—"}
      </p>
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function formatDueLabel(
  dueAt: string | Date | null,
  t: ReturnType<typeof useT>["t"]
): string {
  if (!dueAt) return t("student.home.no_due");
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (diffMs < 0) return t("student.home.overdue");
  if (diffMs < oneDayMs) return t("student.home.due_today");
  if (diffMs < 2 * oneDayMs) return t("student.home.due_tomorrow");
  const days = Math.ceil(diffMs / oneDayMs);
  return t("student.home.due_in", { days });
}

function translateResourceStudentStatus(
  status: "GRADED" | "SUBMITTED" | "OVERDUE" | "NOT_SUBMITTED"
): string {
  switch (status) {
    case "GRADED":
      return "Graded";
    case "SUBMITTED":
      return "Submitted";
    case "OVERDUE":
      return "Overdue";
    case "NOT_SUBMITTED":
      return "Not submitted";
  }
}

function formatResourceScope(scope: {
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  sourceProblemStart: string | null;
  sourceProblemEnd: string | null;
}): string | null {
  const pageLabel =
    scope.sourcePageStart != null && scope.sourcePageEnd != null
      ? scope.sourcePageStart === scope.sourcePageEnd
        ? `page ${scope.sourcePageStart}`
        : `pages ${scope.sourcePageStart}-${scope.sourcePageEnd}`
      : scope.sourcePageStart != null
        ? `page ${scope.sourcePageStart}`
        : null;
  const problemLabel =
    scope.sourceProblemStart && scope.sourceProblemEnd
      ? scope.sourceProblemStart === scope.sourceProblemEnd
        ? `problem ${scope.sourceProblemStart}`
        : `problems ${scope.sourceProblemStart}-${scope.sourceProblemEnd}`
      : scope.sourceProblemStart
        ? `problem ${scope.sourceProblemStart}`
        : null;
  const parts = [pageLabel, problemLabel].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
