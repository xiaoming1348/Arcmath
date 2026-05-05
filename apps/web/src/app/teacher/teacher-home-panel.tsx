"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { translator } from "@/i18n/client";
import type { Locale } from "@/i18n/dictionary";
// `InviteTeachersForm` was the legacy school-admin path to invite
// teachers in. Under the roster-creation policy that flow lives on
// /org instead, so we no longer mount it here. Keeping the file
// around (commented import) for the moment in case the admin
// convenience path comes back.
// import { InviteTeachersForm } from "./invite-teachers-form";

/**
 * Interactive chunk of the teacher home page:
 *   - Live seat counters (students / teachers) via tRPC overview query.
 *   - Inline "New class" form — creates the class then pushes to the
 *     detail page so the teacher's next action (invite students) is one
 *     click away.
 *   - Class list with quick links to each class detail.
 *   - Optional "invite teachers" form for school admins only.
 *
 * We don't pass `initialData` here — tRPC's first fetch is fast enough
 * and letting the client fetch keeps the overview card in sync with
 * mutations below without needing router.refresh() plumbing.
 */
export function TeacherHomePanel({
  locale,
  canInviteTeachers
}: {
  locale: Locale;
  canInviteTeachers: boolean;
}) {
  const t = translator(locale);
  // `useRouter` and the create-class mutation were removed alongside
  // the legacy "New class" form. The teacher home is read-only as
  // far as class creation goes — that flow lives on /org now.
  void useRouter;

  const overviewQuery = trpc.teacher.overview.useQuery();
  const classesQuery = trpc.teacher.classes.list.useQuery();

  // utils kept (no-op) so existing imports don't break tests.
  const utils = trpc.useContext();
  void utils;

  const overview = overviewQuery.data;
  const classes = classesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-4">
        <OverviewCard
          label={t("teacher.home.classes_card")}
          value={overview ? String(overview.classCount) : "—"}
        />
        <OverviewCard
          label={t("teacher.home.students_card")}
          value={
            overview
              ? `${overview.studentSeats.used} / ${overview.studentSeats.max}`
              : "—"
          }
        />
        <OverviewCard
          label={t("teacher.home.teachers_card")}
          value={
            overview
              ? `${overview.teacherSeats.used} / ${overview.teacherSeats.max}`
              : "—"
          }
        />
        <OverviewCard
          label={t("teacher.home.upcoming_due_card")}
          value={overview ? String(overview.upcomingDueCount) : "—"}
        />
      </section>

      <section className="surface-card space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("teacher.classes.title")}
          </h2>
        </div>

        {/* Roster-creation product policy: only the school admin
            creates classes (via /org), so this teacher home no longer
            renders a "New class" form. Teachers see their assigned
            classes below; the assignment of teacher → class is set
            from the admin's roster form. */}
        <p className="text-xs text-slate-500">
          {t("teacher.classes.created_by_admin_help")}
        </p>

        {classesQuery.isLoading ? (
          <p className="text-sm text-slate-500">{t("common.loading")}</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-slate-600">
            {t("teacher.classes.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {classes.map((klass) => (
              <li key={klass.id}>
                <Link
                  href={`/teacher/classes/${klass.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-[var(--accent)]"
                >
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-slate-900">
                      {klass.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t("teacher.classes.join_code_label")}:{" "}
                      <span className="font-mono text-slate-700">
                        {klass.joinCode}
                      </span>
                    </p>
                    {!klass.isMine && klass.teacherName ? (
                      <p className="text-xs text-slate-500">
                        {klass.teacherName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-900">
                        {klass.studentCount}
                      </span>{" "}
                      {t("teacher.classes.student_count_label")}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">
                        {klass.assignmentCount}
                      </span>{" "}
                      {t("teacher.classes.assignment_count_label")}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Roster-creation product policy: teachers (and students) can
          only be added by the school admin via the /org class-roster
          form. The legacy "invite teachers" path is hidden but the
          component still ships in the bundle for the admin
          convenience flow if we ever bring it back. */}
    </div>
  );
}

function OverviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
