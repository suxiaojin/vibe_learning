import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const adminProjectPurchasersSchema = z.object({
  kind: z.enum(["ai", "official"]),
  id: z.string().trim().min(1).max(120),
  page: z.number().int().min(1).max(2_147_483_647).default(1)
}).strict();

// Use the same student-only predicate for table counts and paginated details.
export const adminPurchaseStudentWhere = {
  user: { role: "student" }
} satisfies Prisma.StudyProjectPurchaseWhereInput;

export type AdminProjectPurchasersPage = {
  projectTitle: string;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  users: Array<{ userId: string; username: string; purchasedAt: string }>;
};

export async function listAdminProjectPurchasers(input: z.infer<typeof adminProjectPurchasersSchema>): Promise<AdminProjectPurchasersPage | null> {
  const { kind, id, page } = adminProjectPurchasersSchema.parse(input);
  const pageSize = 20;
  // A read-only consistent snapshot keeps the total and the page in agreement.
  return prisma.$transaction(async (tx) => {
    const project = kind === "ai"
      ? await tx.aiStudyProject.findUnique({ where: { id }, select: { title: true } })
      : await tx.officialStudyMaterial.findUnique({ where: { id }, select: { title: true } });
    if (!project) return null;

    const where: Prisma.StudyProjectPurchaseWhereInput = {
      ...adminPurchaseStudentWhere,
      kind,
      ...(kind === "ai" ? { aiProjectId: id } : { officialMaterialId: id })
    };
    const totalCount = await tx.studyProjectPurchase.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(page, totalPages);
    const purchases = await tx.studyProjectPurchase.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        createdAt: true,
        user: { select: { id: true, username: true } }
      }
    });
    return {
      projectTitle: project.title,
      totalCount,
      page: currentPage,
      pageSize,
      totalPages,
      users: purchases.map((purchase) => ({
        userId: purchase.user.id,
        username: purchase.user.username,
        purchasedAt: purchase.createdAt.toISOString()
      }))
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
