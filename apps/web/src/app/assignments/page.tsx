import Link from "next/link";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canManageOrganization, getActiveOrganizationMembership } from "@/lib/organizations";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";

type AssignmentsPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

function summarizeError(
  code: string | undefined,
  t: (key: never) => string
): string | null {
  switch (code) {
    case "title-required":
      return t("assignments.error_title_required" as never);
    case "instructions-required":
      return t("assignments.error_instructions_required" as never);
    case "forbidden":
      return t("assignments.error_forbidden" as never);
    case "invalid-due-date":
      return t("assignments.error_invalid_due_date" as never);
    default:
      return null;
  }
}

function formatDate(value: Date | null, locale: "en" | "zh", noDueLabel: string): string {
  if (!value) {
    return noDueLabel;
  }
  return value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function AssignmentsPage({ searchParams }: AssignmentsPageProps) {
  const { created, error } = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fassignments");
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership) {
    redirect("/dashboard");
  }

  async function createOrganizationAssignment(formData: FormData) {
    "use server";

    const currentSession = await getServerSession(authOptions);
    if (!currentSession?.user) {
      redirect("/login?callbackUrl=%2Fassignments");
    }

    const currentMembership = await getActiveOrganizationMembership(prisma, currentSession.user.id);
    if (!currentMembership || !canManageOrganization(currentMembership.role)) {
      redirect("/assignments?error=forbidden");
    }

    const title = String(formData.get("title") ?? "").trim();
    const instructions = String(formData.get("instructions") ?? "").trim();
    const dueAtRaw = String(formData.get("dueAt") ?? "").trim();

    if (!title) {
      redirect("/assignments?error=title-required");
    }

    if (!instructions) {
      redirect("/assignments?error=instructions-required");
    }

    let dueAt: Date | null = null;
    if (dueAtRaw) {
      const parsed = new Date(dueAtRaw);
      if (Number.isNaN(parsed.getTime())) {
        redirect("/assignments?error=invalid-due-date");
      }
      dueAt = parsed;
    }

    await prisma.organizationAssignment.create({
      data: {
        organizationId: currentMembership.organizationId,
        createdByUserId: currentSession.user.id,
        title,
        instructions,
        dueAt
      }
    });

    revalidatePath("/assignments");
    revalidatePath("/dashboard");
    revalidatePath("/org");
    redirect("/assignments?created=1");
  }

  const [organization, assignments] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: membership.organizationId },
      select: {
        id: true,
        name: true
      }
    }),
    prisma.organizationAssignment.findMany({
      where: {
        organizationId: membership.organizationId
      },
      orderBy: [
        { dueAt: "asc" },
        { createdAt: "desc" }
      ],
      select: {
        id: true,
        title: true,
        instructions: true,
        dueAt: true,
        createdAt: true,
        createdByUser: {
          select: {
            name: true,
            email: true
          }
        }
      }
    })
  ]);

  if (!organization) {
    redirect("/org");
  }

  const canManage = canManageOrganization(membership.role);
  const locale = await resolveLocale();
  const t = translator(locale);
  const errMsg = summarizeError(error, t as never);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <span className="badge">{t("assignments.badge")}</span>
            <h1 className="text-2xl font-semibold text-slate-900">{organization.name}</h1>
            <p className="text-sm text-slate-600">{t("assignments.subtitle")}</p>
          </div>
          <Link href="/org" className="btn-secondary">
            {t("assignments.back_to_org")}
          </Link>
        </div>

        {created ? <p className="text-sm text-emerald-700">{t("assignments.published_ok")}</p> : null}
        {errMsg ? <p className="text-sm text-red-600">{errMsg}</p> : null}
      </section>

      {canManage ? (
        <section className="surface-card space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">{t("assignments.publish_heading")}</h2>
            <p className="text-sm text-slate-600">{t("assignments.publish_body")}</p>
          </div>

          <form action={createOrganizationAssignment} className="grid gap-3">
            <label className="space-y-2 text-sm text-slate-700">
              <span>{t("assignments.form_title_label")}</span>
              <input
                name="title"
                className="input-field"
                type="text"
                placeholder={t("assignments.form_title_placeholder")}
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>{t("assignments.form_instructions_label")}</span>
              <textarea
                name="instructions"
                className="input-field min-h-48"
                placeholder={t("assignments.form_instructions_placeholder")}
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700 md:max-w-sm">
              <span>{t("assignments.form_due_label")}</span>
              <input name="dueAt" className="input-field" type="datetime-local" />
            </label>
            <button type="submit" className="btn-primary w-fit">
              {t("assignments.form_submit")}
            </button>
          </form>
        </section>
      ) : null}

      <section className="surface-card space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">{t("assignments.current_heading")}</h2>
          <p className="text-sm text-slate-600">
            {canManage
              ? t("assignments.current_help_admin")
              : t("assignments.current_help_student")}
          </p>
        </div>

        <div className="space-y-3">
          {assignments.length > 0 ? (
            assignments.map((assignment) => (
              <article key={assignment.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-900">{assignment.title}</h3>
                    <p className="text-xs text-slate-500">
                      {t("assignments.posted_by", {
                        author: assignment.createdByUser.name ?? assignment.createdByUser.email
                      })}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("assignments.due_label")}{" "}
                    {formatDate(assignment.dueAt, locale, t("assignments.no_due"))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                  {assignment.instructions}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {t("assignments.empty_state")}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
