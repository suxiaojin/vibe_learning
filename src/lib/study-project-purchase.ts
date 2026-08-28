import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { projectDiamondPriceSchema } from "@/lib/project-diamond-price";
import { getStudyProjectOffer, type StudyProjectOffer } from "@/lib/study-project-access";
import { getBeijingDate, InsufficientDiamondBalanceError } from "@/lib/rewards";

export const studyProjectPurchaseSchema = z.object({
  kind: z.enum(["ai", "official"]),
  id: z.string().trim().min(1).max(120),
  expectedDiamondPrice: projectDiamondPriceSchema,
  confirmed: z.boolean().optional()
}).strict();

export class StudyProjectPriceChangedError extends Error {
  constructor(readonly offer: StudyProjectOffer) {
    super("项目价格已更新，请确认新价格后再次打开。");
    this.name = "StudyProjectPriceChangedError";
  }
}

export class StudyProjectConfirmationRequiredError extends Error {
  constructor(readonly offer: StudyProjectOffer) {
    super("请确认购买后再打开项目。");
    this.name = "StudyProjectConfirmationRequiredError";
  }
}

export async function purchaseStudyProject(userId: string, input: z.infer<typeof studyProjectPurchaseSchema>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Keep the quoted price and publication state stable until the purchase commits.
        if (input.kind === "ai") {
          await tx.$queryRaw`SELECT "id" FROM "ai_study_projects" WHERE "id" = ${input.id} FOR SHARE`;
        } else {
          await tx.$queryRaw`SELECT "id" FROM "official_study_materials" WHERE "id" = ${input.id} FOR SHARE`;
        }
        const offer = await getStudyProjectOffer(userId, input.kind, input.id, tx);
        if (offer.purchased || offer.owned) {
          return { offer, charged: false };
        }
        if (offer.diamondPrice !== input.expectedDiamondPrice) {
          throw new StudyProjectPriceChangedError(offer);
        }
        if (!offer.requiresPurchase) return { offer, charged: false };
        if (input.confirmed !== true) throw new StudyProjectConfirmationRequiredError(offer);

        const account = await tx.diamondAccount.upsert({
          where: { userId }, update: {}, create: { userId, balance: 0 }
        });
        const deducted = await tx.diamondAccount.updateMany({
          where: { id: account.id, balance: { gte: offer.diamondPrice } },
          data: { balance: { decrement: offer.diamondPrice } }
        });
        if (deducted.count !== 1) {
          throw new InsufficientDiamondBalanceError(offer.diamondPrice, account.balance);
        }
        const updatedAccount = await tx.diamondAccount.findUniqueOrThrow({
          where: { id: account.id }, select: { balance: true }
        });
        const transaction = await tx.diamondTransaction.create({
          data: {
            userId,
            accountId: account.id,
            type: "project_purchase",
            amount: -offer.diamondPrice,
            balanceAfter: updatedAccount.balance,
            occurredOn: getBeijingDate(),
            dedupeKey: `study_project_purchase:${userId}:${input.kind}:${input.id}`,
            note: `学习搭子：购买《${offer.title}》`,
            metadata: {
              resourceKind: input.kind,
              resourceId: input.id,
              titleSnapshot: offer.title,
              configuredAmount: offer.diamondPrice
            }
          },
          select: { id: true }
        });
        await tx.studyProjectPurchase.create({
          data: {
            userId,
            kind: input.kind,
            resourceId: input.id,
            aiProjectId: input.kind === "ai" ? input.id : null,
            officialMaterialId: input.kind === "official" ? input.id : null,
            titleSnapshot: offer.title,
            diamondPrice: offer.diamondPrice,
            transactionId: transaction.id
          }
        });
        return { offer: { ...offer, purchased: true, requiresPurchase: false }, charged: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // A concurrent purchase/spend retries with a fresh entitlement and balance snapshot.
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002")) {
        continue;
      }
      throw error;
    }
  }
}
