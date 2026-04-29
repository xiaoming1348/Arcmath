"use client";

import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc/client";
import { translator } from "@/i18n/client";
import type { Locale, Messages } from "@/i18n/dictionary";
import type { AppRouter } from "@/lib/trpc/router";
import { parseEmails } from "@/app/teacher/invite-teachers-form";

type Tab = "students" | "assignments";

// Infer shapes directly from the router output so we don't fight
// the client-side date-is-string serialization.
type TeacherRouterOutputs = inferRouterOutputs<AppRouter>["teacher"];
type ClassDetailData = TeacherRouterOutputs["classes"]["get"];
type Student = ClassDetailData["students"][number];
type Assignment = ClassDetailData["assignments"][number];

/**
 * Class detail — roster, invites, assignments, progress.
 *
 * The whole thing is client-side because every subsection mutates and
 * wants to invalidate the same `teacher.classes.get` cache. Wrapping in
 * one component (instead of four page-level ones) keeps invalidation
 * simple: any mutation calls `utils.teacher.classes.get.invalidate({classId})`.
 */
export function ClassDetail({
  classId,
  locale
}: {
  classId: string;
  locale: Locale;
}) {
  const t = translator(locale);
  const [activeTab, setActiveTab] = useState<Tab>("students");
  const [progressDrawerAssignmentId, setProgressDrawerAssignmentId] =
    useState<string | null>(null);

  const classQuery = trpc.teacher.classes.get.useQuery({ classId });

  if (classQuery.isLoading) {
    return (
      <section className="surface-card">
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      </section>
    );
  }
  if (classQuery.error) {
    return (
      <section className="surface-card">
        <p className="text-sm text-red-600">{classQuery.error.message}</p>
      </section>
    );
  }
  const klass = classQuery.data;
  if (!klass) return null;

  return (
    <>
      <ClassHeader classId={classId} klass={klass} locale={locale} />

      <section className="surface-card space-y-4">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          <TabButton
            label={`${t("teacher.class.title_tab_students")} (${klass.students.length})`}
            active={activeTab === "students"}
            onClick={() => setActiveTab("students")}
          />
          <TabButton
            label={`${t("teacher.class.title_tab_assignments")} (${klass.assignments.length})`}
            active={activeTab === "assignments"}
            onClick={() => setActiveTab("assignments")}
          />
        </div>

        {activeTab === "students" ? (
          <StudentsTab
            classId={classId}
            students={klass.students}
            locale={locale}
          />
        ) : (
          <AssignmentsTab
            classId={classId}
            assignments={klass.assignments}
            locale={locale}
            onOpenProgress={(id) => setProgressDrawerAssignmentId(id)}
          />
        )}
      </section>

      {progressDrawerAssignmentId ? (
        <ProgressDrawer
          assignmentId={progressDrawerAssignmentId}
          locale={locale}
          onClose={() => setProgressDrawerAssignmentId(null)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- header

function ClassHeader({
  classId,
  klass,
  locale
}: {
  classId: string;
  klass: ClassDetailData;
  locale: Locale;
}) {
  const t = translator(locale);
  const [copied, setCopied] = useState(false);
  const utils = trpc.useContext();

  const regenerate = trpc.teacher.classes.update.useMutation({
    onSuccess: () => {
      utils.teacher.classes.get.invalidate({ classId });
      utils.teacher.classes.list.invalidate();
    }
  });

  async function copyJoinCode() {
    if (!klass.joinCode) return;
    try {
      await navigator.clipboard.writeText(klass.joinCode);
      setCopied(true);
      // Auto-reset so the button doesn't get stuck on "Copied!" forever.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Browsers without clipboard API — fall back to selecting the span
      // so the user can Ctrl-C manually. Best-effort only.
      setCopied(false);
    }
  }

  return (
    <section className="surface-card space-y-3">
      <h1 className="text-2xl font-semibold text-slate-900">{klass.name}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {t("teacher.classes.join_code_label")}
          </p>
          <p className="font-mono text-xl tracking-[0.35em] text-slate-900">
            {klass.joinCode ?? "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={copyJoinCode}
          className="btn-secondary"
          aria-live="polite"
        >
          {copied
            ? t("teacher.class.copy_join_code_done")
            : t("teacher.class.copy_join_code")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (!window.confirm(t("teacher.class.regenerate_join_code_confirm"))) {
              return;
            }
            regenerate.mutate({ classId, regenerateJoinCode: true });
          }}
          disabled={regenerate.isPending}
        >
          {regenerate.isPending
            ? t("common.loading")
            : t("teacher.class.regenerate_join_code")}
        </button>
      </div>
      <p className="text-xs text-slate-500">{t("teacher.class.join_code_hint")}</p>
    </section>
  );
}

function TabButton({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white"
          : "rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-600 hover:border-[var(--accent)]"
      }
    >
      {label}
    </button>
  );
}

// -------------------------------------------------------------- students

function StudentsTab({
  classId,
  students,
  locale
}: {
  classId: string;
  students: Student[];
  locale: Locale;
}) {
  const t = translator(locale);
  const utils = trpc.useContext();
  const [raw, setRaw] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const inviteMutation = trpc.teacher.classes.inviteStudents.useMutation({
    onSuccess: () => {
      setRaw("");
      utils.teacher.classes.get.invalidate({ classId });
      utils.teacher.overview.invalidate();
    },
    onError: (err) => setInviteError(err.message)
  });

  const removeMutation = trpc.teacher.classes.removeStudent.useMutation({
    onSuccess: () => {
      utils.teacher.classes.get.invalidate({ classId });
    }
  });

  const seats = inviteMutation.data?.seats ?? null;
  const results = inviteMutation.data?.results ?? null;

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const emails = parseEmails(raw);
          if (emails.length === 0) {
            setInviteError("No valid emails.");
            return;
          }
          setInviteError(null);
          inviteMutation.mutate({
            classId,
            students: emails.map((email) => ({ email }))
          });
        }}
      >
        <label className="space-y-2 text-sm text-slate-700">
          <span>{t("teacher.class.invite_paste_label")}</span>
          <textarea
            className="input-field min-h-24"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={"student1@school.edu\nstudent2@school.edu"}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="btn-primary"
            disabled={inviteMutation.isPending}
          >
            {inviteMutation.isPending
              ? t("common.loading")
              : t("teacher.class.invite_submit")}
          </button>
          {seats ? (
            <span className="text-xs text-slate-600">
              {t("teacher.class.invite_seats_remaining", {
                remaining: Math.max(0, seats.max - seats.used),
                max: seats.max
              })}
            </span>
          ) : null}
        </div>
        {inviteError ? (
          <p className="text-sm text-red-600">{inviteError}</p>
        ) : null}
      </form>

      {results && results.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {results.map((row) => (
            <li
              key={row.email}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="font-mono text-slate-700">{row.email}</span>
              <span
                className={
                  row.status === "ADDED"
                    ? "text-xs font-semibold text-emerald-700"
                    : "text-xs font-semibold text-slate-500"
                }
              >
                {translateInviteResult(t, row.status)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2">
        {students.length === 0 ? (
          <p className="text-sm text-slate-600">
            {t("teacher.class.no_students")}
          </p>
        ) : (
          <ul className="space-y-2">
            {students.map((student) => (
              <li
                key={student.enrollmentId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {student.name ?? student.email}
                  </p>
                  {student.name ? (
                    <p className="text-xs text-slate-500">{student.email}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (
                      !window.confirm(t("teacher.class.confirm_remove_student"))
                    ) {
                      return;
                    }
                    removeMutation.mutate({
                      classId,
                      enrollmentId: student.enrollmentId
                    });
                  }}
                  disabled={removeMutation.isPending}
                >
                  {t("teacher.class.remove_student")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function translateInviteResult(
  t: (key: keyof Messages) => string,
  status: "ADDED" | "ALREADY_IN_CLASS" | "SEAT_FULL" | "EMAIL_IN_OTHER_ORG"
): string {
  switch (status) {
    case "ADDED":
      return t("teacher.invite_result.added");
    case "ALREADY_IN_CLASS":
      return t("teacher.invite_result.already_in_class");
    case "SEAT_FULL":
      return t("teacher.invite_result.seat_full");
    case "EMAIL_IN_OTHER_ORG":
      return t("teacher.invite_result.email_in_other_org");
  }
}

// ----------------------------------------------------------- assignments

function AssignmentsTab({
  classId,
  assignments,
  locale,
  onOpenProgress
}: {
  classId: string;
  assignments: Assignment[];
  locale: Locale;
  onOpenProgress: (assignmentId: string) => void;
}) {
  const t = translator(locale);
  const utils = trpc.useContext();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [setId, setSetId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [hintTutorEnabled, setHintTutorEnabled] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const libraryQuery = trpc.teacher.assignableProblemSets.useQuery(undefined, {
    enabled: pickerOpen
  });

  const createMutation = trpc.teacher.assignments.create.useMutation({
    onSuccess: () => {
      setPickerOpen(false);
      setSetId("");
      setDueAt("");
      setCustomTitle("");
      setInstructions("");
      setHintTutorEnabled(false);
      setFormError(null);
      utils.teacher.classes.get.invalidate({ classId });
      utils.teacher.overview.invalidate();
    },
    onError: (err) => setFormError(err.message)
  });

  const deleteMutation = trpc.teacher.assignments.delete.useMutation({
    onSuccess: () => {
      utils.teacher.classes.get.invalidate({ classId });
      utils.teacher.overview.invalidate();
    }
  });

  const sortedLibrary = useMemo(() => {
    const rows = libraryQuery.data ?? [];
    // Teacher's own sets first (they most often want to assign their own
    // uploaded homework), then PUBLIC sets, both already ordered by
    // contest/year on the server.
    return [...rows].sort((a, b) => {
      if (a.isOwnedByMyOrg !== b.isOwnedByMyOrg) {
        return a.isOwnedByMyOrg ? -1 : 1;
      }
      return 0;
    });
  }, [libraryQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => setPickerOpen((prev) => !prev)}
        >
          {pickerOpen
            ? t("common.cancel")
            : t("teacher.class.assign_button")}
        </button>
      </div>

      {pickerOpen ? (
        <form
          className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!setId) {
              setFormError(t("teacher.class.assign_choose_set"));
              return;
            }
            let parsedDue: Date | undefined;
            if (dueAt) {
              const d = new Date(dueAt);
              if (Number.isNaN(d.getTime())) {
                setFormError("Invalid due date");
                return;
              }
              parsedDue = d;
            }
            createMutation.mutate({
              classId,
              problemSetId: setId,
              title: customTitle.trim() || undefined,
              instructions: instructions.trim() || undefined,
              dueAt: parsedDue,
              hintTutorEnabled
            });
          }}
        >
          <label className="space-y-2 text-sm text-slate-700">
            <span>{t("teacher.class.assign_choose_set")}</span>
            <select
              className="input-field"
              value={setId}
              onChange={(event) => setSetId(event.target.value)}
            >
              <option value="">—</option>
              {libraryQuery.isLoading ? (
                <option disabled>{t("common.loading")}</option>
              ) : null}
              {sortedLibrary.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.isOwnedByMyOrg ? "★ " : ""}
                  {set.title} · {set.problemCount}q
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-700">
            <span>Title override (optional)</span>
            <input
              className="input-field"
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
              placeholder="Leave blank to use the set title"
              maxLength={200}
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700">
            <span>Instructions (optional)</span>
            <textarea
              className="input-field min-h-24"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Anything the students should know before they start."
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700 md:max-w-sm">
            <span>{t("teacher.class.assign_due_at_label")}</span>
            <input
              type="datetime-local"
              className="input-field"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
          {/* Per-assignment hint-tutor toggle. When checked, the
              student's attempt UI surfaces the AI hint panel and each
              hint request is logged to ProblemHintUsage so the report
              page can show counts. Off by default: a teacher must opt
              in to grant hints. */}
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hintTutorEnabled}
              onChange={(event) => setHintTutorEnabled(event.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="font-medium">{t("teacher.class.assign_hint_tutor_label")}</span>
              <span className="block text-xs text-slate-500">
                {t("teacher.class.assign_hint_tutor_help")}
              </span>
            </span>
          </label>
          {formError ? (
            <p className="text-sm text-red-600">{formError}</p>
          ) : null}
          <button
            type="submit"
            className="btn-primary"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending
              ? t("common.loading")
              : t("teacher.class.assign_submit")}
          </button>
        </form>
      ) : null}

      {assignments.length === 0 ? (
        <p className="text-sm text-slate-600">
          {t("teacher.class.no_assignments")}
        </p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((assignment) => (
            <li
              key={assignment.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">
                    {assignment.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {assignment.problemSetTitle} · {assignment.problemCount}q
                  </p>
                  {assignment.dueAt ? (
                    <p className="text-xs text-slate-500">
                      Due {formatDate(assignment.dueAt)}
                    </p>
                  ) : null}
                  {assignment.instructions ? (
                    <p className="whitespace-pre-wrap pt-2 text-sm text-slate-700">
                      {assignment.instructions}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onOpenProgress(assignment.id)}
                  >
                    {t("teacher.class.view_progress")}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Remove this assignment? Student attempts are kept."
                        )
                      ) {
                        return;
                      }
                      deleteMutation.mutate({
                        assignmentId: assignment.id
                      });
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------------------------- progress drawer

function ProgressDrawer({
  assignmentId,
  locale,
  onClose
}: {
  assignmentId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const t = translator(locale);
  const query = trpc.teacher.assignments.progress.useQuery({ assignmentId });

  return (
    <section className="surface-card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("teacher.class.progress_title")}
        </h2>
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t("teacher.class.progress_close")}
        </button>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      ) : query.error ? (
        <p className="text-sm text-red-600">{query.error.message}</p>
      ) : query.data ? (
        <>
          <p className="text-sm text-slate-700">
            {query.data.title} · {query.data.totalProblems}q
            {query.data.dueAt ? ` · due ${formatDate(query.data.dueAt)}` : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">
                    {t("teacher.class.progress_column_student")}
                  </th>
                  <th className="px-2 py-2">
                    {t("teacher.class.progress_column_status")}
                  </th>
                  <th className="px-2 py-2">
                    {t("teacher.class.progress_column_progress")}
                  </th>
                  <th className="px-2 py-2">
                    {t("teacher.class.progress_column_correct")}
                  </th>
                  <th className="px-2 py-2">
                    {t("teacher.class.progress_column_submitted")}
                  </th>
                  {query.data.hintTutorEnabled ? (
                    <th className="px-2 py-2">
                      {t("teacher.class.progress_column_hints")}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {query.data.students.map((row) => (
                  <tr
                    key={row.userId}
                    className="border-t border-slate-200 align-top"
                  >
                    <td className="px-2 py-2">
                      <p className="font-semibold text-slate-900">
                        {row.name ?? row.email}
                      </p>
                      {row.name ? (
                        <p className="text-xs text-slate-500">{row.email}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {translateStatus(t, row.status)}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {row.attempted} / {query.data!.totalProblems}
                    </td>
                    <td className="px-2 py-2 text-xs">{row.correct}</td>
                    <td className="px-2 py-2 text-xs">
                      {row.completedAt ? formatDate(row.completedAt) : "—"}
                    </td>
                    {query.data.hintTutorEnabled ? (
                      <td className="px-2 py-2 text-xs">{row.hintsUsed}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

function translateStatus(
  t: (key: keyof Messages) => string,
  status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED"
): string {
  switch (status) {
    case "COMPLETED":
      return t("teacher.class.status_completed");
    case "IN_PROGRESS":
      return t("teacher.class.status_in_progress");
    case "NOT_STARTED":
      return t("teacher.class.status_not_started");
  }
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
