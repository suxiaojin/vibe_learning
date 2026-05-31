import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MedalLevel = "novice" | "expert" | "scholar";

export type DiamondRewardGrant = {
  type: "daily_active_bonus" | "daily_answer_bonus" | "register_bonus";
  amount: number;
  balanceAfter: number;
};

export const medalRules: Array<{
  level: MedalLevel;
  label: string;
  minAttempts: number;
  dailyLoginBonus: number;
}> = [
  { level: "novice", label: "小白", minAttempts: 0, dailyLoginBonus: 10 },
  { level: "expert", label: "达人", minAttempts: 400, dailyLoginBonus: 15 },
  { level: "scholar", label: "学霸", minAttempts: 600, dailyLoginBonus: 20 }
];

const dailyAnswerStepSize = 10;
const dailyAnswerStepBonus = 5;

type RewardTransactionClient = Prisma.TransactionClient;

function uniqueConstraintFailed(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function getBeijingDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return `${valueByType.get("year")}-${valueByType.get("month")}-${valueByType.get("day")}`;
}

export function getBeijingDate(date = new Date()) {
  return new Date(`${getBeijingDateKey(date)}T00:00:00.000Z`);
}

export function getMedalLevel(totalAttempts: number): MedalLevel {
  if (totalAttempts >= 600) {
    return "scholar";
  }
  if (totalAttempts >= 400) {
    return "expert";
  }
  return "novice";
}

export function getMedalRule(level: MedalLevel) {
  return medalRules.find((rule) => rule.level === level) || medalRules[0];
}

export async function ensureDiamondAccount(userId: string) {
  return prisma.diamondAccount.upsert({
    where: { userId },
    update: {},
    create: { userId, balance: 0 }
  });
}

async function grantDiamonds(
  tx: RewardTransactionClient,
  input: {
    userId: string;
    type: "register_bonus" | "daily_active_bonus" | "daily_answer_bonus";
    amount: number;
    occurredOn: Date;
    dedupeKey: string;
    note: string;
    metadata?: Prisma.InputJsonValue;
  }
): Promise<DiamondRewardGrant | null> {
  const existing = await tx.diamondTransaction.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true }
  });
  if (existing) {
    return null;
  }

  const account = await tx.diamondAccount.upsert({
    where: { userId: input.userId },
    update: {},
    create: { userId: input.userId, balance: 0 }
  });
  const updatedAccount = await tx.diamondAccount.update({
    where: { userId: input.userId },
    data: { balance: { increment: input.amount } },
    select: { balance: true }
  });

  await tx.diamondTransaction.create({
    data: {
      userId: input.userId,
      accountId: account.id,
      type: input.type,
      amount: input.amount,
      balanceAfter: updatedAccount.balance,
      occurredOn: input.occurredOn,
      dedupeKey: input.dedupeKey,
      note: input.note,
      metadata: input.metadata
    }
  });

  return {
    type: input.type,
    amount: input.amount,
    balanceAfter: updatedAccount.balance
  };
}

export async function grantRegisterDiamondBonus(tx: RewardTransactionClient, userId: string) {
  return grantDiamonds(tx, {
    userId,
    type: "register_bonus",
    amount: 100,
    occurredOn: getBeijingDate(),
    dedupeKey: `${userId}:register_bonus`,
    note: "注册赠送 100 钻石"
  });
}

export async function recordDailyActiveDiamondBonus(userId: string) {
  const dateKey = getBeijingDateKey();
  const dedupeKey = `${userId}:daily_active:${dateKey}`;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.diamondTransaction.findUnique({
        where: { dedupeKey },
        select: { id: true }
      });
      if (existing) {
        return null;
      }

      const totalAttempts = await tx.questionAttempt.count({ where: { userId } });
      const medal = getMedalRule(getMedalLevel(totalAttempts));

      return grantDiamonds(tx, {
        userId,
        type: "daily_active_bonus",
        amount: medal.dailyLoginBonus,
        occurredOn: getBeijingDate(),
        dedupeKey,
        note: `每日首次访问奖励：${medal.label} +${medal.dailyLoginBonus} 钻石`,
        metadata: { dateKey, medalLevel: medal.level, medalLabel: medal.label }
      });
    });
  } catch (error) {
    if (uniqueConstraintFailed(error)) {
      return null;
    }
    throw error;
  }
}

export async function grantDailyAnswerDiamondBonuses(userId: string, occurredOn: Date, fromStep: number, toStep: number) {
  const dateKey = getBeijingDateKey(occurredOn);
  const grants: DiamondRewardGrant[] = [];

  for (let step = fromStep; step <= toStep; step += 1) {
    const dedupeKey = `${userId}:daily_answer:${dateKey}:${step}`;
    try {
      const grant = await prisma.$transaction((tx) =>
        grantDiamonds(tx, {
          userId,
          type: "daily_answer_bonus",
          amount: dailyAnswerStepBonus,
          occurredOn,
          dedupeKey,
          note: `每日答题达到 ${step * dailyAnswerStepSize} 道奖励 ${dailyAnswerStepBonus} 钻石`,
          metadata: {
            dateKey,
            step,
            threshold: step * dailyAnswerStepSize
          }
        })
      );

      if (grant) {
        grants.push(grant);
      }
    } catch (error) {
      if (!uniqueConstraintFailed(error)) {
        throw error;
      }
    }
  }

  return grants;
}
