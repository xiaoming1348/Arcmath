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

  const [newClassName, setNewClassName] = useState("");
  const [newClassTeacherId, setNewClassTeacherId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Older-than-cursor pages we've already loaded, in display order
  // (newest first within each page). The first page comes from the
  // overview query; "load more" pushes additional pages here.
  const [activityPages, setActivityPages] = useState<
    Array<NonNullable<typeof overviewQuery.data>["activity"]>
  >([]);
  const [activityHasMore, setActivityHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const activityFeedFetcher = trpc.useContext().orgAdmin.activityFeed;

  const createClassMutation = trpc.orgAdmin.createClass.useMutation({
    onSuccess: () => {
      setNewClassName("");
      setNewClassTeacherId("");
      setCreateError(null);
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

  const handleCreateClass = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newClassName.trim() || !newClassTeacherId) return;
    createClassMutation.mutate({
      name: newClassName.trim(),
      assignedTeacherId: newClassTeacherId
    });
  };

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
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Create-class form */}
      <section className="surface-card space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">
          {t("org.overview.create_class_heading")}
        </h3>
        {data.teachers.length === 0 ? (
          <p className="text-sm text-slate-500">{t("org.overview.create_class_no_teachers")}</p>
        ) : (
          <form onSubmit={handleCreateClass} className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm text-slate-700">
              <span>{t("org.overview.create_class_name_label")}</span>
              <input
                type="text"
                className="input-field"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>{t("org.overview.create_class_teacher_label")}</span>
              <select
                className="input-field"
                value={newClassTeacherId}
                onChange={(e) => setNewClassTeacherId(e.target.value)}
                required
              >
                <option value="" disabled>
                  —
                </option>
                {data.teachers.map((teacher) => (
                  <option key={teacher.userId} value={teacher.userId}>
                    {teacher.name ?? teacher.email}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="btn-primary"
                disabled={createClassMutation.isPending}
              >
                {t("org.overview.create_class_submit")}
              </button>
            </div>
            {createError ? (
              <p className="md:col-span-3 text-sm text-red-600">{createError}</p>
            ) : null}
          </form>
        )}
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
