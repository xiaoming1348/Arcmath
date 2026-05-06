import Link from "next/link";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canManageOrganization, canTeach, getActiveOrganizationMembership } from "@/lib/organizations";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { getOrganizationResourceStorage } from "@/lib/organization-resource-storage";

type ResourcesPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

function summarizeError(code: string | undefined): string | null {
  switch (code) {
    case "title-required":
      return "Title is required.";
    case "content-required":
      return "Add either resource content or an attachment.";
    case "attachment-too-large":
      return "Attachment is too large. Keep uploads under 15 MB for this MVP.";
    case "forbidden":
      return "You do not have permission to manage organization resources.";
    default:
      return null;
  }
}

function formatDate(value: Date): string {
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function ResourcesPage({ searchParams }: ResourcesPageProps) {
  const { created, error } = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fresources");
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership) {
    redirect("/dashboard");
  }

  async function createOrganizationResource(formData: FormData) {
    "use server";

    const currentSession = await getServerSession(authOptions);
    if (!currentSession?.user) {
      redirect("/login?callbackUrl=%2Fresources");
    }

    const currentMembership = await getActiveOrganizationMembership(prisma, currentSession.user.id);
    // Batch-4: open the upload form to TEACHER role too. Course
    // materials (PDFs, docs) and homework files are part of a teacher's
    // day-to-day, so requiring an admin to upload would create
    // unnecessary friction. Visibility is still ORG_ONLY (the
    // OrganizationResource model is per-org), so a teacher can never
    // leak materials to another school.
    if (!currentMembership || !canTeach(currentMembership.role)) {
      redirect("/resources?error=forbidden");
    }

    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const content = String(formData.get("content") ?? "").trim();
    const attachment = formData.get("attachment");

    if (!title) {
      redirect("/resources?error=title-required");
    }

    const uploadedFile =
      attachment instanceof File && attachment.size > 0
        ? attachment
        : null;

    if (!content && !uploadedFile) {
      redirect("/resources?error=content-required");
    }

    if (uploadedFile && uploadedFile.size > 15 * 1024 * 1024) {
      redirect("/resources?error=attachment-too-large");
    }

    const resource = await prisma.organizationResource.create({
      data: {
        organizationId: currentMembership.organizationId,
        createdByUserId: currentSession.user.id,
        title,
        description,
        content
      },
      select: {
        id: true
      }
    });

    if (uploadedFile) {
      const storage = getOrganizationResourceStorage();
      const bytes = Buffer.from(await uploadedFile.arrayBuffer());
      const stored = await storage.putFile(resource.id, uploadedFile.name, uploadedFile.type || "application/octet-stream", bytes);

      await prisma.organizationResource.update({
        where: {
          id: resource.id
        },
        data: {
          attachmentLocator: stored.locator,
          attachmentFilename: uploadedFile.name,
          attachmentMimeType: uploadedFile.type || "application/octet-stream",
          attachmentSize: stored.size,
          attachmentSha256: stored.sha256
        }
      });
    }

    revalidatePath("/resources");
    revalidatePath("/dashboard");
    revalidatePath("/org");
    redirect("/resources?created=1");
  }

  const [organization, resources] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: membership.organizationId },
      select: {
        id: true,
        name: true
      }
    }),
    prisma.organizationResource.findMany({
      where: {
        organizationId: membership.organizationId
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" }
      ],
      select: {
        id: true,
        title: true,
        description: true,
        content: true,
        attachmentFilename: true,
        attachmentMimeType: true,
        attachmentSize: true,
        createdAt: true,
        updatedAt: true,
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
  // Teacher (or above) can upload materials. Students see the list
  // read-only.
  const canUpload = canTeach(membership.role);
  void canManage;

  const locale = await resolveLocale();
  const t = translator(locale);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">{t("resources.title")}</h1>
            <p className="text-sm text-slate-600">{t("resources.subtitle")}</p>
            <p className="text-xs text-slate-500">{organization.name}</p>
          </div>
        </div>

        {created ? <p className="text-sm text-emerald-700">{t("resources.created_success")}</p> : null}
        {summarizeError(error) ? <p className="text-sm text-red-600">{summarizeError(error)}</p> : null}
      </section>

      {canUpload ? (
        <section className="surface-card space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">{t("resources.publish_heading")}</h2>
            <p className="text-sm text-slate-600">{t("resources.publish_help")}</p>
          </div>

          <form action={createOrganizationResource} className="grid gap-3">
            <label className="space-y-2 text-sm text-slate-700">
              <span>{t("resources.title_label")}</span>
              <input name="title" className="input-field" type="text" />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>{t("resources.description_label")}</span>
              <input name="description" className="input-field" type="text" />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>{t("resources.content_label")}</span>
              <textarea name="content" className="input-field min-h-48" />
            </label>
            <label className="space-y-2 text-sm text-slate-700 md:max-w-md">
              <span>{t("resources.attachment_label")}</span>
              <input name="attachment" className="input-field" type="file" />
            </label>
            <button type="submit" className="btn-primary w-fit">
              {t("resources.publish_submit")}
            </button>
          </form>
        </section>
      ) : null}

      <section className="surface-card space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">{t("resources.published_heading")}</h2>
          <p className="text-sm text-slate-600">
            {canUpload
              ? t("resources.published_help_uploader")
              : t("resources.published_help_viewer")}
          </p>
        </div>

        <div className="space-y-3">
          {resources.length > 0 ? (
            resources.map((resource) => (
              <article key={resource.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-slate-900">{resource.title}</h3>
                  {resource.description ? <p className="text-sm text-slate-600">{resource.description}</p> : null}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                  {resource.content || "Attachment-only resource."}
                </div>
                {resource.attachmentFilename ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">{resource.attachmentFilename}</p>
                      <p className="text-xs text-slate-500">
                        {resource.attachmentMimeType || "file"}{resource.attachmentSize ? ` · ${Math.ceil(resource.attachmentSize / 1024)} KB` : ""}
                      </p>
                    </div>
                    <Link className="btn-secondary" href={`/api/org-resources/${resource.id}/download`}>
                      {t("resources.attachment_link")}
                    </Link>
                  </div>
                ) : null}
                <p className="text-xs text-slate-500">
                  {t("resources.posted_by")} {resource.createdByUser.name ?? resource.createdByUser.email} · {t("resources.posted_at")} {formatDate(resource.updatedAt)}
                </p>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {t("resources.no_resources")}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
