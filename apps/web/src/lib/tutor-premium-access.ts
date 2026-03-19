import type { PrismaClient, Role } from "@arcmath/db";
import { buildRealTutorUsableProblemSetWhere } from "@/lib/tutor-usable-sets";

type MinimalSessionUser = {
  id: string;
  role?: Role | string;
} | null | undefined;

function isAdmin(user: MinimalSessionUser): boolean {
  return user?.role === "ADMIN";
}

export async function listGrantedRealTutorProblemSetIds(prisma: PrismaClient, userId: string): Promise<string[]> {
  const rows = await prisma.userResourceAccess.findMany({
    where: {
      userId,
      problemSet: buildRealTutorUsableProblemSetWhere()
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

  if (isAdmin(params.user)) {
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
    where: buildRealTutorUsableProblemSetWhere(),
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
