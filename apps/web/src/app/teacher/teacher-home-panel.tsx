"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { translator } from "@/i18n/client";
import type { Locale } from "@/i18n/dictionary";
import { InviteTeachersForm } from "./invite-teachers-form";

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
  const router = useRouter();
  const [newClassName, setNewClassName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const overviewQuery = trpc.teacher.overview.useQuery();
  const classesQuery = trpc.teacher.classes.list.useQuery();

  const utils = trpc.useContext();
  const createClassMutation = trpc.teacher.classes.create.useMutation({
    onSuccess: async (created) => {
      setNewClassName("");
      setCreateError(null);
      // Refresh list + overview so counters bump before the redirect.
      await Promise.all([
        utils.teacher.classes.list.invalidate(),
        utils.teacher.overview.invalidate()
      ]);
      router.push(`/teacher/classes/${created.id}`);
    },
    onError: (err) => {
      setCreateError(err.message);
    }
  });

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

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = newClassName.trim();
            if (!trimmed) return;
            createClassMutation.mutate({ name: trimmed });
          }}
        >
          <label className="flex-1 min-w-[220px] space-y-2 text-sm text-slate-700">
            <span>{t("teacher.classes.name_label")}</span>
            <input
              type="text"
              className="input-field"
              value={newClassName}
              onChange={(event) => setNewClassName(event.target.value)}
              placeholder="AMC 10 · Fall 2026"
              maxLength={120}
            />
          </label>
          <button
            type="submit"
            className="btn-primary"
            disabled={createClassMutation.isPending || !newClassName.trim()}
          >
            {createClassMutation.isPending
              ? t("common.loading")
              : t("teacher.home.new_class")}
          </button>
        </form>
        {createError ? (
          <p className="text-sm text-red-600">{createError}</p>
        ) : null}

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

      {canInviteTeachers ? (
        <InviteTeachersForm
          locale={locale}
          onInvited={() => {
            utils.teacher.overview.invalidate();
          }}
        />
      ) : null}
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
