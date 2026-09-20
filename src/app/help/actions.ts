"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPublishedChangelogs } from "@/lib/changelog-queries";

export async function loadChangelogs(offset: number) {
  await requireUser();
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid offset");
  return listPublishedChangelogs(offset);
}

export async function readChangelog(id: string) {
  await requireUser();
  const entry = await prisma.changelogEntry.findFirst({
    where: { id, isPublished: true },
    select: { title: true, releaseDate: true, content: true }
  });
  return entry ? { ...entry, releaseDate: entry.releaseDate?.toISOString().slice(0, 10) ?? null } : null;
}
