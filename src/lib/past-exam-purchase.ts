import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { projectDiamondPriceSchema } from "@/lib/project-diamond-price";
import { getBeijingDate, InsufficientDiamondBalanceError } from "@/lib/rewards";
import { henanEnglishPastExamScope } from "@/lib/henan-english-past-exams";

type Db = Pick<Prisma.TransactionClient, "studentProfile" | "examPaper">;
export const pastExamPurchaseSchema = z.object({
  courseKey: z.enum(["major", "public_subject"]),
  entry: z.literal("henan_english").optional(),
  expectedDiamondPrice: projectDiamondPriceSchema,
  confirmed: z.boolean().optional()
}).strict().refine((input) => !input.entry || input.courseKey === "public_subject");

export async function pastExamScope(userId: string, courseKey: "major" | "public_subject", db: Db = prisma): Promise<Prisma.ExamPaperWhereInput> {
  const profile = await db.studentProfile.findUnique({ where: { userId }, select: { regionId: true, majorId: true, publicSubjectId: true } });
  const ownerId = courseKey === "major" ? profile?.majorId : profile?.publicSubjectId;
  return {
    ...(profile?.regionId && ownerId ? { regionId: profile.regionId, ...(courseKey === "major" ? { majorId: ownerId } : { publicSubjectId: ownerId }) } : { id: { in: [] } }),
    ownerType: courseKey, paperType: "real_exam", status: "published", visibleInPastPractice: true,
    questions: { some: { question: { status: "published" } } }
  };
}

export async function getPastExamOffer(userId: string, courseKey: "major" | "public_subject", paperId: string, db: Db = prisma, entry?: "henan_english") {
  const scope = entry === "henan_english"
    ? henanEnglishPastExamScope(userId)
    : await pastExamScope(userId, courseKey, db);
  const paper = await db.examPaper.findFirst({
    where: { AND: [scope, { id: paperId }] },
    select: { id: true, title: true, diamondPrice: true, purchases: { where: { userId }, select: { id: true }, take: 1 } }
  });
  if (!paper) throw new PastExamPurchaseError("题库不存在或暂不可用。", 404, "PAST_EXAM_NOT_FOUND");
  const purchased = paper.purchases.length > 0;
  const id = encodeURIComponent(paper.id);
  const href = entry === "henan_english"
    ? `/course-center/english-past-exams/${id}`
    : `/mock-tests/special/past/${id}?course=${courseKey}`;
  return { id: paper.id, title: paper.title, diamondPrice: paper.diamondPrice, purchased, requiresPurchase: paper.diamondPrice > 0 && !purchased, href };
}
export type PastExamOffer = Awaited<ReturnType<typeof getPastExamOffer>>;

export class PastExamPurchaseError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly offer?: PastExamOffer) { super(message); }
}

export async function purchasePastExam(userId: string, paperId: string, input: z.infer<typeof pastExamPurchaseSchema>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "exam_papers" WHERE "id" = ${paperId} FOR SHARE`;
        const offer = await getPastExamOffer(userId, input.courseKey, paperId, tx, input.entry);
        if (offer.purchased) return { offer, charged: false };
        if (offer.diamondPrice !== input.expectedDiamondPrice) throw new PastExamPurchaseError("题库价格已更新，请确认新价格后再次购买。", 409, "PAST_EXAM_PRICE_CHANGED", offer);
        if (!offer.requiresPurchase) return { offer, charged: false };
        if (input.confirmed !== true) throw new PastExamPurchaseError("请确认购买后再开始答题。", 409, "PAST_EXAM_CONFIRMATION_REQUIRED", offer);
        const account = await tx.diamondAccount.upsert({ where: { userId }, update: {}, create: { userId, balance: 0 } });
        const debit = await tx.diamondAccount.updateMany({ where: { id: account.id, balance: { gte: offer.diamondPrice } }, data: { balance: { decrement: offer.diamondPrice } } });
        if (debit.count !== 1) throw new InsufficientDiamondBalanceError(offer.diamondPrice, account.balance);
        const updated = await tx.diamondAccount.findUniqueOrThrow({ where: { id: account.id }, select: { balance: true } });
        const transaction = await tx.diamondTransaction.create({ data: {
          userId, accountId: account.id, type: "project_purchase", amount: -offer.diamondPrice, balanceAfter: updated.balance,
          occurredOn: getBeijingDate(), dedupeKey: `past_exam_purchase:${userId}:${paperId}`,
          note: `历年真题：购买《${offer.title}》`,
          metadata: { resourceKind: "past_exam", resourceId: paperId, titleSnapshot: offer.title, configuredAmount: offer.diamondPrice }
        }, select: { id: true } });
        await tx.pastExamPurchase.create({ data: { userId, resourceId: paperId, paperId, titleSnapshot: offer.title, diamondPrice: offer.diamondPrice, transactionId: transaction.id } });
        return { offer: { ...offer, purchased: true, requiresPurchase: false }, charged: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}
