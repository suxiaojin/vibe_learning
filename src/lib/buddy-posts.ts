import { Prisma } from "@prisma/client";
import { areActiveBuddies, BuddyError, getActiveBuddyIds } from "@/lib/buddies";
import { prisma } from "@/lib/prisma";
import { createUserEventNotification } from "@/lib/user-event-notifications";

type BuddyPostWithDetails = Prisma.BuddyPostGetPayload<{
  include: {
    author: { include: { studentProfile: true } };
    originalPost: { include: { author: { include: { studentProfile: true } } } };
    likes: { select: { active: true } };
    _count: { select: { likes: true } };
  };
}>;

export async function createBuddyPost(authorId: string, contentInput: string) {
  const content = normalizePostContent(contentInput);
  if (!content) {
    throw new BuddyError("BUDDY_POST_EMPTY", "动态内容不能为空。");
  }

  return prisma.buddyPost.create({
    data: {
      authorId,
      type: "original",
      content
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

export async function listBuddyFeed(userId: string, input?: { cursor?: string; limit?: number }) {
  const limit = normalizeLimit(input?.limit);
  const buddyIds = await getActiveBuddyIds(userId);
  const posts = await prisma.buddyPost.findMany({
    where: {
      authorId: { in: [userId, ...buddyIds] },
      deletedAt: null
    },
    include: postDetailsInclude(userId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: limit + 1
  });

  const items = [];
  for (const post of posts.slice(0, limit)) {
    items.push(await toBuddyPostDto(post, userId));
  }

  return {
    items,
    nextCursor: posts.length > limit ? posts[limit].id : null
  };
}

export async function listProfileBuddyPosts(viewerId: string, targetId: string, input?: { cursor?: string; limit?: number }) {
  if (viewerId !== targetId && !(await areActiveBuddies(viewerId, targetId))) {
    return { items: [], nextCursor: null };
  }

  const limit = normalizeLimit(input?.limit);
  const posts = await prisma.buddyPost.findMany({
    where: {
      authorId: targetId,
      deletedAt: null
    },
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

export async function likeBuddyPost(userId: string, postId: string) {
  const post = await assertPostInteractable(userId, postId, "like");
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
    await createUserEventNotification(tx, {
      recipientId: post.authorId,
      actorId: userId,
      type: "buddy_post_liked",
      postId,
      dedupeKey: `buddy-like:${like.id}:first`
    });
    return like;
  });
}

export async function unlikeBuddyPost(userId: string, postId: string) {
  await prisma.buddyPostLike.updateMany({
    where: { postId, userId, active: true },
    data: { active: false }
  });
}

export async function repostBuddyPost(userId: string, originalPostId: string) {
  const original = await prisma.buddyPost.findFirst({
    where: {
      id: originalPostId,
      type: "original",
      deletedAt: null
    },
    select: {
      id: true,
      authorId: true
    }
  });
  if (!original) {
    throw new BuddyError("BUDDY_POST_REPOST_SOURCE_UNAVAILABLE", "原动态不可转帖。", 404);
  }
  if (original.authorId === userId) {
    throw new BuddyError("BUDDY_POST_SELF_REPOST_NOT_ALLOWED", "不能转帖自己的动态。");
  }
  if (!(await areActiveBuddies(userId, original.authorId))) {
    throw new BuddyError("BUDDY_POST_NOT_VISIBLE", "只能转帖当前搭子的原始动态。", 403);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const repost = await tx.buddyPost.create({
        data: {
          authorId: userId,
          type: "repost",
          originalPostId: original.id
        }
      });
      await createUserEventNotification(tx, {
        recipientId: original.authorId,
        actorId: userId,
        type: "buddy_post_reposted",
        postId: repost.id,
        dedupeKey: `buddy-repost:${repost.id}:created`
      });
      return repost;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new BuddyError("BUDDY_POST_REPOST_ALREADY_EXISTS", "你已经转帖过这条动态。", 409);
    }
    throw error;
  }
}

export async function toBuddyPostDto(post: BuddyPostWithDetails, viewerId: string) {
  const sourceState = await getPostSourceState(post);
  const canInteract = post.authorId !== viewerId && !post.deletedAt && sourceState === "visible";

  return {
    id: post.id,
    type: post.type,
    content: post.content || "",
    createdAt: post.createdAt,
    deletedAt: post.deletedAt,
    author: toPostUser(post.author),
    likeCount: post._count.likes,
    likedByMe: post.likes.some((like) => like.active),
    canLike: canInteract,
    canRepost: canInteract && post.type === "original",
    canDelete: post.authorId === viewerId,
    sourceState,
    originalPost: post.originalPost
      ? {
          id: post.originalPost.id,
          content: post.originalPost.content || "",
          deletedAt: post.originalPost.deletedAt,
          author: toPostUser(post.originalPost.author),
          createdAt: post.originalPost.createdAt
        }
      : null
  };
}

async function assertPostInteractable(userId: string, postId: string, action: "like") {
  const post = await prisma.buddyPost.findUnique({
    where: { id: postId },
    include: {
      author: { include: { studentProfile: true } },
      originalPost: { include: { author: { include: { studentProfile: true } } } },
      likes: { where: { userId }, select: { active: true } },
      _count: { select: { likes: { where: { active: true } } } }
    }
  });
  if (!post || post.deletedAt) {
    throw new BuddyError("BUDDY_POST_NOT_VISIBLE", "动态不存在或不可见。", 404);
  }
  if (post.authorId === userId) {
    throw new BuddyError("BUDDY_POST_SELF_LIKE_NOT_ALLOWED", "不能点赞自己的动态。");
  }
  if (!(await areActiveBuddies(userId, post.authorId))) {
    throw new BuddyError("BUDDY_POST_NOT_VISIBLE", "只能互动当前搭子的动态。", 403);
  }
  if ((await getPostSourceState(post)) !== "visible") {
    throw new BuddyError("BUDDY_POST_REPOST_SOURCE_UNAVAILABLE", "该动态当前不可互动。", 409);
  }
  if (action === "like") {
    return post;
  }
  return post;
}

async function getPostSourceState(post: {
  type: "original" | "repost";
  authorId: string;
  originalPostId: string | null;
  originalPost?: { authorId: string; deletedAt: Date | null } | null;
}) {
  if (post.type === "original") {
    return "visible" as const;
  }
  if (!post.originalPost || post.originalPost.deletedAt) {
    return "deleted" as const;
  }
  if (!(await areActiveBuddies(post.authorId, post.originalPost.authorId))) {
    return "unavailable" as const;
  }
  return "visible" as const;
}

function normalizePostContent(content: string) {
  return String(content || "").replace(/\u0000/g, "").trim();
}

function normalizeLimit(limit?: number) {
  return Math.max(1, Math.min(limit || 20, 50));
}

function postDetailsInclude(userId: string) {
  return {
    author: { include: { studentProfile: true } },
    originalPost: { include: { author: { include: { studentProfile: true } } } },
    likes: { where: { userId }, select: { active: true } },
    _count: { select: { likes: { where: { active: true } } } }
  } satisfies Prisma.BuddyPostInclude;
}

function toPostUser(user: {
  id: string;
  username: string;
  studentProfile?: {
    nickname: string | null;
    avatarImage: string | null;
    avatarColor: string | null;
  } | null;
}) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.studentProfile?.nickname || user.username,
    avatarImage: user.studentProfile?.avatarImage || "",
    avatarColor: user.studentProfile?.avatarColor || "green"
  };
}
