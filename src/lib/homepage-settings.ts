import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const homepageTextDefaults = {
  brand: "Vibe Learning",
  navLearning: "学习方式",
  navBuddy: "学习搭子",
  navLogin: "登录",
  navContinue: "继续学习",
  heroTitleLead: "让备考，",
  heroTitleAccent: "一关一关有进步。",
  heroDescriptionLead: "为专转本学习准备的闯关路径、AI 答疑和学习搭子。",
  heroDescriptionMore: "从理解一个知识点，到完成一次练习，逐步积累你的进步。",
  actionStart: "开始学习",
  actionContinue: "继续学习",
  actionExisting: "已有账号，登录",
  actionCourse: "查看我的课程",
  pathLabel: "闯关学习",
  pathTitleLead: "下一步学什么，",
  pathTitleAccent: "清清楚楚。",
  pathDescriptionLead: "沿着学习路径，逐步学习与练习。",
  pathDescriptionMore: "完成当前挑战，再向下一关出发。",
  aiLabel: "AI 答疑",
  aiTitleLead: "没弄懂的地方，",
  aiTitleAccent: "接着问。",
  aiDescriptionLead: "查看题目讲解，继续追问困惑。",
  aiDescriptionMore: "把不明白的步骤，一点点弄清楚。",
  buddyLabel: "学习搭子",
  buddyTitleLead: "把你的资料，",
  buddyTitleAccent: "变成学习的起点。",
  buddyDescriptionLead: "整理知识大纲，生成知识卡片。",
  buddyDescriptionMore: "让每一份资料，都有清晰的学习方向。",
  buddyActionGuest: "登录体验学习搭子",
  buddyActionMember: "进入学习搭子",
  reviewLabel: "练习与复习",
  reviewTitleLead: "每一道错题，",
  reviewTitleAccent: "都有再学会的机会。",
  reviewDescriptionLead: "回顾做错的题，重新梳理思路。",
  reviewDescriptionMore: "在练习与复习中，逐步巩固所学。",
  closingTitleLead: "今天，",
  closingTitleAccent: "从第一关开始。",
  closingDescription: "选择学习方向，开始你的学习旅程。",
  footerHelp: "帮助中心",
  footerHelpGuest: "帮助中心（需登录）",
  footerAgreement: "用户协议",
  footerPrivacy: "隐私政策",
  skipLink: "跳转到主要内容",
  heroAlt: "学习伙伴带着书本，沿着彩色关卡一步步走向下一面旗帜。",
  pathAlt: "学习伙伴翻阅知识内容，身旁依次展示已完成、当前学习和待解锁的关卡。",
  aiAlt: "学习伙伴提出疑问，在分步骤的讲解中寻找思路。",
  buddyAlt: "学习搭子将一份学习资料整理成知识大纲和知识卡片。",
  reviewAlt: "学习伙伴用笔复习知识，错题记录逐步变成理解后的正确答案。",
  startAlt: "学习伙伴在旗帜旁挥手，欢迎你开始学习。"
};

export type HomepageTextKey = keyof typeof homepageTextDefaults;
export type HomepageText = Record<HomepageTextKey, string>;

type HomepageTextField = {
  key: HomepageTextKey;
  label: string;
  multiline?: boolean;
  maxLength?: number;
};

export const homepageTextGroups: ReadonlyArray<{ title: string; fields: ReadonlyArray<HomepageTextField> }> = [
  { title: "导航与品牌", fields: [
    { key: "brand", label: "品牌名称" },
    { key: "navLearning", label: "学习方式导航" },
    { key: "navBuddy", label: "学习搭子导航" },
    { key: "navLogin", label: "登录入口" },
    { key: "navContinue", label: "已登录入口" }
  ] },
  { title: "首屏", fields: [
    { key: "heroTitleLead", label: "标题第一行" },
    { key: "heroTitleAccent", label: "标题强调行" },
    { key: "heroDescriptionLead", label: "说明第一句", multiline: true },
    { key: "heroDescriptionMore", label: "说明第二句", multiline: true },
    { key: "actionStart", label: "开始按钮" },
    { key: "actionContinue", label: "已登录开始按钮" },
    { key: "actionExisting", label: "已有账号按钮" },
    { key: "actionCourse", label: "已登录课程按钮" }
  ] },
  { title: "闯关学习", fields: [
    { key: "pathLabel", label: "栏目名称" },
    { key: "pathTitleLead", label: "标题第一行" },
    { key: "pathTitleAccent", label: "标题强调行" },
    { key: "pathDescriptionLead", label: "说明第一句", multiline: true },
    { key: "pathDescriptionMore", label: "说明第二句", multiline: true }
  ] },
  { title: "AI 答疑", fields: [
    { key: "aiLabel", label: "栏目名称" },
    { key: "aiTitleLead", label: "标题第一行" },
    { key: "aiTitleAccent", label: "标题强调行" },
    { key: "aiDescriptionLead", label: "说明第一句", multiline: true },
    { key: "aiDescriptionMore", label: "说明第二句", multiline: true }
  ] },
  { title: "学习搭子", fields: [
    { key: "buddyLabel", label: "栏目名称" },
    { key: "buddyTitleLead", label: "标题第一行" },
    { key: "buddyTitleAccent", label: "标题强调行" },
    { key: "buddyDescriptionLead", label: "说明第一句", multiline: true },
    { key: "buddyDescriptionMore", label: "说明第二句", multiline: true },
    { key: "buddyActionGuest", label: "未登录体验入口" },
    { key: "buddyActionMember", label: "已登录体验入口" }
  ] },
  { title: "练习与复习", fields: [
    { key: "reviewLabel", label: "栏目名称" },
    { key: "reviewTitleLead", label: "标题第一行" },
    { key: "reviewTitleAccent", label: "标题强调行" },
    { key: "reviewDescriptionLead", label: "说明第一句", multiline: true },
    { key: "reviewDescriptionMore", label: "说明第二句", multiline: true }
  ] },
  { title: "底部与页脚", fields: [
    { key: "closingTitleLead", label: "结束标题第一段" },
    { key: "closingTitleAccent", label: "结束标题强调段" },
    { key: "closingDescription", label: "结束说明", multiline: true },
    { key: "footerHelp", label: "帮助中心链接" },
    { key: "footerHelpGuest", label: "未登录帮助中心链接" },
    { key: "footerAgreement", label: "用户协议链接" },
    { key: "footerPrivacy", label: "隐私政策链接" },
    { key: "skipLink", label: "键盘跳过导航文案" }
  ] },
  { title: "图片替代文本", fields: [
    { key: "heroAlt", label: "首屏图片说明", multiline: true },
    { key: "pathAlt", label: "闯关图片说明", multiline: true },
    { key: "aiAlt", label: "AI 图片说明", multiline: true },
    { key: "buddyAlt", label: "学习搭子图片说明", multiline: true },
    { key: "reviewAlt", label: "复习图片说明", multiline: true },
    { key: "startAlt", label: "底部图片说明", multiline: true }
  ] }
];

export const homepageImageSlots = ["hero", "learning-path", "ai-explanation", "study-buddy", "review", "start"] as const;
export type HomepageImageSlot = (typeof homepageImageSlots)[number];

export const homepageImageLabels: Record<HomepageImageSlot, string> = {
  hero: "首屏插画",
  "learning-path": "闯关学习插画",
  "ai-explanation": "AI 答疑插画",
  "study-buddy": "学习搭子插画",
  review: "练习与复习插画",
  start: "底部入口插画"
};

export const getHomepageText = cache(async (): Promise<HomepageText> => {
  let saved: unknown;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { id: "default" }, select: { homepageContent: true } });
    saved = row?.homepageContent;
  } catch (error) {
    console.error("Failed to load homepage content, using defaults", error);
  }
  const entries = saved && typeof saved === "object" && !Array.isArray(saved)
    ? saved as Record<string, unknown>
    : {};
  const result = { ...homepageTextDefaults } as HomepageText;
  for (const key of Object.keys(homepageTextDefaults) as HomepageTextKey[]) {
    if (typeof entries[key] === "string" && entries[key].trim()) {
      result[key] = entries[key] as string;
    }
  }
  return result;
});

export async function getHomepageImageUrls(): Promise<Record<HomepageImageSlot, string>> {
  const urls = Object.fromEntries(homepageImageSlots.map((slot) => [slot, `/images/homepage/${slot}.webp`])) as Record<HomepageImageSlot, string>;
  try {
    const images = await prisma.homepageImage.findMany({ select: { slot: true, updatedAt: true } });
    for (const image of images) {
      if (homepageImageSlots.includes(image.slot as HomepageImageSlot)) {
        urls[image.slot as HomepageImageSlot] = `/api/homepage/images/${image.slot}?v=${image.updatedAt.getTime()}`;
      }
    }
  } catch (error) {
    console.error("Failed to load homepage image settings, using defaults", error);
  }
  return urls;
}
