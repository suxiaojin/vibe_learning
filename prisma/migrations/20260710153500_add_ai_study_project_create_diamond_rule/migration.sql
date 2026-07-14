INSERT INTO "diamond_rule_configs"
  ("key", "direction", "amount", "enabled", "version", "updatedAt")
VALUES
  ('ai_study_project_create', 'consume', 50, true, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
