import { Prisma } from "@prisma/client";
import { BuddyError } from "@/lib/buddies";
import { prisma } from "@/lib/prisma";
import { getMedalLevel, getMedalRule } from "@/lib/rewards";
import { getSystemSettings } from "@/lib/system-settings";
import { createUserEventNotification } from "@/lib/user-event-notifications";

export type SocialUserSearchResult = Awaited<ReturnType<typeof searchUsersByNickname>>["items"][number];
export type SocialRecommendation = Awaited<ReturnType<typeof listRecommendedFollows>>["items"][number];
export type BlockedUser = Awaited<ReturnType<typeof listBlockedUsers>>["items"][number];

function resolveProfileCoverImage({
  personalImage,
  personalUpdatedAt,
  systemImage,
  systemUpdatedAt
}: {
  personalImage: string;
  personalUpdatedAt: Date | null;
  systemImage: string;
  systemUpdatedAt: Date | null;
}) {
  if (!systemImage) {
    return personalImage;
  }
  if (!personalImage) {
    return systemImage;
  }
  if (!systemUpdatedAt) {
    return personalImage;
  }
  if (!personalUpdatedAt) {
    return systemImage;
  }
  return systemUpdatedAt.getTime() > personalUpdatedAt.getTime() ? systemImage : personalImage;
}

export async function getFollowingIds(userId: string) {
  const follows = await prisma.socialFollow.findMany({
    where: {
      followerId: userId,
      following: {
        role: "student",
        status: "active"
      }
    },
    select: { followingId: true }
  });

  return follows.map((follow) => follow.followingId);
}

export async function getBlockedUserIds(userId: string) {
  const blocks = await prisma.socialBlock.findMany({
    where: { blockerId: userId },
    select: { blockedId: true }
  });

  return blocks.map((block) => block.blockedId);
}

export async function getSocialProfile(viewerId: string, targetId: string) {
  const [target, totalAttempts, postCount, followingCount, followerCount, likedCount, isFollowing, settings] = await Promise.all([
    prisma.user.findFirst({
      where: { id: targetId, role: "student", status: "active" },
      include: {
        studentProfile: {
          include: {
            region: true,
            major: true,
            schoolOption: true
          }
        },
        diamondAccount: true
      }
    }),
    prisma.questionAttempt.count({ where: { userId: targetId } }),
    prisma.buddyPost.count({ where: { authorId: targetId, deletedAt: null } }),
    prisma.socialFollow.count({ where: { followerId: targetId } }),
    prisma.socialFollow.count({ where: { followingId: targetId } }),
    prisma.buddyPostLike.count({
      where: {
        active: true,
        post: {
          authorId: targetId,
          deletedAt: null
        }
      }
    }),
    viewerId === targetId
      ? Promise.resolve(false)
      : prisma.socialFollow.count({ where: { followerId: viewerId, followingId: targetId } }),
    getSystemSettings()
  ]);

  if (!target) {
    throw new BuddyError("SOCIAL_PROFILE_NOT_FOUND", "用户不存在或暂不可访问。", 404);
  }

  const medal = getMedalRule(getMedalLevel(totalAttempts));
  const coverImage = resolveProfileCoverImage({
    personalImage: target.studentProfile?.coverImage || "",
    personalUpdatedAt: target.studentProfile?.coverImageUpdatedAt || null,
    systemImage: settings.profileHomepageBackgroundImageUrl,
    systemUpdatedAt: settings.profileHomepageBackgroundUpdatedAt
  });
  return {
    user: {
      id: target.id,
      username: target.username,
      nickname: target.studentProfile?.nickname || target.username,
      avatarImage: target.studentProfile?.avatarImage || "",
      avatarColor: target.studentProfile?.avatarColor || "green",
      coverImage,
      bio: target.studentProfile?.bio || "",
      gender: target.studentProfile?.gender || null,
      province: target.studentProfile?.region?.province || target.studentProfile?.schoolOption?.province || null,
      studySystem: target.studentProfile?.region?.studySystem || null,
      majorName: target.studentProfile?.major?.name || null,
      joinedAt: target.createdAt,
      joinedYear: target.createdAt.getFullYear(),
      diamondBalance: target.diamondAccount?.balance || 0,
      medalLevel: medal.level,
      medalLabel: medal.label
    },
    stats: {
      postCount,
      followingCount,
      followerCount,
      likedCount
    },
    relationship: {
      isSelf: viewerId === targetId,
      isFollowing: Boolean(isFollowing)
    }
  };
}

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) {
    throw new BuddyError("SOCIAL_FOLLOW_SELF_NOT_ALLOWED", "不能关注自己。");
  }

  const target = await prisma.user.findFirst({
    where: { id: followingId, role: "student", status: "active" },
    select: { id: true }
  });
  if (!target) {
    throw new BuddyError("SOCIAL_PROFILE_NOT_FOUND", "用户不存在或暂不可关注。", 404);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const follow = await tx.socialFollow.create({
        data: {
          followerId,
          followingId
        }
      });
      await createUserEventNotification(tx, {
        recipientId: followingId,
        actorId: followerId,
        type: "social_followed",
        dedupeKey: `social-follow:${follow.id}`
      });
      return follow;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.socialFollow.findUniqueOrThrow({
        where: { followerId_followingId: { followerId, followingId } }
      });
    }
    throw error;
  }
}

export async function unfollowUser(followerId: string, followingId: string) {
  await prisma.socialFollow.deleteMany({
    where: { followerId, followingId }
  });
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw new BuddyError("SOCIAL_BLOCK_SELF_NOT_ALLOWED", "不能屏蔽自己。");
  }

  const target = await prisma.user.findFirst({
    where: { id: blockedId, role: "student", status: "active" },
    select: { id: true }
  });
  if (!target) {
    throw new BuddyError("SOCIAL_PROFILE_NOT_FOUND", "用户不存在或暂不可访问。", 404);
  }

  return prisma.$transaction(async (tx) => {
    const block = await tx.socialBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: {},
      create: { blockerId, blockedId }
    });

    await tx.socialFollow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId }
        ]
      }
    });

    return block;
  });
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.socialBlock.deleteMany({
    where: { blockerId, blockedId }
  });
}

export async function listBlockedUsers(userId: string) {
  const blocks = await prisma.socialBlock.findMany({
    where: {
      blockerId: userId,
      blocked: {
        role: "student"
      }
    },
    include: {
      blocked: {
        include: {
          studentProfile: {
            include: {
              region: true,
              major: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return {
    items: blocks.map((block) => ({
      blockedAt: block.createdAt,
      id: block.blocked.id,
      username: block.blocked.username,
      nickname: block.blocked.studentProfile?.nickname || block.blocked.username,
      avatarImage: block.blocked.studentProfile?.avatarImage || "",
      avatarColor: block.blocked.studentProfile?.avatarColor || "green",
      province: block.blocked.studentProfile?.region?.province || null,
      studySystem: block.blocked.studentProfile?.region?.studySystem || null,
      majorName: block.blocked.studentProfile?.major?.name || null
    }))
  };
}

export async function searchUsersByNickname(viewerId: string, query: string, input?: { limit?: number }) {
  const keyword = query.trim();
  const limit = Math.max(1, Math.min(input?.limit || 12, 30));
  if (!keyword) {
    return { items: [] };
  }
  const blockedIds = await getBlockedUserIds(viewerId);

  const users = await prisma.user.findMany({
    where: {
      id: { notIn: [viewerId, ...blockedIds] },
      role: "student",
      status: "active",
      blockedUsers: { none: { blockedId: viewerId } },
      studentProfile: {
        is: {
          nickname: {
            contains: keyword,
            mode: "insensitive"
          }
        }
      }
    },
    include: {
      studentProfile: {
        include: {
          region: true,
          major: true
        }
      },
      followers: {
        where: { followerId: viewerId },
        select: { id: true }
      },
      _count: {
        select: {
          followers: true,
          following: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return {
    items: users.map((user) => ({
      id: user.id,
      username: user.username,
      nickname: user.studentProfile?.nickname || user.username,
      avatarImage: user.studentProfile?.avatarImage || "",
      avatarColor: user.studentProfile?.avatarColor || "green",
      bio: user.studentProfile?.bio || "",
      province: user.studentProfile?.region?.province || null,
      studySystem: user.studentProfile?.region?.studySystem || null,
      majorName: user.studentProfile?.major?.name || null,
      isFollowing: user.followers.length > 0,
      followerCount: user._count.followers,
      followingCount: user._count.following
    }))
  };
}

export async function listRecommendedFollows(viewerId: string, input?: { limit?: number }) {
  const limit = Math.max(1, Math.min(input?.limit || 5, 10));
  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    include: {
      studentProfile: {
        include: { region: true }
      }
    }
  });
  const profile = viewer?.studentProfile;
  if (!profile?.majorId || !profile.region?.province || !profile.region.studySystem) {
    return { items: [] };
  }

  const [followingIds, blockedIds] = await Promise.all([
    getFollowingIds(viewerId),
    getBlockedUserIds(viewerId)
  ]);

  const users = await prisma.user.findMany({
    where: {
      id: { notIn: [viewerId, ...followingIds, ...blockedIds] },
      role: "student",
      status: "active",
      blockedUsers: { none: { blockedId: viewerId } },
      studentProfile: {
        is: {
          majorId: profile.majorId,
          region: {
            is: {
              province: profile.region.province,
              studySystem: profile.region.studySystem
            }
          }
        }
      }
    },
    include: {
      diamondAccount: true,
      studentProfile: {
        include: {
          region: true,
          major: true
        }
      },
      _count: {
        select: {
          followers: true,
          following: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return {
    items: users
      .sort((left, right) => {
        const balanceDelta = (right.diamondAccount?.balance || 0) - (left.diamondAccount?.balance || 0);
        if (balanceDelta !== 0) {
          return balanceDelta;
        }
        return right.createdAt.getTime() - left.createdAt.getTime();
      })
      .slice(0, limit)
      .map((user) => ({
        id: user.id,
        username: user.username,
        nickname: user.studentProfile?.nickname || user.username,
        avatarImage: user.studentProfile?.avatarImage || "",
        avatarColor: user.studentProfile?.avatarColor || "green",
        province: user.studentProfile?.region?.province || null,
        studySystem: user.studentProfile?.region?.studySystem || null,
        majorName: user.studentProfile?.major?.name || null,
        diamondBalance: user.diamondAccount?.balance || 0,
        followerCount: user._count.followers,
        followingCount: user._count.following
      }))
  };
}
