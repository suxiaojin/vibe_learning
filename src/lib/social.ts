import { Prisma } from "@prisma/client";
import { BuddyError } from "@/lib/buddies";
import { prisma } from "@/lib/prisma";
import { getMedalLevel, getMedalRule } from "@/lib/rewards";

export type SocialUserSearchResult = Awaited<ReturnType<typeof searchUsersByNickname>>["items"][number];

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

export async function getSocialProfile(viewerId: string, targetId: string) {
  const [target, totalAttempts, postCount, followingCount, followerCount, likedCount, isFollowing] = await Promise.all([
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
      : prisma.socialFollow.count({ where: { followerId: viewerId, followingId: targetId } })
  ]);

  if (!target) {
    throw new BuddyError("SOCIAL_PROFILE_NOT_FOUND", "用户不存在或暂不可访问。", 404);
  }

  const medal = getMedalRule(getMedalLevel(totalAttempts));
  return {
    user: {
      id: target.id,
      username: target.username,
      nickname: target.studentProfile?.nickname || target.username,
      avatarImage: target.studentProfile?.avatarImage || "",
      avatarColor: target.studentProfile?.avatarColor || "green",
      coverImage: target.studentProfile?.coverImage || "",
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
    return await prisma.socialFollow.create({
      data: {
        followerId,
        followingId
      }
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

export async function searchUsersByNickname(viewerId: string, query: string, input?: { limit?: number }) {
  const keyword = query.trim();
  const limit = Math.max(1, Math.min(input?.limit || 12, 30));
  if (!keyword) {
    return { items: [] };
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: viewerId },
      role: "student",
      status: "active",
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
      majorName: user.studentProfile?.major?.name || null,
      isFollowing: user.followers.length > 0,
      followerCount: user._count.followers,
      followingCount: user._count.following
    }))
  };
}
