import { prisma } from "@/lib/prisma";

export const systemSettingsId = "default";

export const systemSettingsDefaults = {
  id: systemSettingsId,
  loginHeroImageUrl: "/login-hero-vibelearning.png",
  loginMarketingIcon: "gift",
  loginMarketingTitle: "新注册用户限时赠送学习加速包",
  loginMarketingDescription: "完成注册即可开启江苏专转本计算机闯关学习",
  loginWelcomeTitle: "Welcome to VibeLearning",
  userAgreementContent: "test",
  privacyPolicyContent: "test",
  platformAgreementContent: "test",
  faqContent: "常见问题内容正在完善中。",
  changelogContent: "",
  customerServiceEmail: "714399532@qq.com",
  diamondRechargeQrCodeUrl: "",
  profileHomepageBackgroundImageUrl: "",
  profileHomepageBackgroundUpdatedAt: null as Date | null,
  learningPathTheme: "default",
  studyBuddyHeroImageUrl: "/ai-study/study-buddy-hero.webp",
  studyBuddyHeroTitle: "好好学习，早日上岸",
  studyBuddyHeroEffect: "typewriter",
  studyBuddyHeroTypeSpeedMs: 105
};

export type PublicSystemSettings = typeof systemSettingsDefaults & {
  createdAt?: Date;
  updatedAt?: Date;
};

export async function getSystemSettings(): Promise<PublicSystemSettings> {
  try {
    return await prisma.systemSetting.upsert({
      where: { id: systemSettingsId },
      update: {},
      create: systemSettingsDefaults
    });
  } catch (error) {
    console.error("Failed to load system settings, using defaults", error);
    return systemSettingsDefaults;
  }
}
