ALTER TABLE "system_settings"
  ADD COLUMN "loginMarketingIcon" TEXT NOT NULL DEFAULT 'gift',
  ADD COLUMN "userAgreementContent" TEXT NOT NULL DEFAULT 'test',
  ADD COLUMN "privacyPolicyContent" TEXT NOT NULL DEFAULT 'test',
  ADD COLUMN "platformAgreementContent" TEXT NOT NULL DEFAULT 'test';
