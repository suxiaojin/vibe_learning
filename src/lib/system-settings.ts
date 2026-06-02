import { prisma } from "@/lib/prisma";

export const systemSettingsId = "default";

export const systemSettingsDefaults = {
  id: systemSettingsId,
  loginHeroImageUrl: "/login-hero-vibelearning.png",
  loginMarketingTitle: "新注册用户限时赠送学习加速包",
  loginMarketingDescription: "完成注册即可开启江苏专转本计算机闯关学习",
  loginWelcomeTitle: "Welcome to VibeLearning"
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
