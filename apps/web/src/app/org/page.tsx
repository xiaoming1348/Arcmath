import bcrypt from "bcryptjs";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canManageOrganization, getActiveOrganizationMembership } from "@/lib/organizations";
import { withPepper } from "@/lib/password";

type OrganizationPageProps = {
  searchParams: Promise<{
    created?: string;
    added?: string;
    error?: string;
  }>;
};

function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function summarizeError(code: string | undefined): string | null {
  switch (code) {
    case "already-member":
      return "Your account already belongs to an active organization.";
    case "org-name-required":
      return "Organization name is required.";
    case "member-email-required":
      return "Member email is required.";
    case "member-password-short":
      return "Member password must be at least 8 characters.";
    case "member-exists":
      return "That email is already registered. For this MVP, org admins can only create new accounts here.";
    case "admin-seat-limit":
      return "This trial organization has already used all 5 admin seats.";
    case "student-seat-limit":
      return "This trial organization has already used all 30 student seats.";
    case "forbidden":
      return "You do not have permission to manage this organization.";
    default:
      return null;
  }
}

function formatDate(value: Date | null): string {
  if (!value) {
    return "Not completed";
  }

  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function OrganizationPage({ searchParams }: OrganizationPageProps) {
  const { created, added, error } = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Forg");
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);

  async function createTrialOrganization(formData: FormData) {
    "use server";

    const currentSession = await getServerSession(authOptions);
    if (!currentSession?.user) {
      redirect("/login?callbackUrl=%2Forg");
    }

    const existingMembership = await getActiveOrganizationMembership(prisma, currentSession.user.id);
    if (existingMembership) {
      redirect("/org?error=already-member");
    }

    const rawName = String(formData.get("organizationName") ?? "").trim();
    if (!rawName) {
      redirect("/org?error=org-name-required");
    }

    const baseSlug = slugifyOrganizationName(rawName) || `org-${Date.now()}`;
    let slug = baseSlug;
    let suffix = 2;

    while (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.organization.create({
        data: {
          name: rawName,
          slug,
          trialEndsAt
        }
      })
    ]);

    const organization = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true }
    });

    if (!organization) {
      redirect("/org?error=org-name-required");
    }

    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: currentSession.user.id,
        role: "OWNER",
        status: "ACTIVE"
      }
    });

    revalidatePath("/org");
    redirect("/org?created=1");
  }

  async function createOrganizationMember(formData: FormData) {
    "use server";

    const currentSession = await getServerSession(authOptions);
    if (!currentSession?.user) {
      redirect("/login?callbackUrl=%2Forg");
    }

    const currentMembership = await getActiveOrganizationMembership(prisma, currentSession.user.id);
    if (!currentMembership || !canManageOrganization(currentMembership.role)) {
      redirect("/org?error=forbidden");
    }

    const email = String(formData.get("email") ?? "").toLowerCase().trim();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim() || null;
    const role = String(formData.get("memberRole") ?? "STUDENT") === "ADMIN" ? "ADMIN" : "STUDENT";

    if (!email) {
      redirect("/org?error=member-email-required");
    }

    if (password.length < 8) {
      redirect("/org?error=member-password-short");
    }

    const org = await prisma.organization.findUnique({
      where: {
        id: currentMembership.organizationId
      },
      select: {
        id: true,
        maxAdminSeats: true,
        maxStudentSeats: true,
        memberships: {
          where: {
            status: "ACTIVE"
          },
          select: {
            role: true
          }
        }
      }
    });

    if (!org) {
      redirect("/org?error=forbidden");
    }

    const activeAdminCount = org.memberships.filter((member) => member.role === "OWNER" || member.role === "ADMIN").length;
    const activeStudentCount = org.memberships.filter((member) => member.role === "STUDENT").length;

    if (role === "ADMIN" && activeAdminCount >= org.maxAdminSeats) {
      redirect("/org?error=admin-seat-limit");
    }

    if (role === "STUDENT" && activeStudentCount >= org.maxStudentSeats) {
      redirect("/org?error=student-seat-limit");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existingUser) {
      redirect("/org?error=member-exists");
    }

    const passwordHash = await bcrypt.hash(withPepper(password), 10);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: "STUDENT"
        },
        select: {
          id: true
        }
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: currentMembership.organizationId,
          userId: user.id,
          role,
          status: "ACTIVE"
        }
      });
    });

    revalidatePath("/org");
    redirect("/org?added=1");
  }

  if (!membership) {
    return (
      <main className="motion-rise space-y-4">
        <section className="surface-card space-y-3">
          <span className="badge">Organization Trial</span>
          <h1 className="text-2xl font-semibold text-slate-900">Create a trial organization</h1>
          <p className="text-sm text-slate-600">
            Start the institution version with one owner account, up to 5 admin seats, and up to 30 student seats.
          </p>
          {summarizeError(error) ? <p className="text-sm text-red-600">{summarizeError(error)}</p> : null}
          <form action={createTrialOrganization} className="grid gap-3 md:max-w-xl">
            <label className="space-y-2 text-sm text-slate-700">
              <span>Organization name</span>
              <input name="organizationName" className="input-field" type="text" placeholder="Example: North Star Academy" />
            </label>
            <button type="submit" className="btn-primary w-fit">
              Start Free Trial
            </button>
          </form>
        </section>
      </main>
    );
  }

  const organization = await prisma.organization.findUnique({
    where: {
      id: membership.organizationId
    },
    select: {
      id: true,
      name: true,
      slug: true,
      planType: true,
      trialEndsAt: true,
      maxAdminSeats: true,
      maxStudentSeats: true,
      memberships: {
        orderBy: [
          { role: "asc" },
          { createdAt: "asc" }
        ],
        select: {
          id: true,
          role: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      },
      practiceRuns: {
        orderBy: {
          startedAt: "desc"
        },
        take: 15,
        select: {
          id: true,
          startedAt: true,
          completedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          },
          problemSet: {
            select: {
              title: true
            }
          },
          learningReportSnapshot: {
            select: {
              id: true,
              generatedAt: true
            }
          }
        }
      },
      learningReportSnapshots: {
        orderBy: {
          generatedAt: "desc"
        },
        take: 15,
        select: {
          id: true,
          generatedAt: true,
          user: {
            select: {
              email: true,
              name: true
            }
          },
          practiceRun: {
            select: {
              problemSet: {
                select: {
                  title: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!organization) {
    redirect("/org");
  }

  const activeAdminCount = organization.memberships.filter((item) => item.status === "ACTIVE" && (item.role === "OWNER" || item.role === "ADMIN")).length;
  const activeStudentCount = organization.memberships.filter((item) => item.status === "ACTIVE" && item.role === "STUDENT").length;
  const canManage = canManageOrganization(membership.role);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <span className="badge">Organization Trial</span>
            <h1 className="text-2xl font-semibold text-slate-900">{organization.name}</h1>
            <p className="text-sm text-slate-600">
              Trial plan · slug `{organization.slug}` · trial ends {formatDate(organization.trialEndsAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Your role</p>
            <p>{membership.role}</p>
          </div>
        </div>

        {created ? <p className="text-sm text-emerald-700">Trial organization created successfully.</p> : null}
        {added ? <p className="text-sm text-emerald-700">Member account created successfully.</p> : null}
        {summarizeError(error) ? <p className="text-sm text-red-600">{summarizeError(error)}</p> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin seats</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {activeAdminCount} / {organization.maxAdminSeats}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student seats</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {activeStudentCount} / {organization.maxStudentSeats}
            </p>
          </div>
        </div>
      </section>

      {canManage ? (
        <section className="surface-card space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">Create member account</h2>
            <p className="text-sm text-slate-600">
              This MVP creates new organization members directly. Existing site accounts are not linked here yet.
            </p>
          </div>

          <form action={createOrganizationMember} className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              <span>Name</span>
              <input name="name" className="input-field" type="text" placeholder="Student or admin name" />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Email</span>
              <input name="email" className="input-field" type="email" placeholder="student@example.com" />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Password</span>
              <input name="password" className="input-field" type="password" placeholder="At least 8 characters" />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Role</span>
              <select name="memberRole" className="input-field">
                <option value="STUDENT">Student</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Create Member
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {canManage ? (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="surface-card space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Members</h2>
              <div className="space-y-2">
                {organization.memberships.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">
                          <Link className="hover:text-[var(--accent)]" href={`/org/students/${encodeURIComponent(item.user.id)}`}>
                            {item.user.name ?? item.user.email}
                          </Link>
                        </p>
                        <p className="text-sm text-slate-600">{item.user.email}</p>
                      </div>
                      <div className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <p>{item.role}</p>
                        <p>{item.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-card space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Recent practice runs</h2>
              <div className="space-y-2">
                {organization.practiceRuns.length > 0 ? (
                  organization.practiceRuns.map((run) => (
                    <div key={run.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{run.problemSet.title}</p>
                          <p className="text-sm text-slate-600">{run.user.name ?? run.user.email}</p>
                          <p className="text-xs text-slate-500">Started {formatDate(run.startedAt)}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p>{run.completedAt ? "Completed" : "In progress"}</p>
                          {run.learningReportSnapshot ? (
                            <a className="font-semibold text-[var(--accent)]" href={`/org/reports/${run.learningReportSnapshot.id}`}>
                              View report
                            </a>
                          ) : (
                            <p>No snapshot yet</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">No organization-linked runs yet.</p>
                )}
              </div>
            </div>
          </section>

          <section className="surface-card space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Recent report snapshots</h2>
            <div className="space-y-2">
              {organization.learningReportSnapshots.length > 0 ? (
                organization.learningReportSnapshots.map((snapshot) => (
                  <div key={snapshot.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{snapshot.practiceRun.problemSet.title}</p>
                        <p className="text-sm text-slate-600">{snapshot.user.name ?? snapshot.user.email}</p>
                        <p className="text-xs text-slate-500">Generated {formatDate(snapshot.generatedAt)}</p>
                      </div>
                      <a className="btn-secondary" href={`/org/reports/${snapshot.id}`}>
                        Open Snapshot
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">No report snapshots have been generated for this organization yet.</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="surface-card">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Your account is attached to this organization as a student. Organization-level member lists and reports are visible only to org admins.
          </div>
        </section>
      )}
    </main>
  );
}
