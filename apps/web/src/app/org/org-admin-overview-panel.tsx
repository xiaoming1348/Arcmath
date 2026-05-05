"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { translator } from "@/i18n/client";
import type { Locale, Messages } from "@/i18n/dictionary";

/**
 * The school-admin "everything in one screen" panel that mounts under
 * /org. Drives four panels off the `orgAdmin.overview` tRPC query:
 *
 *   1. Teachers — count of classes + assignments per teacher
 *   2. Students — flat list with email
 *   3. Classes — assigned teacher, enrollment + assignment count
 *   4. Activity feed — paginated audit-log scroll
 *
 * Plus a "create class + assign to teacher" form, which is the only
 * mutation in this surface. Everything else (member creation, teacher
 * invite) already lives in surrounding /org sections.
 *
 * We deliberately keep the activity feed in the same component rather
 * than splitting it: the feed needs the same teacher-name lookup map
 * the other panels build, and sharing locale/translator is clean here.
 */
export function OrgAdminOverviewPanel({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const overviewQuery = trpc.orgAdmin.overview.useQuery();
  const utils = trpc.useContext();

  const [rosterClassName, setRosterClassName] = useState("");
  // Discriminated entry: either "new" (with a typed-in name) or
  // "existing" (with the userId of an existing teacher/student picked
  // from a dropdown). One row per student so a comma in a name can't
  // be parsed as a delimiter.
  type RosterEntry =
    | { kind: "new"; name: string }
    | { kind: "existing"; userId: string };
  const [teacherEntry, setTeacherEntry] = useState<RosterEntry>({ kind: "new", name: "" });
  const [studentEntries, setStudentEntries] = useState<RosterEntry[]>([
    { kind: "new", name: "" }
  ]);
  const [createError, setCreateError] = useState<string | null>(null);

  // Credential reveal: shown ONCE after a successful class+roster
  // creation. The admin reads off the new email-style usernames to
  // each user; once they navigate away the list is gone.
  type CredentialRow = {
    role: "teacher" | "student";
    name: string;
    email: string;
    isNew: boolean;
  };
  const [credentialReveal, setCredentialReveal] = useState<CredentialRow[] | null>(null);

  // Older-than-cursor pages we've already loaded, in display order
  // (newest first within each page). The first page comes from the
  // overview query; "load more" pushes additional pages here.
  const [activityPages, setActivityPages] = useState<
    Array<NonNullable<typeof overviewQuery.data>["activity"]>
  >([]);
  const [activityHasMore, setActivityHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const activityFeedFetcher = trpc.useContext().orgAdmin.activityFeed;

  const createRosterMutation = trpc.orgAdmin.createClassWithRoster.useMutation({
    onSuccess: (result) => {
      setRosterClassName("");
      setTeacherEntry({ kind: "new", name: "" });
      setStudentEntries([{ kind: "new", name: "" }]);
      setCreateError(null);
      // Build the credentials reveal table.
      const rows: CredentialRow[] = [
        {
          role: "teacher",
          name: result.teacher.name,
          email: result.teacher.email,
          isNew: result.teacher.isNew
        },
        ...result.students.map((s) => ({
          role: "student" as const,
          name: s.name,
          email: s.email,
          isNew: s.isNew
        }))
      ];
      setCredentialReveal(rows);
      void utils.orgAdmin.overview.invalidate();
      // Reset paginated activity so newly-logged class.create event
      // surfaces in the latest page when the user reloads the feed.
      setActivityPages([]);
      setActivityHasMore(true);
    },
    onError: (err) => setCreateError(err.message)
  });

  // Combine first page (from overview) + any additionally-loaded pages.
  // Cast to a broad event row type so the JSX consumers don't drag tRPC's
  // deeply-nested return-type inference into every map() callback (which
  // tripped TS2589 "type instantiation is excessively deep").
  type ActivityRow = {
    id: string;
    action: string;
    createdAt: string | Date;
    targetType: string | null;
    targetId: string | null;
    payload: unknown;
    actor: { id: string; email: string; name: string | null } | null;
  };
  const allActivity = useMemo<ActivityRow[]>(() => {
    const first = (overviewQuery.data?.activity ?? []) as unknown as ActivityRow[];
    const more = activityPages.flat() as unknown as ActivityRow[];
    return [...first, ...more];
  }, [overviewQuery.data?.activity, activityPages]);

  if (overviewQuery.isLoading) {
    return (
      <section className="surface-card">
        <p className="text-sm text-slate-500">…</p>
      </section>
    );
  }

  if (overviewQuery.error) {
    return (
      <section className="surface-card">
        <p className="text-sm text-red-600">{overviewQuery.error.message}</p>
      </section>
    );
  }

  const data = overviewQuery.data;
  if (!data) return null;

  const handleCreateClassWithRoster = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    if (!rosterClassName.trim()) {
      setCreateError("Class name is required.");
      return;
    }

    // Validate teacher entry (server also validates, but a client-side
    // check gives instant feedback before the network round-trip).
    const teacherPayload =
      teacherEntry.kind === "new"
        ? { kind: "new" as const, name: teacherEntry.name.trim() }
        : { kind: "existing" as const, userId: teacherEntry.userId };
    if (teacherPayload.kind === "new" && teacherPayload.name.length === 0) {
      setCreateError("Enter the teacher's name, or pick an existing teacher.");
      return;
    }
    if (teacherPayload.kind === "existing" && teacherPayload.userId.length === 0) {
      setCreateError("Pick an existing teacher from the list.");
      return;
    }

    // Filter out blank "new" rows so the admin doesn't have to remove
    // each placeholder row manually before submit.
    const studentsPayload = studentEntries
      .map((e) =>
        e.kind === "new"
          ? { kind: "new" as const, name: e.name.trim() }
          : { kind: "existing" as const, userId: e.userId }
      )
      .filter(
        (e) =>
          (e.kind === "new" && e.name.length > 0) ||
          (e.kind === "existing" && e.userId.length > 0)
      );
    if (studentsPayload.length === 0) {
      setCreateError("Add at least one student.");
      return;
    }

    createRosterMutation.mutate({
      className: rosterClassName.trim(),
      teacher: teacherPayload,
      students: studentsPayload
    });
  };

  // Helpers for the dynamic student-row table.
  const addStudentRow = () =>
    setStudentEntries((prev) => [...prev, { kind: "new", name: "" }]);
  const removeStudentRow = (index: number) =>
    setStudentEntries((prev) => prev.filter((_, i) => i !== index));
  const updateStudentRow = (index: number, next: RosterEntry) =>
    setStudentEntries((prev) => prev.map((e, i) => (i === index ? next : e)));

  // Live count of "new" student names — drives the seat-cap hint
  // shown below the form.
  const newTeacherInRoster = teacherEntry.kind === "new" && teacherEntry.name.trim() ? 1 : 0;
  const newStudentsInRoster = studentEntries.filter(
    (e) => e.kind === "new" && e.name.trim()
  ).length;

  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const lastEvent = allActivity[allActivity.length - 1];
      const cursor = lastEvent ? new Date(lastEvent.createdAt).toISOString() : undefined;
      // The tRPC client return type here is heavily generic; cast the
      // payload after the await to keep TS from chasing deep nested
      // generics every render. The runtime contract is fixed in the
      // server router and tested at the integration boundary.
      const result = (await activityFeedFetcher.fetch({ cursor })) as unknown as {
        events: unknown[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      setActivityPages((prev) => [...prev, result.events as never]);
      setActivityHasMore(result.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      {/* Overview header */}
      <section className="surface-card space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">{t("org.overview.title")}</h2>
        <p className="text-sm text-slate-600">{t("org.overview.subtitle")}</p>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {/* Teachers */}
        <div className="surface-card space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">
            {t("org.overview.teachers_heading")} ({data.teachers.length})
          </h3>
          {data.teachers.length === 0 ? (
            <p className="text-sm text-slate-500">{t("org.overview.no_teachers")}</p>
          ) : (
            <ul className="space-y-2">
              {data.teachers.map((teacher) => (
                <li
                  key={teacher.userId}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {teacher.name ?? teacher.email}
                  </p>
                  <p className="text-xs text-slate-600">{teacher.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("org.overview.teacher_class_count", { count: teacher.classCount })} ·{" "}
                    {t("org.overview.teacher_assignment_count", { count: teacher.assignmentCount })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Students */}
        <div className="surface-card space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">
            {t("org.overview.students_heading")} ({data.students.length})
          </h3>
          {data.students.length === 0 ? (
            <p className="text-sm text-slate-500">{t("org.overview.no_students")}</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-auto">
              {data.students.map((student) => (
                <li
                  key={student.userId}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {student.name ?? student.email}
                  </p>
                  <p className="text-xs text-slate-600">{student.email}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Classes */}
      <section className="surface-card space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">
          {t("org.overview.classes_heading")} ({data.classes.length})
        </h3>
        {data.classes.length === 0 ? (
          <p className="text-sm text-slate-500">{t("org.overview.no_classes")}</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {data.classes.map((klass) => (
              <li
                key={klass.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-sm font-semibold text-slate-900">{klass.name}</p>
                <p className="text-xs text-slate-600">
                  {klass.assignedTeacher
                    ? t("org.overview.class_taught_by", {
                        name: klass.assignedTeacher.name ?? klass.assignedTeacher.email
                      })
                    : t("org.overview.class_unassigned")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("org.overview.class_enrollments", { count: klass._count.enrollments })} ·{" "}
                  {t("org.overview.class_assignments", { count: klass._count.assignments })}
                </p>
                {klass.joinCode ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700">
                      {t("org.overview.class_join_code")}
                    </span>
                    <code className="rounded bg-white px-2 py-0.5 font-mono text-xs tracking-widest text-slate-900 border border-slate-200">
                      {klass.joinCode}
                    </code>
                    <button
                      type="button"
                      className="text-xs text-[var(--accent)] hover:underline"
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.clipboard) {
                          void navigator.clipboard.writeText(klass.joinCode!);
                        }
                      }}
                    >
                      {t("org.overview.class_join_code_copy")}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Roster-based create-class form. The admin enters the class
          name, ONE teacher's real name, and a list of student real
          names (one per line, or comma-separated). The server auto-
          generates email-format usernames + creates accounts; matched
          existing users (by name within this org) are reused. */}
      <section className="surface-card space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">
          {t("org.overview.create_class_heading")}
        </h3>
        <p className="text-xs text-slate-500">
          {t("org.overview.create_class_roster_help", {
            teachers: data.teachers.length + newTeacherInRoster,
            maxTeachers: 5,
            students: data.students.length + newStudentsInRoster,
            maxStudents: 50
          })}
        </p>
        <form onSubmit={handleCreateClassWithRoster} className="space-y-4">
          <label className="block space-y-1 text-sm text-slate-700">
            <span>{t("org.overview.create_class_name_label")}</span>
            <input
              type="text"
              className="input-field"
              value={rosterClassName}
              onChange={(e) => setRosterClassName(e.target.value)}
              required
              maxLength={120}
            />
          </label>

          {/* Teacher row — single-row "new vs existing" picker. */}
          <fieldset className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
            <legend className="text-sm font-semibold text-slate-800 px-1">
              {t("org.overview.create_class_teacher_name_label")}
            </legend>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="teacher-kind"
                  checked={teacherEntry.kind === "new"}
                  onChange={() => setTeacherEntry({ kind: "new", name: "" })}
                />
                <span>{t("org.overview.roster_kind_new")}</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="teacher-kind"
                  checked={teacherEntry.kind === "existing"}
                  disabled={data.teachers.length === 0}
                  onChange={() =>
                    setTeacherEntry({
                      kind: "existing",
                      userId: data.teachers[0]?.userId ?? ""
                    })
                  }
                />
                <span>
                  {t("org.overview.roster_kind_existing")}
                  {data.teachers.length === 0 ? ` (${t("org.overview.roster_no_existing_teachers")})` : ""}
                </span>
              </label>
            </div>
            {teacherEntry.kind === "new" ? (
              <input
                type="text"
                className="input-field"
                value={teacherEntry.name}
                onChange={(e) => setTeacherEntry({ kind: "new", name: e.target.value })}
                maxLength={120}
                placeholder={t("org.overview.create_class_teacher_name_placeholder")}
              />
            ) : (
              <select
                className="input-field"
                value={teacherEntry.userId}
                onChange={(e) => setTeacherEntry({ kind: "existing", userId: e.target.value })}
              >
                {data.teachers.map((teach) => (
                  <option key={teach.userId} value={teach.userId}>
                    {teach.name ?? teach.email} — {teach.email}
                  </option>
                ))}
              </select>
            )}
          </fieldset>

          {/* Students table — one row per student. Each row picks
              between a "new name" text input and an "existing user"
              dropdown. + Add another / × Remove keeps the list
              malleable; the student count below the button shows the
              live total against the cap. */}
          <fieldset className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
            <legend className="text-sm font-semibold text-slate-800 px-1">
              {t("org.overview.create_class_student_names_label")} (
              {studentEntries.filter((e) => (e.kind === "new" ? e.name.trim() : e.userId)).length}
              )
            </legend>
            <p className="text-xs text-slate-500">
              {t("org.overview.create_class_student_rows_help")}
            </p>
            <ol className="space-y-2">
              {studentEntries.map((entry, idx) => (
                <li key={idx} className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-xs font-mono text-slate-500">{idx + 1}.</span>
                  <select
                    className="input-field h-9 w-28 text-xs"
                    value={entry.kind}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === "new") {
                        updateStudentRow(idx, { kind: "new", name: "" });
                      } else {
                        updateStudentRow(idx, {
                          kind: "existing",
                          userId: data.students[0]?.userId ?? ""
                        });
                      }
                    }}
                  >
                    <option value="new">{t("org.overview.roster_kind_new")}</option>
                    <option value="existing" disabled={data.students.length === 0}>
                      {t("org.overview.roster_kind_existing")}
                    </option>
                  </select>
                  {entry.kind === "new" ? (
                    <input
                      type="text"
                      className="input-field h-9 flex-1"
                      value={entry.name}
                      onChange={(e) => updateStudentRow(idx, { kind: "new", name: e.target.value })}
                      maxLength={120}
                      placeholder={t("org.overview.create_class_student_row_placeholder")}
                    />
                  ) : (
                    <select
                      className="input-field h-9 flex-1"
                      value={entry.userId}
                      onChange={(e) =>
                        updateStudentRow(idx, { kind: "existing", userId: e.target.value })
                      }
                    >
                      {data.students.map((stu) => (
                        <option key={stu.userId} value={stu.userId}>
                          {stu.name ?? stu.email} — {stu.email}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-red-600"
                    onClick={() => removeStudentRow(idx)}
                    disabled={studentEntries.length === 1}
                    title={t("org.overview.roster_remove_row")}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={addStudentRow}
              disabled={studentEntries.length >= 50}
            >
              {t("org.overview.roster_add_row")}
            </button>
          </fieldset>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="btn-primary"
              disabled={createRosterMutation.isPending}
            >
              {t("org.overview.create_class_submit")}
            </button>
            {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          </div>
        </form>

        {/* One-time credential reveal panel. Visible only after a
            successful roster creation; clears when admin clicks "Done". */}
        {credentialReveal ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-emerald-900">
                  {t("org.overview.credentials_heading")}
                </p>
                <p className="text-xs text-emerald-800">
                  {t("org.overview.credentials_help")}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCredentialReveal(null)}
              >
                {t("org.overview.credentials_done")}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-emerald-800">
                  <th className="px-2 py-1">{t("org.overview.credentials_role")}</th>
                  <th className="px-2 py-1">{t("org.overview.credentials_name")}</th>
                  <th className="px-2 py-1">{t("org.overview.credentials_username")}</th>
                  <th className="px-2 py-1">{t("org.overview.credentials_status")}</th>
                </tr>
              </thead>
              <tbody>
                {credentialReveal.map((row) => (
                  <tr key={row.email} className="border-t border-emerald-200 align-top">
                    <td className="px-2 py-1 text-xs">{row.role}</td>
                    <td className="px-2 py-1 text-xs">{row.name}</td>
                    <td className="px-2 py-1">
                      <code className="rounded bg-white px-2 py-0.5 font-mono text-xs text-slate-900 border border-emerald-200">
                        {row.email}
                      </code>
                    </td>
                    <td className="px-2 py-1 text-xs">
                      {row.isNew
                        ? t("org.overview.credentials_status_new")
                        : t("org.overview.credentials_status_existing")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="text-xs text-[var(--accent-strong)] hover:underline"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  const text = credentialReveal
                    .map((r) => `${r.name}\t${r.email}\t${r.role}`)
                    .join("\n");
                  void navigator.clipboard.writeText(text);
                }
              }}
            >
              {t("org.overview.credentials_copy_all")}
            </button>
          </div>
        ) : null}
      </section>

      {/* Activity feed */}
      <section className="surface-card space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">
          {t("org.overview.activity_heading")}
        </h3>
        {allActivity.length === 0 ? (
          <p className="text-sm text-slate-500">{t("org.overview.no_activity")}</p>
        ) : (
          <ol className="space-y-2">
            {allActivity.map((event) => (
              <li
                key={event.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
              >
                <p>
                  {renderActivityLine(t, event)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(event.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                  })}
                </p>
              </li>
            ))}
          </ol>
        )}
        <div className="flex items-center justify-center pt-2">
          {activityHasMore ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={loadingMore}
              onClick={() => void handleLoadMore()}
            >
              {t("org.overview.feed_load_more")}
            </button>
          ) : (
            <p className="text-xs text-slate-500">{t("org.overview.feed_no_more")}</p>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * Render one activity event into a localised one-line summary. We
 * lookup the i18n action key under `org.overview.action.<action>`
 * and fall back to a generic "{actor} did {action}" string when the
 * action isn't whitelisted in the dictionary yet — this keeps the
 * feed forward-compatible if backend code starts logging new
 * actions before the dictionary catches up.
 */
function renderActivityLine(
  t: ReturnType<typeof translator>,
  event: {
    action: string;
    actor: { email: string; name: string | null } | null;
    payload: unknown;
    targetType: string | null;
  }
): string {
  const actor = event.actor?.name ?? event.actor?.email ?? "—";
  const targetTitle =
    event.payload && typeof event.payload === "object" && event.payload !== null && "name" in event.payload
      ? String((event.payload as { name?: unknown }).name ?? "")
      : event.payload && typeof event.payload === "object" && event.payload !== null && "title" in event.payload
        ? String((event.payload as { title?: unknown }).title ?? "")
        : "";
  const key = `org.overview.action.${event.action}` as keyof Messages;
  const tried = t(key, { actor, target: targetTitle });
  // The translator returns the key itself when the entry is missing.
  if (tried === key) {
    return `${actor} · ${event.action}`;
  }
  return tried;
}
