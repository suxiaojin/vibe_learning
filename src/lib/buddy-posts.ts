import { Prisma } from "@prisma/client";
import type { BuddyShareCard, BuddyShareType } from "@/lib/buddy-share-cards";
import { normalizeBuddyShareInput } from "@/lib/buddy-share-cards";
import { BuddyError } from "@/lib/buddies";
import { prisma } from "@/lib/prisma";
import { getMedalLevel, getMedalRule } from "@/lib/rewards";
import { getBlockedUserIds, getFollowingIds } from "@/lib/social";
import { createUserEventNotification } from "@/lib/user-event-notifications";

export type BuddyFeedScope = "discover" | "following";
export type BuddyFeedSort = "latest" | "hot";
export type ProfilePostTab = "posts" | "likes" | "reposts";

export type BuddyFeedFilters = {
  cursor?: string;
  limit?: number;
  majorId?: string;
  province?: string;
  scope?: BuddyFeedScope;
  sort?: BuddyFeedSort;
  studySystem?: string;
};

type BuddyPostWithDetails = Prisma.BuddyPostGetPayload<{
  include: {
    author: {
      include: {
        studentProfile: {
          include: {
            major: true;
            region: true;
          };
        };
        _count: { select: { attempts: true } };
      };
    };
    originalPost: {
      include: {
        author: {
          include: {
            studentProfile: {
              include: {
                major: true;
                region: true;
              };
            };
            _count: { select: { attempts: true } };
          };
        };
        likes: { select: { active: true; createdAt: true; updatedAt: true } };
        reposts: { select: { id: true } };
        _count: { select: { likes: true; reposts: true } };
      };
    };
    likes: { select: { active: true; createdAt: true; updatedAt: true } };
    reposts: { select: { id: true } };
    _count: { select: { likes: true; reposts: true } };
  };
}>;

type BuddyPostSourceRecord = NonNullable<BuddyPostWithDetails["originalPost"]>;
type BuddyPostSourceDto = {
  id: string;
  type: "original" | "repost";
  content: string;
  deletedAt: Date | null;
  sharePayload: BuddyShareCard | null;
  shareType: BuddyShareType | null;
  author: ReturnType<typeof toPostUser>;
  createdAt: Date;
  likeCount: number;
  repostCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  canLike: boolean;
  canRepost: boolean;
  sourceState: "visible" | "deleted";
  originalPost: BuddyPostSourceDto | null;
};

type BuddyPostDto = {
  id: string;
  type: "original" | "repost";
  content: string;
  createdAt: Date;
  deletedAt: Date | null;
  sharePayload: BuddyShareCard | null;
  shareType: BuddyShareType | null;
  author: ReturnType<typeof toPostUser>;
  likeCount: number;
  repostCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  canLike: boolean;
  canRepost: boolean;
  canDelete: boolean;
  sourceState: "visible" | "deleted";
  originalPost: BuddyPostSourceDto | null;
};

export async function createBuddyPost(authorId: string, contentInput: string, shareInput?: unknown) {
  const content = normalizePostContent(contentInput);
  if (!content) {
    throw new BuddyError("BUDDY_POST_EMPTY", "动态内容不能为空。");
  }
  assertPostContentAllowed(content);
  const share = normalizeBuddyShareInput(shareInput);
  if (share) {
    assertPostContentAllowed(JSON.stringify(share));
  }

  return prisma.buddyPost.create({
    data: {
      authorId,
      type: "original",
      content,
      sharePayload: share ? share as Prisma.InputJsonValue : undefined,
      shareType: share?.type
    }
  });
}

export async function deleteBuddyPost(authorId: string, postId: string) {
  const result = await prisma.buddyPost.updateMany({
    where: {
      id: postId,
      authorId,
      deletedAt: null
    },
    data: { deletedAt: new Date() }
  });
  if (result.count !== 1) {
    throw new BuddyError("BUDDY_POST_NOT_FOUND", "动态不存在或不能删除。", 404);
  }
}

export async function listBuddyFeed(userId: string, input?: BuddyFeedFilters) {
  const limit = normalizeLimit(input?.limit);
  const scope = input?.scope === "following" ? "following" : "discover";
  const sort = input?.sort === "hot" ? "hot" : "latest";
  const [followingIds, blockedIds] = await Promise.all([
    getFollowingIds(userId),
    getBlockedUserIds(userId)
  ]);
  if (scope === "following" && followingIds.length === 0) {
    return { items: [], nextCursor: null };
  }
  const where = getFeedWhere(scope, userId, input, followingIds, blockedIds);

  const take = sort === "hot" ? Math.max(limit + 1, 120) : limit + 1;
  const posts = await prisma.buddyPost.findMany({
    where,
    include: postDetailsInclude(userId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(sort === "latest" && input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take
  });

  const items = [];
  for (const post of posts) {
    items.push(await toBuddyPostDto(post, userId));
  }

  if (sort === "hot") {
    items.sort((left, right) => {
      if (right.likeCount !== left.likeCount) {
        return right.likeCount - left.likeCount;
      }
      return right.createdAt.getTime() - left.createdAt.getTime();
    });
  }

  const pageItems = items.slice(0, limit);
  return {
    items: pageItems,
    nextCursor: sort === "latest" && posts.length > limit ? posts[limit].id : null
  };
}

export async function getFollowingFeedUnreadCount(userId: string) {
  const existingReadState = await prisma.buddyFeedReadState.findUnique({
    where: { userId },
    select: { followingReadAt: true }
  });
  if (!existingReadState) {
    const initializedAt = new Date();
    await prisma.buddyFeedReadState.upsert({
      where: { userId },
      create: { userId, followingReadAt: initializedAt },
      update: {}
    });
    return 0;
  }

  const [follows, blockedIds] = await Promise.all([
    prisma.socialFollow.findMany({
      where: {
        followerId: userId,
        following: {
          role: "student",
          status: "active"
        }
      },
      select: {
        followingId: true,
        createdAt: true
      }
    }),
    getBlockedUserIds(userId)
  ]);
  const blockedIdSet = new Set(blockedIds);
  const unreadWindows = follows
    .filter((follow) => !blockedIdSet.has(follow.followingId))
    .map((follow) => ({
      authorId: follow.followingId,
      createdAt: {
        gt: follow.createdAt > existingReadState.followingReadAt
          ? follow.createdAt
          : existingReadState.followingReadAt
      }
    }));
  if (unreadWindows.length === 0) {
    return 0;
  }

  const unreadPosts = await prisma.buddyPost.findMany({
    where: {
      deletedAt: null,
      author: {
        role: "student",
        status: "active",
        blockedUsers: { none: { blockedId: userId } }
      },
      OR: unreadWindows
    },
    select: { id: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 11
  });

  return unreadPosts.length;
}

export async function markFollowingFeedRead(userId: string, readThroughAt: Date) {
  if (!Number.isFinite(readThroughAt.getTime())) {
    return;
  }
  const safeReadThroughAt = new Date(Math.min(readThroughAt.getTime(), Date.now()));
  const updateReadState = () => prisma.buddyFeedReadState.updateMany({
    where: {
      userId,
      followingReadAt: { lt: safeReadThroughAt }
    },
    data: { followingReadAt: safeReadThroughAt }
  });

  const updated = await updateReadState();
  if (updated.count > 0) {
    return;
  }
  const existing = await prisma.buddyFeedReadState.findUnique({
    where: { userId },
    select: { userId: true }
  });
  if (existing) {
    return;
  }

  try {
    await prisma.buddyFeedReadState.create({
      data: { userId, followingReadAt: safeReadThroughAt }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await updateReadState();
      return;
    }
    throw error;
  }
}

export async function listProfileBuddyPosts(
  viewerId: string,
  targetId: string,
  input?: { cursor?: string; includeInteractions?: boolean; limit?: number; tab?: ProfilePostTab }
) {
  const limit = normalizeLimit(input?.limit);
  const tab = input?.tab || "posts";
  const where: Prisma.BuddyPostWhereInput = {
    deletedAt: null,
    author: {
      role: "student",
      status: "active"
    }
  };

  if (tab === "posts" && input?.includeInteractions) {
    return listProfileInteractionPosts(viewerId, targetId, limit);
  } else if (tab === "likes") {
    where.likes = { some: { userId: targetId, active: true } };
  } else {
    where.authorId = targetId;
    if (tab === "reposts") {
      where.type = "repost";
    }
  }

  const posts = await prisma.buddyPost.findMany({
    where,
    include: postDetailsInclude(viewerId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: limit + 1
  });

  const items = [];
  for (const post of posts.slice(0, limit)) {
    items.push(await toBuddyPostDto(post, viewerId));
  }

  return {
    items,
    nextCursor: posts.length > limit ? posts[limit].id : null
  };
}

async function listProfileInteractionPosts(viewerId: string, targetId: string, limit: number) {
  const visiblePostWhere: Prisma.BuddyPostWhereInput = {
    deletedAt: null,
    author: {
      role: "student",
      status: "active"
    }
  };
  const [ownPosts, likedRows] = await Promise.all([
    prisma.buddyPost.findMany({
      where: {
        ...visiblePostWhere,
        authorId: targetId
      },
      include: postDetailsInclude(viewerId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit
    }),
    prisma.buddyPostLike.findMany({
      where: {
        userId: targetId,
        active: true,
        post: { is: visiblePostWhere }
      },
      include: {
        post: { include: postDetailsInclude(viewerId) }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit
    })
  ]);

  const activityByPostId = new Map<string, { activityAt: number; post: BuddyPostWithDetails }>();
  for (const post of ownPosts) {
    activityByPostId.set(post.id, {
      activityAt: post.createdAt.getTime(),
      post
    });
  }
  for (const row of likedRows) {
    const activityAt = Math.max(row.updatedAt.getTime(), row.createdAt.getTime());
    const existing = activityByPostId.get(row.post.id);
    if (!existing || activityAt > existing.activityAt) {
      activityByPostId.set(row.post.id, {
        activityAt,
        post: row.post
      });
    }
  }

  const sortedPosts = Array.from(activityByPostId.values()).sort((left, right) => {
    if (right.activityAt !== left.activityAt) {
      return right.activityAt - left.activityAt;
    }
    return right.post.createdAt.getTime() - left.post.createdAt.getTime();
  });

  const items = [];
  for (const item of sortedPosts.slice(0, limit)) {
    items.push(await toBuddyPostDto(item.post, viewerId));
  }

  return { items, nextCursor: null };
}

export async function likeBuddyPost(userId: string, postId: string) {
  const post = await assertPostInteractable(userId, postId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.buddyPostLike.findUnique({
      where: {
        postId_userId: { postId, userId }
      }
    });

    if (existing) {
      if (!existing.active) {
        return tx.buddyPostLike.update({
          where: { id: existing.id },
          data: { active: true }
        });
      }
      return existing;
    }

    const like = await tx.buddyPostLike.create({
      data: {
        postId,
        userId,
        active: true
      }
    });
    if (post.authorId !== userId) {
      await createUserEventNotification(tx, {
        recipientId: post.authorId,
        actorId: userId,
        type: "buddy_post_liked",
        postId,
        dedupeKey: `buddy-like:${like.id}:first`
      });
    }
    return like;
  });
}

export async function unlikeBuddyPost(userId: string, postId: string) {
  await prisma.buddyPostLike.updateMany({
    where: { postId, userId, active: true },
    data: { active: false }
  });
}

export async function repostBuddyPost(userId: string, originalPostId: string, contentInput?: string) {
  const content = normalizePostContent(contentInput || "") || null;
  if (content) {
    assertPostContentAllowed(content);
  }
  const original = await prisma.buddyPost.findFirst({
    where: {
      id: originalPostId,
      deletedAt: null,
      author: {
        role: "student",
        status: "active"
      }
    },
    include: {
      originalPost: { select: { deletedAt: true } }
    }
  });
  if (!original || getPostSourceState(original) !== "visible") {
    throw new BuddyError("BUDDY_POST_REPOST_SOURCE_UNAVAILABLE", "原动态不可转帖。", 404);
  }

  try {
    const now = new Date();
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.buddyPost.findUnique({
        where: {
          authorId_originalPostId: {
            authorId: userId,
            originalPostId: original.id
          }
        }
      });

      const repost = existing
        ? await tx.buddyPost.update({
            where: { id: existing.id },
            data: {
              content,
              deletedAt: null,
              createdAt: now
            }
          })
        : await tx.buddyPost.create({
            data: {
              authorId: userId,
              type: "repost",
              content,
              originalPostId: original.id
            }
          });

      if (!existing || existing.deletedAt) {
        if (original.authorId !== userId) {
          await createUserEventNotification(tx, {
            recipientId: original.authorId,
            actorId: userId,
            type: "buddy_post_reposted",
            postId: repost.id,
            dedupeKey: `buddy-repost:${repost.id}:${now.getTime()}`
          });
        }
      }
      return repost;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new BuddyError("BUDDY_POST_REPOST_ALREADY_EXISTS", "你已经转帖过这条动态。", 409);
    }
    throw error;
  }
}

export async function unrepostBuddyPost(userId: string, originalPostId: string) {
  const result = await prisma.buddyPost.updateMany({
    where: {
      authorId: userId,
      originalPostId,
      type: "repost",
      deletedAt: null
    },
    data: { deletedAt: new Date() }
  });
  if (result.count !== 1) {
    throw new BuddyError("BUDDY_POST_REPOST_NOT_FOUND", "转帖不存在或已取消。", 404);
  }
}

export async function toBuddyPostDto(post: BuddyPostWithDetails, viewerId: string): Promise<BuddyPostDto> {
  const sourceState = getPostSourceState(post);
  const canInteract = !post.deletedAt && sourceState === "visible";

  return {
    id: post.id,
    type: post.type,
    content: post.content || "",
    createdAt: post.createdAt,
    deletedAt: post.deletedAt,
    sharePayload: normalizeBuddyShareInput(post.sharePayload),
    shareType: post.shareType,
    author: toPostUser(post.author),
    likeCount: post._count.likes,
    repostCount: post._count.reposts,
    likedByMe: post.likes.some((like) => like.active),
    repostedByMe: post.reposts.length > 0,
    canLike: canInteract,
    canRepost: canInteract,
    canDelete: post.authorId === viewerId,
    sourceState,
    originalPost: post.originalPost ? await toBuddyPostSourceDto(post.originalPost, viewerId, 2) : null
  };
}

async function toBuddyPostSourceDto(
  source: BuddyPostSourceRecord,
  viewerId: string,
  depth: number
): Promise<BuddyPostSourceDto> {
  const fullSource = source.type === "repost" && depth > 0
    ? await prisma.buddyPost.findUnique({
        where: { id: source.id },
        include: postDetailsInclude(viewerId)
      })
    : null;
  const visibleSource = fullSource || source;
  const sourceState = visibleSource.deletedAt
    ? "deleted"
    : fullSource
      ? getPostSourceState(fullSource)
      : source.type === "original"
        ? "visible"
        : "deleted";
  const canInteract = !visibleSource.deletedAt && sourceState === "visible";

  return {
    id: visibleSource.id,
    type: visibleSource.type,
    content: visibleSource.content || "",
    deletedAt: visibleSource.deletedAt,
    sharePayload: normalizeBuddyShareInput(visibleSource.sharePayload),
    shareType: visibleSource.shareType,
    author: toPostUser(visibleSource.author),
    createdAt: visibleSource.createdAt,
    likeCount: visibleSource._count.likes,
    repostCount: visibleSource._count.reposts,
    likedByMe: visibleSource.likes.some((like) => like.active),
    repostedByMe: visibleSource.reposts.length > 0,
    canLike: canInteract,
    canRepost: canInteract,
    sourceState,
    originalPost: fullSource?.originalPost && depth > 0
      ? await toBuddyPostSourceDto(fullSource.originalPost, viewerId, depth - 1)
      : null
  };
}

function getFeedWhere(
  scope: BuddyFeedScope,
  viewerId: string,
  input?: BuddyFeedFilters,
  followingIds: string[] = [],
  blockedIds: string[] = []
): Prisma.BuddyPostWhereInput {
  const profileWhere: Prisma.StudentProfileWhereInput = {};
  if (input?.majorId) {
    profileWhere.majorId = input.majorId;
  }
  if (input?.province || input?.studySystem) {
    profileWhere.region = {
      is: {
        ...(input.province ? { province: input.province } : {}),
        ...(input.studySystem ? { studySystem: input.studySystem } : {})
      }
    };
  }

  const where: Prisma.BuddyPostWhereInput = {
    deletedAt: null,
    author: {
      role: "student",
      status: "active",
      blockedUsers: { none: { blockedId: viewerId } },
      ...(Object.keys(profileWhere).length > 0 ? { studentProfile: { is: profileWhere } } : {})
    }
  };

  if (scope === "following") {
    where.authorId = { in: followingIds.filter((id) => !blockedIds.includes(id)) };
  } else {
    const excludedAuthorIds = Array.from(new Set([...followingIds, ...blockedIds]));
    if (excludedAuthorIds.length > 0) {
      where.authorId = { notIn: excludedAuthorIds };
    }
  }

  return where;
}

async function assertPostInteractable(userId: string, postId: string) {
  const post = await prisma.buddyPost.findUnique({
    where: { id: postId },
    include: {
      author: { include: { studentProfile: true } },
      originalPost: { include: { author: { include: { studentProfile: true } } } },
      likes: { where: { userId }, select: { active: true } },
      _count: { select: { likes: { where: { active: true } } } }
    }
  });
  if (!post || post.deletedAt || post.author.role !== "student" || post.author.status !== "active") {
    throw new BuddyError("BUDDY_POST_NOT_VISIBLE", "动态不存在或不可见。", 404);
  }
  if (getPostSourceState(post) !== "visible") {
    throw new BuddyError("BUDDY_POST_REPOST_SOURCE_UNAVAILABLE", "该动态当前不可互动。", 409);
  }
  return post;
}

function getPostSourceState(post: {
  type: "original" | "repost";
  originalPost?: { deletedAt: Date | null } | null;
}) {
  if (post.type === "original") {
    return "visible" as const;
  }
  if (!post.originalPost || post.originalPost.deletedAt) {
    return "deleted" as const;
  }
  return "visible" as const;
}

function normalizePostContent(content: string) {
  return String(content || "").replace(/\u0000/g, "").trim();
}

function assertPostContentAllowed(content: string) {
  const linkPattern = /(?:https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]*\.(?:com|cn|net|org|edu|gov|io|ai|app|dev|top|xyz|site|me|cc|tv)\b)/i;
  if (linkPattern.test(content)) {
    throw new BuddyError("BUDDY_POST_LINK_NOT_ALLOWED", "发帖内容不能包含超链接。");
  }
}

function normalizeLimit(limit?: number) {
  return Math.max(1, Math.min(limit || 20, 50));
}

function postDetailsInclude(userId: string) {
  return {
    author: {
      include: {
        studentProfile: {
          include: {
            major: true,
            region: true
          }
        },
        _count: { select: { attempts: true } }
      }
    },
    originalPost: {
      include: {
        author: {
          include: {
            studentProfile: {
              include: {
                major: true,
                region: true
              }
            },
            _count: { select: { attempts: true } }
          }
        },
        likes: { where: { userId }, select: { active: true, createdAt: true, updatedAt: true } },
        reposts: { where: { authorId: userId, deletedAt: null }, select: { id: true } },
        _count: {
          select: {
            likes: { where: { active: true } },
            reposts: { where: { deletedAt: null } }
          }
        }
      }
    },
    likes: { where: { userId }, select: { active: true, createdAt: true, updatedAt: true } },
    reposts: { where: { authorId: userId, deletedAt: null }, select: { id: true } },
    _count: {
      select: {
        likes: { where: { active: true } },
        reposts: { where: { deletedAt: null } }
      }
    }
  } satisfies Prisma.BuddyPostInclude;
}

function toPostUser(user: {
  id: string;
  username: string;
  _count: { attempts: number };
  studentProfile?: {
    avatarColor: string | null;
    avatarImage: string | null;
    bio?: string | null;
    gender: "male" | "female" | null;
    major?: { name: string } | null;
    nickname: string | null;
    region?: { province: string; studySystem: string } | null;
  } | null;
}) {
  const medalLevel = getMedalLevel(user._count.attempts);
  const medalRule = getMedalRule(medalLevel);

  return {
    id: user.id,
    username: user.username,
    nickname: user.studentProfile?.nickname || user.username,
    avatarImage: user.studentProfile?.avatarImage || "",
    avatarColor: user.studentProfile?.avatarColor || "green",
    gender: user.studentProfile?.gender || null,
    province: user.studentProfile?.region?.province || null,
    studySystem: user.studentProfile?.region?.studySystem || null,
    majorName: user.studentProfile?.major?.name || null,
    medalLevel,
    medalLabel: medalRule.label
  };
}
