export type ResourceAccessDecision = {
  isMember: boolean;
  allowed: boolean;
  grantedNow: boolean;
  used: number;
  remaining: number | null;
  freeLimit: number;
  trackingAvailable: boolean;
};

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2021"
  );
}

export async function getGrantedProblemSetIds(options: {
  prisma: any;
  userId: string;
}): Promise<string[] | null> {
  try {
    const rows = await options.prisma.userResourceAccess.findMany({
      where: { userId: options.userId },
      select: { problemSetId: true }
    });
    return rows.map((row: { problemSetId: string }) => row.problemSetId);
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getResourceAccessDecision(options: {
  prisma: any;
  userId: string;
  problemSetId: string;
  hasMembership: boolean;
  freeLimit: number;
}): Promise<ResourceAccessDecision> {
  if (options.hasMembership) {
    return {
      isMember: true,
      allowed: true,
      grantedNow: false,
      used: 0,
      remaining: null,
      freeLimit: options.freeLimit,
      trackingAvailable: true
    };
  }

  try {
    return await options.prisma.$transaction(async (tx: any) => {
      const existing = await tx.userResourceAccess.findUnique({
        where: {
          userId_problemSetId: {
            userId: options.userId,
            problemSetId: options.problemSetId
          }
        }
      });

      const used = await tx.userResourceAccess.count({
        where: { userId: options.userId }
      });

      if (existing) {
        return {
          isMember: false,
          allowed: true,
          grantedNow: false,
          used,
          remaining: Math.max(0, options.freeLimit - used),
          freeLimit: options.freeLimit,
          trackingAvailable: true
        } satisfies ResourceAccessDecision;
      }

      if (used >= options.freeLimit) {
        return {
          isMember: false,
          allowed: false,
          grantedNow: false,
          used,
          remaining: 0,
          freeLimit: options.freeLimit,
          trackingAvailable: true
        } satisfies ResourceAccessDecision;
      }

      await tx.userResourceAccess.create({
        data: {
          userId: options.userId,
          problemSetId: options.problemSetId
        }
      });

      return {
        isMember: false,
        allowed: true,
        grantedNow: true,
        used: used + 1,
        remaining: Math.max(0, options.freeLimit - (used + 1)),
        freeLimit: options.freeLimit,
        trackingAvailable: true
      } satisfies ResourceAccessDecision;
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        isMember: false,
        allowed: true,
        grantedNow: false,
        used: 0,
        remaining: options.freeLimit,
        freeLimit: options.freeLimit,
        trackingAvailable: false
      };
    }
    throw error;
  }
}

export async function checkResourceAccessDecision(options: {
  prisma: any;
  userId: string;
  problemSetId: string;
  hasMembership: boolean;
  freeLimit: number;
}): Promise<ResourceAccessDecision> {
  if (options.hasMembership) {
    return {
      isMember: true,
      allowed: true,
      grantedNow: false,
      used: 0,
      remaining: null,
      freeLimit: options.freeLimit,
      trackingAvailable: true
    };
  }

  try {
    const [existing, used] = await Promise.all([
      options.prisma.userResourceAccess.findUnique({
        where: {
          userId_problemSetId: {
            userId: options.userId,
            problemSetId: options.problemSetId
          }
        }
      }),
      options.prisma.userResourceAccess.count({
        where: { userId: options.userId }
      })
    ]);

    if (existing) {
      return {
        isMember: false,
        allowed: true,
        grantedNow: false,
        used,
        remaining: Math.max(0, options.freeLimit - used),
        freeLimit: options.freeLimit,
        trackingAvailable: true
      };
    }

    if (used >= options.freeLimit) {
      return {
        isMember: false,
        allowed: false,
        grantedNow: false,
        used,
        remaining: 0,
        freeLimit: options.freeLimit,
        trackingAvailable: true
      };
    }

    return {
      isMember: false,
      allowed: true,
      grantedNow: false,
      used,
      remaining: Math.max(0, options.freeLimit - used),
      freeLimit: options.freeLimit,
      trackingAvailable: true
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        isMember: false,
        allowed: true,
        grantedNow: false,
        used: 0,
        remaining: options.freeLimit,
        freeLimit: options.freeLimit,
        trackingAvailable: false
      };
    }
    throw error;
  }
}

export async function consumeResourceAccessDecision(options: {
  prisma: any;
  userId: string;
  problemSetId: string;
  hasMembership: boolean;
  freeLimit: number;
}): Promise<ResourceAccessDecision> {
  return getResourceAccessDecision(options);
}
