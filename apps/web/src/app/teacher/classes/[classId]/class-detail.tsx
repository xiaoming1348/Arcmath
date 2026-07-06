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
type ResourceAssignment = ClassDetailData["resourceAssignments"][number];
type ResourceProgressRow =
  TeacherRouterOutputs["resourceAssignments"]["progress"]["students"][number];
type GradebookSummary = TeacherRouterOutputs["gradebook"]["summary"];
type GradebookRow = GradebookSummary["rows"][number];
type GradebookAssignmentType = "ALL" | "PROBLEM_SET" | "PDF";
type GradebookStatusFilter =
  | "ALL"
  | "NEEDS_GRADING"
  | "DUE_SOON"
  | "OVERDUE"
  | "SUBMITTED"
  | "GRADED"
  | "COMPLETED"
  | "IN_PROGRESS"
  | "NOT_STARTED"
  | "NOT_SUBMITTED";

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
  const [
    resourceProgressDrawerAssignmentId,
    setResourceProgressDrawerAssignmentId
  ] = useState<string | null>(null);

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
            label={`${t("teacher.class.title_tab_assignments")} (${klass.assignments.length + klass.resourceAssignments.length})`}
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
            resourceAssignments={klass.resourceAssignments}
            locale={locale}
            onOpenProgress={(id) => setProgressDrawerAssignmentId(id)}
            onOpenResourceProgress={(id) =>
              setResourceProgressDrawerAssignmentId(id)
            }
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
      {resourceProgressDrawerAssignmentId ? (
        <ResourceProgressDrawer
          assignmentId={resourceProgressDrawerAssignmentId}
          locale={locale}
          onClose={() => setResourceProgressDrawerAssignmentId(null)}
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

  // Join codes are gone under the roster-creation product policy:
  // students are auto-enrolled when the admin creates the class with
  // their name in the roster. We just show the class title now.
  // Older classes that still have a `joinCode` value in the DB don't
  // surface it — students no longer have a "join via code" path.
  // `copied`, `regenerate`, and `copyJoinCode` are referenced below
  // only via the unused-binding swallow; keep them defined so the
  // existing closures don't break, but the UI doesn't expose them.
  void copied;
  void regenerate;
  void copyJoinCode;
  return (
    <section className="surface-card space-y-3">
      <h1 className="text-2xl font-semibold text-slate-900">{klass.name}</h1>
      <p className="text-xs text-slate-500">
        {t("teacher.class.roster_managed_by_admin")}
      </p>
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
  resourceAssignments,
  locale,
  onOpenProgress,
  onOpenResourceProgress
}: {
  classId: string;
  assignments: Assignment[];
  resourceAssignments: ResourceAssignment[];
  locale: Locale;
  onOpenProgress: (assignmentId: string) => void;
  onOpenResourceProgress: (assignmentId: string) => void;
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
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceInstructions, setResourceInstructions] = useState("");
  const [sourcePageStart, setSourcePageStart] = useState("");
  const [sourcePageEnd, setSourcePageEnd] = useState("");
  const [sourceProblemStart, setSourceProblemStart] = useState("");
  const [sourceProblemEnd, setSourceProblemEnd] = useState("");
  const [sourceExcerpt, setSourceExcerpt] = useState("");
  const [studentPrompt, setStudentPrompt] = useState("");
  const [gradingGuidance, setGradingGuidance] = useState("");
  const [resourceDueAt, setResourceDueAt] = useState("");
  const [allowLateSubmissions, setAllowLateSubmissions] = useState(false);
  const [resourceFormError, setResourceFormError] = useState<string | null>(
    null
  );
  const [extractNotice, setExtractNotice] = useState<string | null>(null);
  const [structuredJsonText, setStructuredJsonText] = useState("");
  const [structuredDraftNotice, setStructuredDraftNotice] = useState<
    string | null
  >(null);
  const [gradebookType, setGradebookType] =
    useState<GradebookAssignmentType>("ALL");
  const [gradebookStatus, setGradebookStatus] =
    useState<GradebookStatusFilter>("ALL");
  const [gradebookSearch, setGradebookSearch] = useState("");

  const libraryQuery = trpc.teacher.assignableProblemSets.useQuery(undefined, {
    enabled: pickerOpen
  });
  const resourcesQuery = trpc.teacher.assignableResources.useQuery(undefined, {
    enabled: resourcePickerOpen
  });
  const gradebookQuery = trpc.teacher.gradebook.summary.useQuery({
    classId,
    assignmentType: gradebookType,
    status: gradebookStatus,
    search: gradebookSearch.trim() || undefined
  });

  const structuredPreviewMutation = trpc.teacher.uploadPreview.useMutation({
    onError: (err) => setResourceFormError(err.message)
  });
  const structuredCommitMutation = trpc.teacher.uploadCommit.useMutation({
    onSuccess: () => {
      setResourceFormError(null);
      utils.teacher.classes.get.invalidate({ classId });
      utils.teacher.overview.invalidate();
      utils.teacher.gradebook.summary.invalidate();
    },
    onError: (err) => setResourceFormError(err.message)
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
      utils.teacher.gradebook.summary.invalidate();
    },
    onError: (err) => setFormError(err.message)
  });
  const createResourceMutation =
    trpc.teacher.resourceAssignments.create.useMutation({
      onSuccess: () => {
        setResourcePickerOpen(false);
        setResourceId("");
        setResourceTitle("");
        setResourceInstructions("");
        setSourcePageStart("");
        setSourcePageEnd("");
        setSourceProblemStart("");
        setSourceProblemEnd("");
        setSourceExcerpt("");
        setStudentPrompt("");
        setGradingGuidance("");
        setResourceDueAt("");
        setAllowLateSubmissions(false);
        setResourceFormError(null);
        setExtractNotice(null);
        setStructuredJsonText("");
        setStructuredDraftNotice(null);
        structuredPreviewMutation.reset();
        structuredCommitMutation.reset();
        utils.teacher.classes.get.invalidate({ classId });
        utils.teacher.overview.invalidate();
        utils.teacher.gradebook.summary.invalidate();
      },
      onError: (err) => setResourceFormError(err.message)
    });

  const deleteMutation = trpc.teacher.assignments.delete.useMutation({
    onSuccess: () => {
      utils.teacher.classes.get.invalidate({ classId });
      utils.teacher.overview.invalidate();
      utils.teacher.gradebook.summary.invalidate();
    }
  });
  const deleteResourceMutation =
    trpc.teacher.resourceAssignments.delete.useMutation({
      onSuccess: () => {
        utils.teacher.classes.get.invalidate({ classId });
        utils.teacher.overview.invalidate();
        utils.teacher.gradebook.summary.invalidate();
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
  const assignableResources = resourcesQuery.data ?? [];
  const selectedResource = assignableResources.find(
    (resource) => resource.id === resourceId
  );

  const draftResourceMutation =
    trpc.teacher.resourceAssignments.draft.useMutation({
      onSuccess: (draft) => {
        setResourceFormError(null);
        setResourceTitle((prev) => prev.trim() || draft.title);
        setStudentPrompt(draft.studentPrompt);
        setGradingGuidance(draft.gradingGuidance);
      },
      onError: (err) => setResourceFormError(err.message)
    });
  const draftProblemSetMutation =
    trpc.teacher.resourceAssignments.problemSetDraft.useMutation({
      onSuccess: (draft) => {
        setResourceFormError(null);
        setStructuredJsonText(draft.jsonText);
        setStructuredDraftNotice(
          [
            `Drafted ${draft.problemCount} problem${draft.problemCount === 1 ? "" : "s"} from the selected text.`,
            ...draft.warnings
          ].join("\n")
        );
        structuredPreviewMutation.reset();
        structuredCommitMutation.reset();
      },
      onError: (err) => setResourceFormError(err.message)
    });
  const extractResourceMutation =
    trpc.teacher.resourceAssignments.extractSelection.useMutation({
      onSuccess: (result) => {
        setResourceFormError(null);
        setSourceExcerpt(result.text);
        setExtractNotice(
          result.extractionMethod === "ocr"
            ? [
                `No selectable PDF text was found; OCR extracted ${result.confidence}-confidence text from the selected pages.`,
                ...result.notes
              ].join("\n")
            : "Extracted selectable text from the selected PDF pages."
        );
      },
      onError: (err) => setResourceFormError(err.message)
    });
  const structuredPreview = structuredPreviewMutation.data ?? null;
  const structuredCommit = structuredCommitMutation.data ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => setPickerOpen((prev) => !prev)}
        >
          {pickerOpen
            ? t("common.cancel")
            : t("teacher.class.assign_button")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setResourcePickerOpen((prev) => !prev)}
        >
          {resourcePickerOpen ? t("common.cancel") : "Assign PDF"}
        </button>
        <a
          className="btn-secondary"
          href={`/api/teacher/classes/${classId}/gradebook`}
        >
          Export gradebook
        </a>
      </div>

      <GradebookPanel
        data={gradebookQuery.data}
        isLoading={gradebookQuery.isLoading}
        error={gradebookQuery.error?.message ?? null}
        assignmentType={gradebookType}
        status={gradebookStatus}
        search={gradebookSearch}
        onAssignmentTypeChange={setGradebookType}
        onStatusChange={setGradebookStatus}
        onSearchChange={setGradebookSearch}
      />

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

      {resourcePickerOpen ? (
        <form
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!resourceId) {
              setResourceFormError("Choose a PDF resource.");
              return;
            }
            const parsedPageStart = sourcePageStart.trim()
              ? Number(sourcePageStart)
              : undefined;
            const parsedPageEnd = sourcePageEnd.trim()
              ? Number(sourcePageEnd)
              : parsedPageStart;
            if (
              (parsedPageStart != null &&
                (!Number.isInteger(parsedPageStart) || parsedPageStart <= 0)) ||
              (parsedPageEnd != null &&
                (!Number.isInteger(parsedPageEnd) || parsedPageEnd <= 0))
            ) {
              setResourceFormError("Enter valid positive page numbers.");
              return;
            }
            if (
              parsedPageStart != null &&
              parsedPageEnd != null &&
              parsedPageEnd < parsedPageStart
            ) {
              setResourceFormError("End page must be after start page.");
              return;
            }
            let parsedDue: Date | undefined;
            if (resourceDueAt) {
              const d = new Date(resourceDueAt);
              if (Number.isNaN(d.getTime())) {
                setResourceFormError("Invalid due date");
                return;
              }
              parsedDue = d;
            }
            createResourceMutation.mutate({
              classId,
              resourceId,
              title: resourceTitle.trim() || undefined,
              instructions: resourceInstructions.trim() || undefined,
              sourcePageStart: parsedPageStart,
              sourcePageEnd: parsedPageEnd,
              sourceProblemStart: sourceProblemStart.trim() || undefined,
              sourceProblemEnd: sourceProblemEnd.trim() || undefined,
              sourceExcerpt: sourceExcerpt.trim() || undefined,
              studentPrompt: studentPrompt.trim() || undefined,
              gradingGuidance: gradingGuidance.trim() || undefined,
              dueAt: parsedDue,
              allowLateSubmissions
            });
          }}
        >
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              PDF / manual-grading assignment
            </h3>
            <p className="text-xs text-slate-500">
              Use this for worksheets or lesson PDFs. Students submit written
              answers here; you grade them manually.
            </p>
          </div>
          <label className="space-y-2 text-sm text-slate-700">
            <span>Choose PDF resource</span>
            <select
              className="input-field"
              value={resourceId}
              onChange={(event) => {
                setResourceId(event.target.value);
                setResourceTitle("");
                setStudentPrompt("");
                setGradingGuidance("");
                setSourceExcerpt("");
                setExtractNotice(null);
                setStructuredJsonText("");
                setStructuredDraftNotice(null);
                structuredPreviewMutation.reset();
                structuredCommitMutation.reset();
              }}
            >
              <option value="">—</option>
              {resourcesQuery.isLoading ? (
                <option disabled>{t("common.loading")}</option>
              ) : null}
              {assignableResources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.title}
                  {resource.filename ? ` · ${resource.filename}` : ""}
                </option>
              ))}
            </select>
          </label>
          {resourcesQuery.isSuccess && assignableResources.length === 0 ? (
            <p className="text-xs text-slate-500">
              Upload a PDF from Resources first.
            </p>
          ) : null}
          {selectedResource ? (
            <a
              className="text-xs font-semibold text-[var(--accent)] underline"
              href={`/api/org-resources/${selectedResource.id}/download`}
              target="_blank"
              rel="noreferrer"
            >
              Open selected PDF
            </a>
          ) : null}
          <label className="space-y-2 text-sm text-slate-700">
            <span>Title override (optional)</span>
            <input
              className="input-field"
              value={resourceTitle}
              onChange={(event) => setResourceTitle(event.target.value)}
              placeholder="Leave blank to use the resource title"
              maxLength={200}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-2 text-sm text-slate-700">
              <span>Start page</span>
              <input
                className="input-field"
                value={sourcePageStart}
                onChange={(event) => setSourcePageStart(event.target.value)}
                inputMode="numeric"
                placeholder="35"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>End page</span>
              <input
                className="input-field"
                value={sourcePageEnd}
                onChange={(event) => setSourcePageEnd(event.target.value)}
                inputMode="numeric"
                placeholder="36"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>First problem</span>
              <input
                className="input-field"
                value={sourceProblemStart}
                onChange={(event) => setSourceProblemStart(event.target.value)}
                placeholder="3"
                maxLength={40}
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Last problem</span>
              <input
                className="input-field"
                value={sourceProblemEnd}
                onChange={(event) => setSourceProblemEnd(event.target.value)}
                placeholder="9"
                maxLength={40}
              />
            </label>
          </div>
          {selectedResource && previewPageNumber(sourcePageStart) ? (
            <div className="grid gap-3 md:grid-cols-2">
              <PdfPagePreview
                resourceId={selectedResource.id}
                page={previewPageNumber(sourcePageStart)!}
                label="Start page preview"
              />
              {previewPageNumber(sourcePageEnd) &&
              previewPageNumber(sourcePageEnd) !==
                previewPageNumber(sourcePageStart) ? (
                <PdfPagePreview
                  resourceId={selectedResource.id}
                  page={previewPageNumber(sourcePageEnd)!}
                  label="End page preview"
                />
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="btn-secondary w-fit"
            disabled={
              !resourceId ||
              !sourcePageStart.trim() ||
              extractResourceMutation.isPending
            }
            onClick={() => {
              const parsedPageStart = sourcePageStart.trim()
                ? Number(sourcePageStart)
                : undefined;
              const parsedPageEnd = sourcePageEnd.trim()
                ? Number(sourcePageEnd)
                : parsedPageStart;
              if (
                parsedPageStart == null ||
                parsedPageEnd == null ||
                !Number.isInteger(parsedPageStart) ||
                !Number.isInteger(parsedPageEnd) ||
                parsedPageStart <= 0 ||
                parsedPageEnd <= 0
              ) {
                setResourceFormError("Enter valid positive page numbers.");
                return;
              }
              if (parsedPageEnd < parsedPageStart) {
                setResourceFormError("End page must be after start page.");
                return;
              }
              setResourceFormError(null);
              setExtractNotice(null);
              setStructuredJsonText("");
              setStructuredDraftNotice(null);
              structuredPreviewMutation.reset();
              structuredCommitMutation.reset();
              extractResourceMutation.mutate({
                resourceId,
                sourcePageStart: parsedPageStart,
                sourcePageEnd: parsedPageEnd,
                language: locale === "zh" ? "zh" : "en"
              });
            }}
          >
            {extractResourceMutation.isPending
              ? t("common.loading")
              : "Extract pages from PDF"}
          </button>
          {extractNotice ? (
            <div className="whitespace-pre-wrap rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">
              {extractNotice}
            </div>
          ) : null}
          <label className="space-y-2 text-sm text-slate-700">
            <span>Instructions (optional)</span>
            <textarea
              className="input-field min-h-24"
              value={resourceInstructions}
              onChange={(event) => setResourceInstructions(event.target.value)}
              placeholder="Tell students what to solve and how to submit."
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700">
            <span>Selected original text</span>
            <textarea
              className="input-field min-h-36"
              value={sourceExcerpt}
              onChange={(event) => {
                setSourceExcerpt(event.target.value);
                setStructuredJsonText("");
                setStructuredDraftNotice(null);
                structuredPreviewMutation.reset();
                structuredCommitMutation.reset();
              }}
              placeholder="Paste page 35-36, problems 3-9, or the selected text copied from the PDF/book."
            />
          </label>
          <button
            type="button"
            className="btn-secondary w-fit"
            disabled={
              !resourceId ||
              sourceExcerpt.trim().length < 20 ||
              draftResourceMutation.isPending
            }
            onClick={() => {
              const parsedPageStart = sourcePageStart.trim()
                ? Number(sourcePageStart)
                : undefined;
              const parsedPageEnd = sourcePageEnd.trim()
                ? Number(sourcePageEnd)
                : parsedPageStart;
              if (
                (parsedPageStart != null &&
                  (!Number.isInteger(parsedPageStart) ||
                    parsedPageStart <= 0)) ||
                (parsedPageEnd != null &&
                  (!Number.isInteger(parsedPageEnd) || parsedPageEnd <= 0))
              ) {
                setResourceFormError("Enter valid positive page numbers.");
                return;
              }
              if (
                parsedPageStart != null &&
                parsedPageEnd != null &&
                parsedPageEnd < parsedPageStart
              ) {
                setResourceFormError("End page must be after start page.");
                return;
              }
              setResourceFormError(null);
              draftResourceMutation.mutate({
                resourceId,
                language: locale === "zh" ? "zh" : "en",
                teacherInstructions:
                  resourceInstructions.trim() || undefined,
                sourcePageStart: parsedPageStart,
                sourcePageEnd: parsedPageEnd,
                sourceProblemStart:
                  sourceProblemStart.trim() || undefined,
                sourceProblemEnd: sourceProblemEnd.trim() || undefined,
                sourceExcerpt: sourceExcerpt.trim()
              });
            }}
          >
            {draftResourceMutation.isPending
              ? t("common.loading")
              : "Transform selected text"}
          </button>
          <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-900">
                Structured ArcMath problem set
              </h4>
              <p className="text-xs leading-5 text-slate-600">
                Use this when the selected PDF problems should become normal
                ArcMath problems with tutor/grading workflows. The draft does
                not invent answers or solution sketches; preview will block
                commit until those fields are reviewed and added.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary w-fit"
              disabled={
                !resourceId ||
                sourceExcerpt.trim().length < 20 ||
                draftProblemSetMutation.isPending
              }
              onClick={() => {
                const parsedPageStart = sourcePageStart.trim()
                  ? Number(sourcePageStart)
                  : undefined;
                const parsedPageEnd = sourcePageEnd.trim()
                  ? Number(sourcePageEnd)
                  : parsedPageStart;
                if (
                  (parsedPageStart != null &&
                    (!Number.isInteger(parsedPageStart) ||
                      parsedPageStart <= 0)) ||
                  (parsedPageEnd != null &&
                    (!Number.isInteger(parsedPageEnd) || parsedPageEnd <= 0))
                ) {
                  setResourceFormError("Enter valid positive page numbers.");
                  return;
                }
                if (
                  parsedPageStart != null &&
                  parsedPageEnd != null &&
                  parsedPageEnd < parsedPageStart
                ) {
                  setResourceFormError("End page must be after start page.");
                  return;
                }
                setResourceFormError(null);
                setStructuredDraftNotice(null);
                draftProblemSetMutation.mutate({
                  resourceId,
                  language: locale === "zh" ? "zh" : "en",
                  teacherInstructions:
                    resourceInstructions.trim() || undefined,
                  sourcePageStart: parsedPageStart,
                  sourcePageEnd: parsedPageEnd,
                  sourceProblemStart:
                    sourceProblemStart.trim() || undefined,
                  sourceProblemEnd: sourceProblemEnd.trim() || undefined,
                  sourceExcerpt: sourceExcerpt.trim()
                });
              }}
            >
              {draftProblemSetMutation.isPending
                ? t("common.loading")
                : "Draft structured JSON"}
            </button>

            {structuredDraftNotice ? (
              <div className="whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                {structuredDraftNotice}
              </div>
            ) : null}

            {structuredJsonText ? (
              <>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Teacher-v1 JSON draft</span>
                  <textarea
                    className="input-field min-h-72 font-mono text-xs leading-5"
                    value={structuredJsonText}
                    onChange={(event) => {
                      setStructuredJsonText(event.target.value);
                      structuredPreviewMutation.reset();
                      structuredCommitMutation.reset();
                    }}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={
                      structuredJsonText.trim().length < 2 ||
                      structuredPreviewMutation.isPending
                    }
                    onClick={() => {
                      setResourceFormError(null);
                      structuredCommitMutation.reset();
                      structuredPreviewMutation.mutate({
                        jsonText: structuredJsonText
                      });
                    }}
                  >
                    {structuredPreviewMutation.isPending
                      ? t("common.loading")
                      : "Preview JSON"}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      !structuredPreview?.isValid ||
                      structuredCommitMutation.isPending
                    }
                    onClick={() => {
                      let parsedDue: Date | undefined;
                      if (resourceDueAt) {
                        const d = new Date(resourceDueAt);
                        if (Number.isNaN(d.getTime())) {
                          setResourceFormError("Invalid due date");
                          return;
                        }
                        parsedDue = d;
                      }
                      structuredCommitMutation.mutate({
                        jsonText: structuredJsonText,
                        filename: selectedResource
                          ? `${selectedResource.title}-selection.json`
                          : "pdf-selection.json",
                        autoAssignClassId: classId,
                        autoAssignDueAt: parsedDue
                      });
                    }}
                  >
                    {structuredCommitMutation.isPending
                      ? t("common.loading")
                      : "Commit and assign"}
                  </button>
                </div>

                {structuredPreview ? (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <div className="grid gap-2 md:grid-cols-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Title
                        </p>
                        <p className="text-slate-900">
                          {structuredPreview.titleSuggestion ?? "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Problems
                        </p>
                        <p className="text-slate-900">
                          {structuredPreview.problemCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Proof
                        </p>
                        <p className="text-slate-900">
                          {structuredPreview.proofProblemCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Status
                        </p>
                        <p
                          className={
                            structuredPreview.isValid
                              ? "font-semibold text-emerald-700"
                              : "font-semibold text-amber-700"
                          }
                        >
                          {structuredPreview.isValid
                            ? "Ready to commit"
                            : "Needs edits"}
                        </p>
                      </div>
                    </div>
                    {structuredPreview.errors.length > 0 ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                        <p className="font-semibold">Required edits</p>
                        <ul className="mt-1 list-disc pl-5">
                          {structuredPreview.errors.slice(0, 8).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {structuredPreview.warnings.length > 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                        <p className="font-semibold">Warnings</p>
                        <ul className="mt-1 list-disc pl-5">
                          {structuredPreview.warnings
                            .slice(0, 6)
                            .map((warning, i) => (
                              <li key={i}>{warning}</li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {structuredCommit ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p className="font-semibold">
                      Structured problem set assigned to this class.
                    </p>
                    <p className="mt-1 text-xs">
                      Created {structuredCommit.createdProblems}, updated{" "}
                      {structuredCommit.updatedProblems}; proof preprocessing
                      queued for {structuredCommit.preprocessQueuedCount}.
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              <span>Student-facing prompt</span>
              <textarea
                className="input-field min-h-40"
                value={studentPrompt}
                onChange={(event) => setStudentPrompt(event.target.value)}
                placeholder="Cleaned assignment text shown to students. Use Transform selected text to draft this automatically."
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Teacher grading guidance</span>
              <textarea
                className="input-field min-h-40"
                value={gradingGuidance}
                onChange={(event) => setGradingGuidance(event.target.value)}
                placeholder="Rubric, partial-credit notes, or grading criteria. Only teachers see this."
              />
            </label>
          </div>
          <label className="space-y-2 text-sm text-slate-700 md:max-w-sm">
            <span>{t("teacher.class.assign_due_at_label")}</span>
            <input
              type="datetime-local"
              className="input-field"
              value={resourceDueAt}
              onChange={(event) => setResourceDueAt(event.target.value)}
            />
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allowLateSubmissions}
              onChange={(event) =>
                setAllowLateSubmissions(event.target.checked)
              }
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="font-medium">Allow late submissions</span>
              <span className="block text-xs text-slate-500">
                When off, students cannot submit after the due time.
              </span>
            </span>
          </label>
          {resourceFormError ? (
            <p className="text-sm text-red-600">{resourceFormError}</p>
          ) : null}
          <button
            type="submit"
            className="btn-primary"
            disabled={createResourceMutation.isPending}
          >
            {createResourceMutation.isPending ? t("common.loading") : "Assign PDF"}
          </button>
        </form>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Problem-set assignments
        </h3>
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
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          PDF assignments
        </h3>
        {resourceAssignments.length === 0 ? (
          <p className="text-sm text-slate-600">No PDF assignments yet.</p>
        ) : (
          <ul className="space-y-2">
            {resourceAssignments.map((assignment) => (
              <li
                key={assignment.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      {assignment.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {assignment.resourceTitle}
                      {assignment.resourceFilename
                        ? ` · ${assignment.resourceFilename}`
                        : ""}{" "}
                      · {assignment.submissionCount} submitted
                    </p>
                    {assignment.dueAt ? (
                      <p className="text-xs text-slate-500">
                        Due {formatDate(assignment.dueAt)}
                        {assignment.allowLateSubmissions
                          ? " · late allowed"
                        : ""}
                      </p>
                    ) : null}
                    {formatResourceScope(assignment) ? (
                      <p className="text-xs font-medium text-slate-600">
                        Selected: {formatResourceScope(assignment)}
                      </p>
                    ) : null}
                    {assignment.instructions ? (
                      <p className="whitespace-pre-wrap pt-2 text-sm text-slate-700">
                        {assignment.instructions}
                      </p>
                    ) : null}
                    {assignment.studentPrompt ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Student prompt
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {assignment.studentPrompt}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onOpenResourceProgress(assignment.id)}
                    >
                      View submissions
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Remove this PDF assignment? Student submissions are deleted."
                          )
                        ) {
                          return;
                        }
                        deleteResourceMutation.mutate({
                          assignmentId: assignment.id
                        });
                      }}
                      disabled={deleteResourceMutation.isPending}
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GradebookPanel({
  data,
  isLoading,
  error,
  assignmentType,
  status,
  search,
  onAssignmentTypeChange,
  onStatusChange,
  onSearchChange
}: {
  data: GradebookSummary | undefined;
  isLoading: boolean;
  error: string | null;
  assignmentType: GradebookAssignmentType;
  status: GradebookStatusFilter;
  search: string;
  onAssignmentTypeChange: (value: GradebookAssignmentType) => void;
  onStatusChange: (value: GradebookStatusFilter) => void;
  onSearchChange: (value: string) => void;
}) {
  const rows = data?.rows ?? [];

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Gradebook
          </h3>
          <p className="text-xs text-slate-600">
            Filter students across structured and PDF assignments.
          </p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[160px_180px_1fr]">
        <label className="space-y-1 text-xs text-slate-600">
          <span>Type</span>
          <select
            className="input-field h-10"
            value={assignmentType}
            onChange={(event) =>
              onAssignmentTypeChange(
                event.target.value as GradebookAssignmentType
              )
            }
          >
            <option value="ALL">All</option>
            <option value="PROBLEM_SET">Problem sets</option>
            <option value="PDF">PDF</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-slate-600">
          <span>Status</span>
          <select
            className="input-field h-10"
            value={status}
            onChange={(event) =>
              onStatusChange(event.target.value as GradebookStatusFilter)
            }
          >
            <option value="ALL">All</option>
            <option value="NEEDS_GRADING">Needs grading</option>
            <option value="DUE_SOON">Due soon</option>
            <option value="OVERDUE">Overdue</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="GRADED">Graded</option>
            <option value="COMPLETED">Completed</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="NOT_STARTED">Not started</option>
            <option value="NOT_SUBMITTED">Not submitted</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-slate-600">
          <span>Search</span>
          <input
            className="input-field h-10"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Student, email, assignment, or source"
          />
        </label>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading gradebook...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data ? (
        <>
          <div className="grid gap-2 md:grid-cols-6">
            <GradebookMetric label="Rows" value={data.summary.totalRows} />
            <GradebookMetric
              label="Complete"
              value={data.summary.completedRows}
            />
            <GradebookMetric
              label="Needs grading"
              value={data.summary.needsGradingRows}
            />
            <GradebookMetric label="Overdue" value={data.summary.overdueRows} />
            <GradebookMetric label="Due soon" value={data.summary.dueSoonRows} />
            <GradebookMetric
              label="Avg"
              value={
                data.summary.averagePercent == null
                  ? "-"
                  : `${data.summary.averagePercent}%`
              }
            />
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-white">
            {rows.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">
                No gradebook rows match these filters.
              </p>
            ) : (
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Assignment</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <GradebookTableRow key={row.rowId} row={row} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function GradebookMetric({
  label,
  value
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function GradebookTableRow({ row }: { row: GradebookRow }) {
  return (
    <tr className="border-b border-slate-100 align-top last:border-0">
      <td className="px-3 py-2">
        <p className="font-semibold text-slate-900">
          {row.studentName ?? row.studentEmail}
        </p>
        {row.studentName ? (
          <p className="text-xs text-slate-500">{row.studentEmail}</p>
        ) : null}
      </td>
      <td className="px-3 py-2 text-xs font-semibold text-slate-600">
        {row.assignmentType === "PDF" ? "PDF" : "Problem set"}
      </td>
      <td className="px-3 py-2">
        <p className="font-medium text-slate-900">{row.assignmentTitle}</p>
        <p className="text-xs text-slate-500">
          {row.sourceTitle}
          {row.scope ? ` · ${row.scope}` : ""}
        </p>
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">
        {row.dueAt ? formatDate(row.dueAt) : "-"}
      </td>
      <td className="px-3 py-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
          {formatGradebookStatus(row.status)}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-slate-700">
        {row.score == null || row.maxScore == null
          ? "-"
          : `${row.score} / ${row.maxScore}`}
        {row.percent != null ? (
          <span className="ml-1 text-slate-500">({row.percent}%)</span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">
        {row.submittedAt ? formatDate(row.submittedAt) : "-"}
        {row.attachmentFilename ? (
          <p className="text-slate-500">{row.attachmentFilename}</p>
        ) : null}
      </td>
    </tr>
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

function ResourceProgressDrawer({
  assignmentId,
  locale,
  onClose
}: {
  assignmentId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const t = translator(locale);
  const query = trpc.teacher.resourceAssignments.progress.useQuery({
    assignmentId
  });

  return (
    <section className="surface-card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          PDF submissions
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">
                {query.data.title}
              </p>
              <p className="text-xs text-slate-500">
                {query.data.resource.title}
                {query.data.dueAt ? ` · due ${formatDate(query.data.dueAt)}` : ""}
              </p>
              {formatResourceScope(query.data) ? (
                <p className="text-xs font-medium text-slate-600">
                  Selected: {formatResourceScope(query.data)}
                </p>
              ) : null}
            </div>
            <a
              className="btn-secondary"
              href={query.data.resource.downloadUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open PDF
            </a>
          </div>

          {query.data.studentPrompt ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Student prompt
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {query.data.studentPrompt}
              </p>
            </div>
          ) : query.data.instructions ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Instructions
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {query.data.instructions}
              </p>
            </div>
          ) : null}

          {query.data.gradingGuidance ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                Teacher grading guidance
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-amber-950">
                {query.data.gradingGuidance}
              </p>
            </div>
          ) : null}

          <div className="space-y-3">
            {query.data.students.map((row) => (
              <ResourceSubmissionCard
                key={row.userId}
                assignmentId={assignmentId}
                row={row}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function ResourceSubmissionCard({
  assignmentId,
  row
}: {
  assignmentId: string;
  row: ResourceProgressRow;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">
            {row.name ?? row.email}
          </p>
          {row.name ? <p className="text-xs text-slate-500">{row.email}</p> : null}
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          {translateResourceStatus(row.status)}
        </span>
      </div>

      {row.submission ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Submitted {formatDate(row.submission.submittedAt)}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {row.submission.answerText || "File submission"}
            </p>
            {row.submission.attachmentFilename ? (
              <a
                className="mt-2 inline-flex text-xs font-semibold text-[var(--accent)] underline"
                href={`/api/resource-submissions/${row.submission.id}/attachment`}
                target="_blank"
                rel="noreferrer"
              >
                {row.submission.attachmentFilename}
                {row.submission.attachmentSize
                  ? ` · ${Math.ceil(row.submission.attachmentSize / 1024)} KB`
                  : ""}
              </a>
            ) : null}
          </div>
          {row.submission.gradedAt ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">
                Grade: {row.submission.gradeScore} / {row.submission.gradeMax}
              </p>
              {row.submission.feedback ? (
                <p className="mt-1 whitespace-pre-wrap">{row.submission.feedback}</p>
              ) : null}
            </div>
          ) : null}
          <GradeSubmissionForm assignmentId={assignmentId} row={row} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No submission yet.</p>
      )}
    </article>
  );
}

function GradeSubmissionForm({
  assignmentId,
  row
}: {
  assignmentId: string;
  row: ResourceProgressRow;
}) {
  const utils = trpc.useContext();
  const [score, setScore] = useState(
    row.submission?.gradeScore != null ? String(row.submission.gradeScore) : ""
  );
  const [maxScore, setMaxScore] = useState(
    row.submission?.gradeMax != null ? String(row.submission.gradeMax) : "100"
  );
  const [feedback, setFeedback] = useState(row.submission?.feedback ?? "");
  const [error, setError] = useState<string | null>(null);
  const percentagePreview = useMemo(() => {
    const parsedScore = Number(score);
    const parsedMax = Number(maxScore);
    if (
      Number.isNaN(parsedScore) ||
      Number.isNaN(parsedMax) ||
      parsedMax <= 0
    ) {
      return null;
    }
    return Math.round((parsedScore / parsedMax) * 100);
  }, [score, maxScore]);

  const gradeMutation = trpc.teacher.resourceAssignments.grade.useMutation({
    onSuccess: () => {
      setError(null);
      utils.teacher.resourceAssignments.progress.invalidate({ assignmentId });
      utils.teacher.gradebook.summary.invalidate();
    },
    onError: (err) => setError(err.message)
  });

  if (!row.submission) {
    return null;
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const parsedScore = Number(score);
        const parsedMax = Number(maxScore);
        if (
          Number.isNaN(parsedScore) ||
          Number.isNaN(parsedMax) ||
          parsedScore < 0 ||
          parsedMax <= 0 ||
          parsedScore > parsedMax
        ) {
          setError("Enter a valid score and max score.");
          return;
        }
        gradeMutation.mutate({
          assignmentId,
          studentUserId: row.userId,
          gradeScore: parsedScore,
          gradeMax: parsedMax,
          feedback: feedback.trim() || undefined
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-slate-600">
          <span>Score</span>
          <input
            className="input-field h-10 w-28"
            value={score}
            onChange={(event) => setScore(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-600">
          <span>Max</span>
          <input
            className="input-field h-10 w-28"
            value={maxScore}
            onChange={(event) => setMaxScore(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <button
          type="button"
          className="btn-secondary h-10"
          onClick={() => {
            const max = Number(maxScore);
            setScore(Number.isNaN(max) || max <= 0 ? "100" : String(max));
          }}
        >
          Full credit
        </button>
        <button
          type="button"
          className="btn-secondary h-10"
          onClick={() => {
            setFeedback((prev) =>
              prev.trim()
                ? prev
                : "Please revise the missing reasoning and resubmit the corrected work."
            );
          }}
        >
          Needs revision
        </button>
        {percentagePreview != null ? (
          <span className="pb-2 text-xs font-semibold text-slate-500">
            {percentagePreview}%
          </span>
        ) : null}
      </div>
      <label className="space-y-1 text-xs text-slate-600">
        <span>Feedback to student</span>
        <textarea
          className="input-field min-h-24"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="Optional feedback. Mention missing reasoning, formatting expectations, or what to fix before resubmission."
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="btn-primary"
          disabled={gradeMutation.isPending}
        >
          {gradeMutation.isPending ? "Saving..." : "Save grade"}
        </button>
        {row.submission.gradedAt ? (
          <span className="text-xs text-slate-500">
            Last graded {formatDate(row.submission.gradedAt)}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : null}
    </form>
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

function translateResourceStatus(
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

function formatGradebookStatus(status: GradebookRow["status"]): string {
  switch (status) {
    case "COMPLETED":
      return "Completed";
    case "IN_PROGRESS":
      return "In progress";
    case "NOT_STARTED":
      return "Not started";
    case "OVERDUE":
      return "Overdue";
    case "GRADED":
      return "Graded";
    case "SUBMITTED":
      return "Submitted";
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

function previewPageNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function PdfPagePreview({
  resourceId,
  page,
  label
}: {
  resourceId: string;
  page: number;
  label: string;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <figcaption className="text-xs font-semibold text-slate-600">
          {label}
        </figcaption>
        <span className="text-xs text-slate-500">Page {page}</span>
      </div>
      <div className="flex h-72 items-start justify-center overflow-auto bg-slate-100 p-2">
        <img
          src={`/api/org-resources/${resourceId}/preview?page=${page}`}
          alt={`${label} page ${page}`}
          className="max-w-full rounded border border-slate-200 bg-white shadow-sm"
          loading="lazy"
        />
      </div>
    </figure>
  );
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
