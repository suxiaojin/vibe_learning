import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function hasUnreadChangelogs(userId: string) {
  let readState = await prisma.changelogReadState.findUnique({
    where: { userId },
    select: { readAt: true }
  });

  if (!readState) {
    const initializedAt = new Date();
    await prisma.changelogReadState.upsert({
      where: { userId },
      create: { userId, readAt: initializedAt },
      update: {}
    });
    readState = await prisma.changelogReadState.findUnique({
      where: { userId },
      select: { readAt: true }
    });
  }

  if (!readState) {
    return false;
  }
  const latestPublishedEntry = await prisma.changelogEntry.findFirst({
    where: { isPublished: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { updatedAt: true }
  });

  return Boolean(latestPublishedEntry && latestPublishedEntry.updatedAt > readState.readAt);
}

export async function markChangelogsRead(userId: string, readThroughAt: Date) {
  if (!Number.isFinite(readThroughAt.getTime())) {
    return;
  }
  const safeReadThroughAt = new Date(Math.min(readThroughAt.getTime(), Date.now()));
  const updateReadState = () => prisma.changelogReadState.updateMany({
    where: { userId, readAt: { lt: safeReadThroughAt } },
    data: { readAt: safeReadThroughAt }
  });

  const updated = await updateReadState();
  if (updated.count > 0) {
    return;
  }
  const existing = await prisma.changelogReadState.findUnique({
    where: { userId },
    select: { userId: true }
  });
  if (existing) {
    return;
  }

  try {
    await prisma.changelogReadState.create({
      data: { userId, readAt: safeReadThroughAt }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await updateReadState();
      return;
    }
    throw error;
  }
}
