import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const maxDiamondRuleAmount = 1_000_000;
export const dailyAnswerStepSize = 10;

type DiamondRuleDefinitionShape = {
  key: string;
  direction: "grant" | "consume";
  label: string;
  description: string;
  triggerTiming: string;
  defaultAmount: number;
  defaultEnabled: boolean;
  sortOrder: number;
};

export const diamondRuleDefinitions = [
  {
    key: "register_bonus",
    direction: "grant",
    label: "注册赠送",
    description: "学生首次完成注册时赠送钻石。",
    triggerTiming: "注册事务成功提交前",
    defaultAmount: 100,
    defaultEnabled: true,
    sortOrder: 10
  },
  {
    key: "daily_active_novice",
    direction: "grant",
    label: "每日首次访问 - 小白",
    description: "小白勋章学生当天首次认证访问时赠送钻石。",
    triggerTiming: "北京时间当天首次认证访问",
    defaultAmount: 10,
    defaultEnabled: true,
    sortOrder: 20
  },
  {
    key: "daily_active_expert",
    direction: "grant",
    label: "每日首次访问 - 达人",
    description: "达人勋章学生当天首次认证访问时赠送钻石。",
    triggerTiming: "北京时间当天首次认证访问",
    defaultAmount: 15,
    defaultEnabled: true,
    sortOrder: 30
  },
  {
    key: "daily_active_scholar",
    direction: "grant",
    label: "每日首次访问 - 学霸",
    description: "学霸勋章学生当天首次认证访问时赠送钻石。",
    triggerTiming: "北京时间当天首次认证访问",
    defaultAmount: 20,
    defaultEnabled: true,
    sortOrder: 40
  },
  {
    key: "daily_answer_bonus",
    direction: "grant",
    label: "每日答题阶梯奖励",
    description: `学生当天累计答题每满 ${dailyAnswerStepSize} 题时赠送钻石，重复答题也计数。`,
    triggerTiming: `跨过当天每 ${dailyAnswerStepSize} 题阶梯时`,
    defaultAmount: 5,
    defaultEnabled: true,
    sortOrder: 50
  },
  {
    key: "ai_study_project_create",
    direction: "consume",
    label: "学习搭子 - 创建项目",
    description: "学生在学习搭子“我的项目”中成功创建一个学习项目后扣减钻石。",
    triggerTiming: "点击创建项目并成功启动解析时",
    defaultAmount: 50,
    defaultEnabled: true,
    sortOrder: 110
  },
  {
    key: "ai_study_buddy_chat",
    direction: "consume",
    label: "学习搭子 - 问问搭子",
    description: "学生在学习搭子项目详情页发送“问问搭子”消息并准备调用大模型时扣减钻石。",
    triggerTiming: "发送消息保存成功并进入模型调用前",
    defaultAmount: 5,
    defaultEnabled: true,
    sortOrder: 120
  },
  {
    key: "wrong_question_ai_explanation",
    direction: "consume",
    label: "课程闯关 - AI解释",
    description: "学生在答题结果页首次请求某道已作答题目的 AI 解释时扣减钻石。",
    triggerTiming: "首次解释请求通过校验并创建 AI 对话记录时",
    defaultAmount: 5,
    defaultEnabled: true,
    sortOrder: 130
  },
  {
    key: "wrong_question_ai_follow_up",
    direction: "consume",
    label: "课程闯关 - AI追问",
    description: "学生在答题结果页针对已作答题目每次提交追问并准备调用大模型时扣减钻石。",
    triggerTiming: "每次追问请求通过校验并创建 AI 对话记录时",
    defaultAmount: 2,
    defaultEnabled: true,
    sortOrder: 140
  },
  {
    key: "special_practice_ai_doubt",
    direction: "consume",
    label: "专项练习 - AI答疑",
    description: "学生在专项练习页面首次请求某道题的 AI 答疑时扣减钻石。",
    triggerTiming: "首次答疑请求通过校验并创建 AI 对话记录时",
    defaultAmount: 5,
    defaultEnabled: true,
    sortOrder: 150
  },
  {
    key: "special_practice_ai_follow_up",
    direction: "consume",
    label: "专项练习 - 提问",
    description: "学生在专项练习 AI 答疑弹窗每次提交问题并准备调用大模型时扣减钻石。",
    triggerTiming: "每次提问请求通过校验并创建 AI 对话记录时",
    defaultAmount: 2,
    defaultEnabled: true,
    sortOrder: 160
  }
] as const satisfies readonly DiamondRuleDefinitionShape[];

export type DiamondRuleKey = (typeof diamondRuleDefinitions)[number]["key"];
export type DiamondRuleDefinition = Omit<DiamondRuleDefinitionShape, "key"> & {
  key: DiamondRuleKey;
};

export type ResolvedDiamondRuleConfig = {
  key: DiamondRuleKey;
  direction: "grant" | "consume";
  amount: number;
  enabled: boolean;
  version: number;
};

export type DiamondRuleSettingItem = DiamondRuleDefinition & {
  amount: number;
  enabled: boolean;
  version: number;
  updatedAt: Date | null;
  updatedByUsername: string | null;
};

const definitionByKey = new Map<string, DiamondRuleDefinition>(
  diamondRuleDefinitions.map((definition) => [definition.key, definition])
);

export function getDiamondRuleDefinition(value: string) {
  return definitionByKey.get(value);
}

export async function getDiamondRuleConfig(
  client: Prisma.TransactionClient,
  key: DiamondRuleKey
): Promise<ResolvedDiamondRuleConfig> {
  const definition = definitionByKey.get(key);
  if (!definition) {
    throw new Error(`Unknown diamond rule: ${key}`);
  }

  const config = await client.diamondRuleConfig.findUnique({
    where: { key },
    select: {
      key: true,
      direction: true,
      amount: true,
      enabled: true,
      version: true
    }
  });

  if (!config) {
    return {
      key,
      direction: definition.direction,
      amount: definition.defaultAmount,
      enabled: definition.defaultEnabled,
      version: 1
    };
  }

  return {
    key,
    direction: config.direction,
    amount: config.amount,
    enabled: config.enabled,
    version: config.version
  };
}

export async function ensureDiamondRuleConfigs() {
  await prisma.diamondRuleConfig.createMany({
    data: diamondRuleDefinitions.map((definition) => ({
      key: definition.key,
      direction: definition.direction,
      amount: definition.defaultAmount,
      enabled: definition.defaultEnabled
    })),
    skipDuplicates: true
  });
}

export async function listDiamondRuleSettings(): Promise<DiamondRuleSettingItem[]> {
  await ensureDiamondRuleConfigs();

  const configs = await prisma.diamondRuleConfig.findMany({
    where: { key: { in: diamondRuleDefinitions.map((definition) => definition.key) } },
    include: {
      updatedBy: {
        select: { username: true }
      }
    }
  });
  const configByKey = new Map(configs.map((config) => [config.key, config]));

  return diamondRuleDefinitions
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((definition) => {
      const config = configByKey.get(definition.key);
      return {
        ...definition,
        amount: config?.amount ?? definition.defaultAmount,
        enabled: config?.enabled ?? definition.defaultEnabled,
        version: config?.version ?? 1,
        updatedAt: config?.updatedAt ?? null,
        updatedByUsername: config?.updatedBy?.username ?? null
      };
    });
}
