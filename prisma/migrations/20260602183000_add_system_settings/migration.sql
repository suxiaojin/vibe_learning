CREATE TABLE "system_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "loginHeroImageUrl" TEXT NOT NULL DEFAULT '/login-hero-vibelearning.png',
  "loginMarketingTitle" TEXT NOT NULL DEFAULT '新注册用户限时赠送学习加速包',
  "loginMarketingDescription" TEXT NOT NULL DEFAULT '完成注册即可开启江苏专转本计算机闯关学习',
  "loginWelcomeTitle" TEXT NOT NULL DEFAULT 'Welcome to VibeLearning',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "system_settings" (
  "id",
  "loginHeroImageUrl",
  "loginMarketingTitle",
  "loginMarketingDescription",
  "loginWelcomeTitle"
) VALUES (
  'default',
  '/login-hero-vibelearning.png',
  '新注册用户限时赠送学习加速包',
  '完成注册即可开启江苏专转本计算机闯关学习',
  'Welcome to VibeLearning'
) ON CONFLICT ("id") DO NOTHING;
