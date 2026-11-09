INSERT INTO "diamond_rule_configs" ("key", "direction", "amount", "enabled", "version", "createdAt", "updatedAt")
VALUES ('past_exam_ai_follow_up', 'consume', 2, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
