import { prisma } from "@/lib/prisma";

export async function listPublishedChangelogs(offset = 0) {
  const rows = await prisma.changelogEntry.findMany({
    where: { isPublished: true },
    orderBy: [{ releaseDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
    skip: offset,
    take: 11,
    select: { id: true, title: true, badgeText: true, summary: true, releaseDate: true }
  });
  return {
    entries: rows.slice(0, 10).map((row) => ({ ...row, releaseDate: row.releaseDate?.toISOString().slice(0, 10) ?? null })),
    hasMore: rows.length > 10
  };
}
