import { Prisma } from "@prisma/client";
import {
  type DiamondRuleKey,
  dailyAnswerStepSize,
  getDiamondRuleConfig
} from "@/lib/diamond-rules";
import { prisma } from "@/lib/prisma";

export type MedalLevel = "novice" | "expert" | "scholar";

export type DiamondRewardGrant = {
  type: "daily_active_bonus" | "daily_answer_bonus" | "register_bonus";
  amount: number;
  balanceAfter: number;
};

export type DiamondConsumption = {
  amount: number;
  balanceAfter: number;
  alreadyProcessed: boolean;
};

export class InsufficientDiamondBalanceError extends Error {
  constructor(readonly requiredAmount: number, readonly currentBalance: number) {
    super("Insufficient diamond balance");
    this.name = "InsufficientDiamondBalanceError";
  }
}

export const medalRules: Array<{
  level: MedalLevel;
  label: string;
  minAttempts: number;
  dailyActiveRuleKey: DiamondRuleKey;
}> = [
  { level: "novice", label: "小白", minAttempts: 0, dailyActiveRuleKey: "daily_active_novice" },
  { level: "expert", label: "达人", minAttempts: 400, dailyActiveRuleKey: "daily_active_expert" },
  { level: "scholar", label: "学霸", minAttempts: 600, dailyActiveRuleKey: "daily_active_scholar" }
];

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
    ruleKey: DiamondRuleKey;
    ruleVersion: number;
    metadata?: Prisma.InputJsonObject;
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
      metadata: {
        ...input.metadata,
        diamondRuleKey: input.ruleKey,
        diamondRuleVersion: input.ruleVersion,
        configuredAmount: input.amount
      }
    }
  });

  return {
    type: input.type,
    amount: input.amount,
    balanceAfter: updatedAccount.balance
  };
}

export async function consumeDiamondsByRule(
  tx: RewardTransactionClient,
  input: {
    userId: string;
    ruleKey: DiamondRuleKey;
    dedupeKey: string;
    note: string;
    metadata?: Prisma.InputJsonObject;
  }
): Promise<DiamondConsumption | null> {
  const existing = await tx.diamondTransaction.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { amount: true, balanceAfter: true }
  });
  if (existing) {
    return {
      amount: Math.abs(existing.amount),
      balanceAfter: existing.balanceAfter,
      alreadyProcessed: true
    };
  }

  const rule = await getDiamondRuleConfig(tx, input.ruleKey);
  if (rule.direction !== "consume") {
    throw new Error(`Diamond rule is not a consume rule: ${rule.key}`);
  }
  if (!rule.enabled) {
    return null;
  }

  const account = await tx.diamondAccount.upsert({
    where: { userId: input.userId },
    update: {},
    create: { userId: input.userId, balance: 0 }
  });
  const deducted = await tx.diamondAccount.updateMany({
    where: {
      id: account.id,
      balance: { gte: rule.amount }
    },
    data: {
      balance: { decrement: rule.amount }
    }
  });

  if (deducted.count !== 1) {
    const current = await tx.diamondAccount.findUnique({
      where: { id: account.id },
      select: { balance: true }
    });
    throw new InsufficientDiamondBalanceError(rule.amount, current?.balance ?? 0);
  }

  const updatedAccount = await tx.diamondAccount.findUniqueOrThrow({
    where: { id: account.id },
    select: { balance: true }
  });

  await tx.diamondTransaction.create({
    data: {
      userId: input.userId,
      accountId: account.id,
      type: "ai_consumption",
      amount: -rule.amount,
      balanceAfter: updatedAccount.balance,
      occurredOn: getBeijingDate(),
      dedupeKey: input.dedupeKey,
      note: input.note,
      metadata: {
        ...input.metadata,
        diamondRuleKey: rule.key,
        diamondRuleVersion: rule.version,
        configuredAmount: rule.amount
      }
    }
  });

  return {
    amount: rule.amount,
    balanceAfter: updatedAccount.balance,
    alreadyProcessed: false
  };
}

export async function grantRegisterDiamondBonus(tx: RewardTransactionClient, userId: string) {
  const rule = await getDiamondRuleConfig(tx, "register_bonus");
  if (!rule.enabled) {
    return null;
  }

  return grantDiamonds(tx, {
    userId,
    type: "register_bonus",
    amount: rule.amount,
    occurredOn: getBeijingDate(),
    dedupeKey: `${userId}:register_bonus`,
    note: `注册赠送 ${rule.amount} 钻石`,
    ruleKey: rule.key,
    ruleVersion: rule.version
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
      const rule = await getDiamondRuleConfig(tx, medal.dailyActiveRuleKey);
      if (!rule.enabled) {
        return null;
      }

      return grantDiamonds(tx, {
        userId,
        type: "daily_active_bonus",
        amount: rule.amount,
        occurredOn: getBeijingDate(),
        dedupeKey,
        note: `每日首次访问奖励：${medal.label} +${rule.amount} 钻石`,
        ruleKey: rule.key,
        ruleVersion: rule.version,
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
  const rule = await getDiamondRuleConfig(prisma, "daily_answer_bonus");
  if (!rule.enabled) {
    return grants;
  }

  for (let step = fromStep; step <= toStep; step += 1) {
    const dedupeKey = `${userId}:daily_answer:${dateKey}:${step}`;
    try {
      const grant = await prisma.$transaction((tx) =>
        grantDiamonds(tx, {
          userId,
          type: "daily_answer_bonus",
          amount: rule.amount,
          occurredOn,
          dedupeKey,
          note: `每日答题达到 ${step * dailyAnswerStepSize} 道奖励 ${rule.amount} 钻石`,
          ruleKey: rule.key,
          ruleVersion: rule.version,
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
