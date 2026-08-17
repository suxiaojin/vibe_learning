INSERT INTO "diamond_rule_configs"
  ("key", "direction", "amount", "enabled", "version", "updatedAt")
VALUES
  ('wrong_question_ai_explanation', 'consume', 5, true, 1, CURRENT_TIMESTAMP),
  ('wrong_question_ai_follow_up', 'consume', 2, true, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
