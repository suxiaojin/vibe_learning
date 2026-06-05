import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMedalLevel, getMedalRule } from "@/lib/rewards";
import { createUserEventNotification } from "@/lib/user-event-notifications";

const buddyRequestValidDays = 30;
const withdrawnReapplyCooldownDays = 30;

type BuddyClient = Prisma.TransactionClient;

export type BuddyRelationshipAction =
  | "self"
  | "none"
  | "active"
  | "outgoing_pending"
  | "incoming_pending"
  | "outgoing_withdraw_cooldown"
  | "terminated";

export type BuddyRelationshipView = {
  action: BuddyRelationshipAction;
  pairId?: string;
  requestId?: string;
  reapplyAllowedAt?: Date | null;
  terminalStatus?: "rejected" | "removed";
};

export type BuddySearchFilters = {
  birthYear?: number;
  birthMonth?: number;
  gender?: "male" | "female";
  schoolId?: string;
  majorId?: string;
  province?: string;
  studySystem?: string;
  cursor?: string;
  limit?: number;
};

export class BuddyError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "BuddyError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function getBuddyPairUserIds(leftUserId: string, rightUserId: string) {
  if (!leftUserId || !rightUserId || leftUserId === rightUserId) {
    throw new BuddyError("BUDDY_SELF_NOT_ALLOWED", "不能添加自己为搭子。");
  }
  return leftUserId < rightUserId
    ? { userAId: leftUserId, userBId: rightUserId }
    : { userAId: rightUserId, userBId: leftUserId };
}

export async function getBuddyList(userId: string) {
  const pairs = await prisma.buddyPair.findMany({
    where: {
      status: "active",
      OR: [{ userAId: userId }, { userBId: userId }]
    },
    include: {
      userA: { include: { studentProfile: true } },
      userB: { include: { studentProfile: true } }
    },
    orderBy: { activeSince: "desc" }
  });

  return pairs.map((pair) => {
    const other = pair.userAId === userId ? pair.userB : pair.userA;
    return {
      pairId: pair.id,
      activeSince: pair.activeSince,
      user: toBasicUser(other)
    };
  });
}

export async function getActiveBuddyIds(userId: string) {
  const pairs = await prisma.buddyPair.findMany({
    where: {
      status: "active",
      OR: [{ userAId: userId }, { userBId: userId }]
    },
    select: { userAId: true, userBId: true }
  });

  return pairs.map((pair) => (pair.userAId === userId ? pair.userBId : pair.userAId));
}

export async function areActiveBuddies(leftUserId: string, rightUserId: string) {
  if (leftUserId === rightUserId) {
    return true;
  }
  const pairIds = getBuddyPairUserIds(leftUserId, rightUserId);
  const pair = await prisma.buddyPair.findUnique({
    where: { userAId_userBId: pairIds },
    select: { status: true }
  });
  return pair?.status === "active";
}

export async function searchBuddyCandidates(userId: string, filters: BuddySearchFilters) {
  const normalized = normalizeSearchFilters(filters);
  if (Object.keys(normalized.activeFilters).length === 0) {
    throw new BuddyError("BUDDY_SEARCH_EMPTY_FILTERS", "请至少选择一个搜索条件。");
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      region: { select: { province: true, studySystem: true } }
    }
  });
  const missingFields = getMissingSearchFields(profile, normalized.activeFilters);
  if (missingFields.length > 0) {
    throw new BuddyError("BUDDY_SEARCH_PROFILE_INCOMPLETE", "请先完善对应资料后再使用该筛选条件。", 400, { missingFields });
  }

  const profileWhere: Prisma.StudentProfileWhereInput = {
    allowBuddySearch: true
  };
  if (normalized.activeFilters.birthYear && normalized.activeFilters.birthMonth) {
    profileWhere.birthYear = normalized.activeFilters.birthYear;
    profileWhere.birthMonth = normalized.activeFilters.birthMonth;
  }
  if (normalized.activeFilters.gender) {
    profileWhere.gender = normalized.activeFilters.gender;
  }
  if (normalized.activeFilters.schoolId) {
    profileWhere.schoolId = normalized.activeFilters.schoolId;
  }
  if (normalized.activeFilters.majorId) {
    profileWhere.majorId = normalized.activeFilters.majorId;
  }
  if (normalized.activeFilters.province || normalized.activeFilters.studySystem) {
    profileWhere.region = {
      is: {
        ...(normalized.activeFilters.province ? { province: normalized.activeFilters.province } : {}),
        ...(normalized.activeFilters.studySystem ? { studySystem: normalized.activeFilters.studySystem } : {})
      }
    };
  }

  const limit = normalized.limit;
  const candidates = await prisma.user.findMany({
    where: {
      id: { not: userId },
      role: "student",
      status: "active",
      studentProfile: {
        is: profileWhere
      },
      NOT: [
        {
          buddyPairsAsA: {
            some: {
              userBId: userId,
              status: { in: ["active", "rejected", "removed"] }
            }
          }
        },
        {
          buddyPairsAsB: {
            some: {
              userAId: userId,
              status: { in: ["active", "rejected", "removed"] }
            }
          }
        }
      ]
    },
    include: {
      studentProfile: {
        include: {
          region: { select: { province: true, studySystem: true } },
          major: { select: { name: true } },
          schoolOption: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" },
    ...(normalized.cursor ? { cursor: { id: normalized.cursor }, skip: 1 } : {}),
    take: limit + 1
  });

  const pageItems = candidates.slice(0, limit);
  const pairStates = await getRelationshipViewsForTargets(userId, pageItems.map((candidate) => candidate.id));

  return {
    items: pageItems.map((candidate) => ({
      user: toSearchUser(candidate),
      relationship: pairStates.get(candidate.id) || { action: "none" as const }
    })),
    nextCursor: candidates.length > limit ? candidates[limit].id : null
  };
}

export async function getBuddyRelationship(viewerId: string, targetId: string): Promise<BuddyRelationshipView> {
  if (viewerId === targetId) {
    return { action: "self" };
  }
  const pairIds = getBuddyPairUserIds(viewerId, targetId);
  const pair = await prisma.buddyPair.findUnique({
    where: { userAId_userBId: pairIds },
    include: {
      requests: {
        where: {
          OR: [
            { status: "pending" },
            {
              status: "withdrawn",
              requesterId: viewerId,
              reapplyAllowedAt: { gt: new Date() }
            }
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });

  return getRelationshipViewFromPair(pair, viewerId, targetId);
}

export async function getPublicStudentProfile(viewerId: string, targetId: string) {
  const [target, totalAttempts, relationship] = await Promise.all([
    prisma.user.findFirst({
      where: { id: targetId, role: "student", status: "active" },
      include: {
        studentProfile: {
          include: {
            schoolOption: true,
            major: true,
            region: true
          }
        },
        diamondAccount: true
      }
    }),
    prisma.questionAttempt.count({ where: { userId: targetId } }),
    getBuddyRelationship(viewerId, targetId)
  ]);

  if (!target) {
    throw new BuddyError("BUDDY_TARGET_UNAVAILABLE", "用户不存在或暂不可访问。", 404);
  }

  const medal = getMedalRule(getMedalLevel(totalAttempts));
  return {
    user: {
      ...toBasicUser(target),
      joinedYear: target.createdAt.getFullYear(),
      diamondBalance: target.diamondAccount?.balance || 0,
      medalLevel: medal.level,
      medalLabel: medal.label,
      gender: target.studentProfile?.gender || null
    },
    relationship,
    canViewPosts: relationship.action === "self" || relationship.action === "active"
  };
}

export async function createBuddyRequest(requesterId: string, recipientId: string) {
  return prisma.$transaction(async (tx) => {
    const [requester, recipient] = await Promise.all([
      assertActiveStudent(tx, requesterId),
      assertActiveStudent(tx, recipientId)
    ]);
    if (requester.id === recipient.id) {
      throw new BuddyError("BUDDY_SELF_NOT_ALLOWED", "不能添加自己为搭子。");
    }

    const pair = await getOrCreateBuddyPair(tx, requester.id, recipient.id);
    await lockBuddyPair(tx, pair.id);
    await expirePendingRequestsForPair(tx, pair.id);

    const currentPair = await tx.buddyPair.findUniqueOrThrow({
      where: { id: pair.id }
    });
    if (currentPair.status === "active") {
      throw new BuddyError("BUDDY_ALREADY_ACTIVE", "你们已经是搭子了。");
    }
    if (currentPair.status === "rejected" || currentPair.status === "removed") {
      throw new BuddyError("BUDDY_RELATIONSHIP_TERMINATED", "双方已经不能再次建立搭子关系。");
    }

    const pending = await tx.buddyRequest.findFirst({
      where: { pairId: pair.id, status: "pending" },
      orderBy: { createdAt: "desc" }
    });
    if (pending) {
      if (pending.requesterId === requester.id) {
        throw new BuddyError("BUDDY_REQUEST_PENDING", "申请已发送，等待对方处理。", 409, { requestId: pending.id });
      }
      throw new BuddyError("BUDDY_REQUEST_REVERSED_PENDING", "对方已经申请你为搭子，请直接处理现有申请。", 409, { requestId: pending.id });
    }

    const cooldown = await tx.buddyRequest.findFirst({
      where: {
        pairId: pair.id,
        requesterId: requester.id,
        status: "withdrawn",
        reapplyAllowedAt: { gt: new Date() }
      },
      orderBy: { reapplyAllowedAt: "desc" }
    });
    if (cooldown) {
      throw new BuddyError("BUDDY_REQUEST_WITHDRAW_COOLDOWN", "撤回申请后 30 天内不能再次申请该用户。", 409, {
        reapplyAllowedAt: cooldown.reapplyAllowedAt
      });
    }

    const created = await tx.buddyRequest.create({
      data: {
        pairId: pair.id,
        requesterId: requester.id,
        recipientId: recipient.id,
        expiresAt: addDays(new Date(), buddyRequestValidDays)
      }
    });
    await createUserEventNotification(tx, {
      recipientId: recipient.id,
      actorId: requester.id,
      type: "buddy_request_received",
      requestId: created.id,
      dedupeKey: `buddy-request:${created.id}:received`
    });

    return created;
  });
}

export async function acceptBuddyRequest(actorId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await getActionableRequest(tx, actorId, requestId, "recipient");
    await lockBuddyPair(tx, request.pairId);
    await assertRequestStillPending(tx, request.id);

    const now = new Date();
    await tx.buddyRequest.update({
      where: { id: request.id },
      data: { status: "accepted", respondedAt: now }
    });
    await tx.buddyPair.update({
      where: { id: request.pairId },
      data: {
        status: "active",
        activeSince: now,
        terminalAt: null,
        terminalById: null
      }
    });
    await createUserEventNotification(tx, {
      recipientId: request.requesterId,
      actorId,
      type: "buddy_request_accepted",
      requestId: request.id,
      dedupeKey: `buddy-request:${request.id}:accepted`
    });

    return request;
  });
}

export async function rejectBuddyRequest(actorId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await getActionableRequest(tx, actorId, requestId, "recipient");
    await lockBuddyPair(tx, request.pairId);
    await assertRequestStillPending(tx, request.id);

    const now = new Date();
    await tx.buddyRequest.update({
      where: { id: request.id },
      data: { status: "rejected", respondedAt: now }
    });
    await tx.buddyPair.update({
      where: { id: request.pairId },
      data: {
        status: "rejected",
        activeSince: null,
        terminalAt: now,
        terminalById: actorId
      }
    });
    await createUserEventNotification(tx, {
      recipientId: request.requesterId,
      actorId,
      type: "buddy_request_rejected",
      requestId: request.id,
      dedupeKey: `buddy-request:${request.id}:rejected`
    });

    return request;
  });
}

export async function withdrawBuddyRequest(actorId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await getActionableRequest(tx, actorId, requestId, "requester");
    await lockBuddyPair(tx, request.pairId);
    await assertRequestStillPending(tx, request.id);

    const now = new Date();
    return tx.buddyRequest.update({
      where: { id: request.id },
      data: {
        status: "withdrawn",
        withdrawnAt: now,
        reapplyAllowedAt: addDays(now, withdrawnReapplyCooldownDays)
      }
    });
  });
}

export async function removeBuddy(actorId: string, buddyUserId: string) {
  return prisma.$transaction(async (tx) => {
    const pairIds = getBuddyPairUserIds(actorId, buddyUserId);
    const pair = await tx.buddyPair.findUnique({
      where: { userAId_userBId: pairIds }
    });
    if (!pair || pair.status !== "active") {
      throw new BuddyError("BUDDY_NOT_ACTIVE", "你们当前不是搭子关系。", 404);
    }
    await lockBuddyPair(tx, pair.id);

    return tx.buddyPair.update({
      where: { id: pair.id },
      data: {
        status: "removed",
        activeSince: null,
        terminalAt: new Date(),
        terminalById: actorId
      }
    });
  });
}

export async function expireDueBuddyRequests(limit = 100) {
  const requests = await prisma.buddyRequest.findMany({
    where: {
      status: "pending",
      expiresAt: { lte: new Date() }
    },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: limit
  });
  if (requests.length === 0) {
    return 0;
  }
  const result = await prisma.buddyRequest.updateMany({
    where: { id: { in: requests.map((request) => request.id) }, status: "pending" },
    data: {
      status: "expired",
      expiredAt: new Date()
    }
  });
  return result.count;
}

export function formatBuddyError(error: unknown) {
  if (error instanceof BuddyError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details
    };
  }
  return null;
}

async function getRelationshipViewsForTargets(userId: string, targetIds: string[]) {
  const result = new Map<string, BuddyRelationshipView>();
  if (targetIds.length === 0) {
    return result;
  }

  const pairs = await prisma.buddyPair.findMany({
    where: {
      OR: [
        { userAId: userId, userBId: { in: targetIds } },
        { userBId: userId, userAId: { in: targetIds } }
      ]
    },
    include: {
      requests: {
        where: {
          OR: [
            { status: "pending" },
            {
              status: "withdrawn",
              requesterId: userId,
              reapplyAllowedAt: { gt: new Date() }
            }
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });

  for (const pair of pairs) {
    const targetId = pair.userAId === userId ? pair.userBId : pair.userAId;
    result.set(targetId, getRelationshipViewFromPair(pair, userId, targetId));
  }
  return result;
}

function getRelationshipViewFromPair(
  pair: (Prisma.BuddyPairGetPayload<{ include: { requests: true } }> | null),
  viewerId: string,
  targetId: string
): BuddyRelationshipView {
  if (viewerId === targetId) {
    return { action: "self" };
  }
  if (!pair) {
    return { action: "none" };
  }
  if (pair.status === "active") {
    return { action: "active", pairId: pair.id };
  }
  if (pair.status === "rejected" || pair.status === "removed") {
    return { action: "terminated", pairId: pair.id, terminalStatus: pair.status };
  }

  const now = new Date();
  const pending = pair.requests.find((request) => request.status === "pending" && request.expiresAt > now);
  if (pending) {
    return {
      action: pending.requesterId === viewerId ? "outgoing_pending" : "incoming_pending",
      pairId: pair.id,
      requestId: pending.id
    };
  }

  const cooldown = pair.requests.find(
    (request) => request.status === "withdrawn" && request.requesterId === viewerId && request.reapplyAllowedAt && request.reapplyAllowedAt > now
  );
  if (cooldown) {
    return {
      action: "outgoing_withdraw_cooldown",
      pairId: pair.id,
      reapplyAllowedAt: cooldown.reapplyAllowedAt
    };
  }

  return { action: "none", pairId: pair.id };
}

async function getOrCreateBuddyPair(tx: BuddyClient, leftUserId: string, rightUserId: string) {
  const pairIds = getBuddyPairUserIds(leftUserId, rightUserId);
  const existing = await tx.buddyPair.findUnique({
    where: { userAId_userBId: pairIds }
  });
  if (existing) {
    return existing;
  }

  try {
    return await tx.buddyPair.create({ data: pairIds });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    return tx.buddyPair.findUniqueOrThrow({ where: { userAId_userBId: pairIds } });
  }
}

async function lockBuddyPair(tx: BuddyClient, pairId: string) {
  await tx.$queryRaw`SELECT "id" FROM "buddy_pairs" WHERE "id" = ${pairId} FOR UPDATE`;
}

async function expirePendingRequestsForPair(tx: BuddyClient, pairId: string) {
  await tx.buddyRequest.updateMany({
    where: {
      pairId,
      status: "pending",
      expiresAt: { lte: new Date() }
    },
    data: {
      status: "expired",
      expiredAt: new Date()
    }
  });
}

async function getActionableRequest(
  tx: BuddyClient,
  actorId: string,
  requestId: string,
  role: "requester" | "recipient"
) {
  const request = await tx.buddyRequest.findUnique({
    where: { id: requestId }
  });
  if (!request) {
    throw new BuddyError("BUDDY_REQUEST_NOT_FOUND", "申请不存在。", 404);
  }
  if (role === "requester" && request.requesterId !== actorId) {
    throw new BuddyError("BUDDY_REQUEST_FORBIDDEN", "不能处理不属于你的申请。", 403);
  }
  if (role === "recipient" && request.recipientId !== actorId) {
    throw new BuddyError("BUDDY_REQUEST_FORBIDDEN", "不能处理不属于你的申请。", 403);
  }
  return request;
}

async function assertRequestStillPending(tx: BuddyClient, requestId: string) {
  const request = await tx.buddyRequest.findUniqueOrThrow({
    where: { id: requestId }
  });
  if (request.status !== "pending") {
    throw new BuddyError("BUDDY_REQUEST_NOT_ACTIONABLE", "该申请当前不能处理。", 409);
  }
  if (request.expiresAt <= new Date()) {
    await tx.buddyRequest.update({
      where: { id: request.id },
      data: {
        status: "expired",
        expiredAt: new Date()
      }
    });
    throw new BuddyError("BUDDY_REQUEST_NOT_ACTIONABLE", "该申请已过期。", 409);
  }
}

async function assertActiveStudent(tx: BuddyClient, userId: string) {
  const user = await tx.user.findFirst({
    where: { id: userId, role: "student", status: "active" },
    include: { studentProfile: true }
  });
  if (!user) {
    throw new BuddyError("BUDDY_TARGET_UNAVAILABLE", "用户不存在或暂不可添加。", 404);
  }
  return user;
}

function normalizeSearchFilters(filters: BuddySearchFilters) {
  const activeFilters: BuddySearchFilters = {};
  if (Number.isInteger(filters.birthYear) && Number.isInteger(filters.birthMonth)) {
    activeFilters.birthYear = filters.birthYear;
    activeFilters.birthMonth = filters.birthMonth;
  }
  if (filters.gender === "male" || filters.gender === "female") {
    activeFilters.gender = filters.gender;
  }
  if (filters.schoolId) {
    activeFilters.schoolId = filters.schoolId;
  }
  if (filters.majorId) {
    activeFilters.majorId = filters.majorId;
  }
  if (filters.province) {
    activeFilters.province = filters.province;
  }
  if (filters.studySystem) {
    activeFilters.studySystem = filters.studySystem;
  }

  return {
    activeFilters,
    cursor: filters.cursor,
    limit: Math.max(1, Math.min(filters.limit || 20, 50))
  };
}

function getMissingSearchFields(
  profile: (Prisma.StudentProfileGetPayload<{ include: { region: { select: { province: true; studySystem: true } } } }> | null),
  filters: BuddySearchFilters
) {
  const missing: string[] = [];
  if ((filters.birthYear || filters.birthMonth) && (!profile?.birthYear || !profile?.birthMonth)) {
    missing.push("出生年月");
  }
  if (filters.gender && !profile?.gender) {
    missing.push("性别");
  }
  if (filters.schoolId && !profile?.schoolId) {
    missing.push("学校");
  }
  if (filters.majorId && !profile?.majorId) {
    missing.push("专业");
  }
  if ((filters.province || filters.studySystem) && !profile?.regionId) {
    missing.push("省份/学制");
  }
  return missing;
}

function toBasicUser(user: {
  id: string;
  username: string;
  createdAt?: Date;
  studentProfile?: {
    nickname: string | null;
    avatarImage: string | null;
    avatarColor: string | null;
    gender?: "male" | "female" | null;
  } | null;
}) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.studentProfile?.nickname || user.username,
    avatarImage: user.studentProfile?.avatarImage || "",
    avatarColor: user.studentProfile?.avatarColor || "green",
    gender: user.studentProfile?.gender || null
  };
}

function toSearchUser(user: Prisma.UserGetPayload<{
  include: {
    studentProfile: {
      include: {
        region: { select: { province: true; studySystem: true } };
        major: { select: { name: true } };
        schoolOption: { select: { name: true } };
      };
    };
  };
}>) {
  return {
    ...toBasicUser(user),
    schoolName: user.studentProfile?.schoolOption?.name || user.studentProfile?.school || null,
    majorName: user.studentProfile?.major?.name || null,
    province: user.studentProfile?.region?.province || null,
    studySystem: user.studentProfile?.region?.studySystem || null
  };
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
