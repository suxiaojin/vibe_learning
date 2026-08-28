import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProjectDiamondPriceKind } from "@/lib/project-diamond-price";

type AccessClient = Pick<Prisma.TransactionClient, "aiStudyProject" | "officialStudyMaterial" | "studentProfile">;

export type StudyProjectOffer = {
  kind: ProjectDiamondPriceKind;
  id: string;
  title: string;
  diamondPrice: number;
  purchased: boolean;
  owned: boolean;
  requiresPurchase: boolean;
  href: string;
};

export class StudyProjectAccessError extends Error {
  readonly status = 404;
  readonly code = "STUDY_PROJECT_NOT_FOUND";

  constructor() {
    super("公开项目不存在或暂不可用。");
    this.name = "StudyProjectAccessError";
  }
}

export function accessibleAiStudyProjectWhere(userId: string): Prisma.AiStudyProjectWhereInput {
  return {
    deletedAt: null,
    OR: [
      { ownerId: userId },
      {
        visibility: "public",
        status: "ready",
        OR: [{ diamondPrice: 0 }, { purchases: { some: { userId } } }]
      }
    ]
  };
}

export async function publicOfficialMaterialWhere(
  userId: string,
  db: AccessClient = prisma
): Promise<Prisma.OfficialStudyMaterialWhereInput> {
  const profile = await db.studentProfile.findUnique({
    where: { userId },
    select: { majorId: true, publicSubjectId: true }
  });
  return {
    visibility: "public",
    fileStatus: "ready",
    deletedAt: null,
    OR: [
      { majorId: null, publicSubjectId: null },
      ...(profile?.majorId ? [{ majorId: profile.majorId }] : []),
      ...(profile?.publicSubjectId ? [{ publicSubjectId: profile.publicSubjectId }] : [])
    ]
  };
}

// Only expose card metadata before purchase, never nodes, source text or storage keys.
export async function getStudyProjectOffer(
  userId: string,
  kind: ProjectDiamondPriceKind,
  id: string,
  db: AccessClient = prisma
): Promise<StudyProjectOffer> {
  const select = {
    id: true,
    title: true,
    diamondPrice: true,
    purchases: { where: { userId }, select: { id: true }, take: 1 }
  } as const;
  const resource = kind === "ai"
    ? await db.aiStudyProject.findFirst({
        where: {
          id,
          deletedAt: null,
          OR: [{ ownerId: userId }, { visibility: "public", status: "ready" }]
        },
        select: { ...select, ownerId: true }
      })
    : await db.officialStudyMaterial.findFirst({
        where: { id, ...await publicOfficialMaterialWhere(userId, db) },
        select
      });
  if (!resource) {
    throw new StudyProjectAccessError();
  }
  const purchased = resource.purchases.length > 0;
  const owned = "ownerId" in resource && resource.ownerId === userId;
  return {
    kind,
    id: resource.id,
    title: resource.title,
    diamondPrice: resource.diamondPrice,
    purchased,
    owned,
    requiresPurchase: !owned && !purchased && resource.diamondPrice > 0,
    href: kind === "ai" ? `/study-buddy/${encodeURIComponent(id)}` : `/study-buddy/materials/${encodeURIComponent(id)}`
  };
}
