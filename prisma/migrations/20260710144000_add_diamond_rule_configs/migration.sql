CREATE TYPE "DiamondRuleDirection" AS ENUM ('grant', 'consume');

CREATE TABLE "diamond_rule_configs" (
  "key" TEXT NOT NULL,
  "direction" "DiamondRuleDirection" NOT NULL,
  "amount" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "diamond_rule_configs_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "diamond_rule_configs_amount_check" CHECK ("amount" BETWEEN 1 AND 1000000),
  CONSTRAINT "diamond_rule_configs_version_check" CHECK ("version" >= 1)
);

CREATE INDEX "diamond_rule_configs_direction_enabled_idx"
  ON "diamond_rule_configs"("direction", "enabled");

CREATE INDEX "diamond_rule_configs_updatedById_idx"
  ON "diamond_rule_configs"("updatedById");

ALTER TABLE "diamond_rule_configs"
  ADD CONSTRAINT "diamond_rule_configs_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "diamond_rule_configs"
  ("key", "direction", "amount", "enabled", "version", "updatedAt")
VALUES
  ('register_bonus', 'grant', 100, true, 1, CURRENT_TIMESTAMP),
  ('daily_active_novice', 'grant', 10, true, 1, CURRENT_TIMESTAMP),
  ('daily_active_expert', 'grant', 15, true, 1, CURRENT_TIMESTAMP),
  ('daily_active_scholar', 'grant', 20, true, 1, CURRENT_TIMESTAMP),
  ('daily_answer_bonus', 'grant', 5, true, 1, CURRENT_TIMESTAMP);
