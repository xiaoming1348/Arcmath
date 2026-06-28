import type { PrismaClient, Role } from "@arcmath/db";
import { buildRealExamProblemSetWhere } from "@/lib/tutor-usable-sets";
import { isPlatformOperator } from "@/lib/platform-operator";

type MinimalSessionUser = {
  id: string;
  role?: Role | string;
  email?: string | null;
} | null | undefined;

// Platform-operator bypass via PLATFORM_OPERATOR_EMAILS env var. Was
// previously gated on User.role === "ADMIN", which conflated platform
// operator with the org-internal "ADMIN" role and would let an org
// admin see any premium real-exam set across the platform. The
// allowlist keeps platform power explicitly deployment-scoped.
function isOperator(user: MinimalSessionUser): boolean {
  return isPlatformOperator(user?.email);
}

// When this env flag is truthy, premium/resource-access gating is short-circuited
// and all authenticated users can access any real-exam / premium problem set.
// Intended for local dev and QA; leave unset in production.
function isAccessGatingDisabled(): boolean {
  const flag = process.env.DISABLE_ACCESS_GATING?.trim().toLowerCase() ?? "";
  return flag === "1" || flag === "true" || flag === "yes";
}

export async function listGrantedRealTutorProblemSetIds(prisma: PrismaClient, userId: string): Promise<string[]> {
  const rows = await prisma.userResourceAccess.findMany({
    where: {
      userId,
      problemSet: buildRealExamProblemSetWhere()
    },
    select: {
      problemSetId: true
    }
  });

  return rows.map((row) => row.problemSetId);
}

export async function userCanAccessRealTutorProblemSet(params: {
  prisma: PrismaClient;
  user: MinimalSessionUser;
  problemSetId: string;
}): Promise<boolean> {
  if (!params.user) {
    return false;
  }

  if (isAccessGatingDisabled()) {
    return true;
  }

  if (isOperator(params.user)) {
    return true;
  }

  const grant = await params.prisma.userResourceAccess.findUnique({
    where: {
      userId_problemSetId: {
        userId: params.user.id,
        problemSetId: params.problemSetId
      }
    },
    select: {
      id: true
    }
  });

  return Boolean(grant);
}

export async function grantAllLiveRealTutorProblemSets(params: {
  prisma: PrismaClient;
  userId: string;
}): Promise<number> {
  const sets = await params.prisma.problemSet.findMany({
    where: buildRealExamProblemSetWhere(),
    select: {
      id: true
    }
  });

  if (sets.length === 0) {
    return 0;
  }

  const result = await params.prisma.userResourceAccess.createMany({
    data: sets.map((set) => ({
      userId: params.userId,
      problemSetId: set.id
    })),
    skipDuplicates: true
  });

  return result.count;
}
