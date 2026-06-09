CREATE TYPE "ShareCopyContext" AS ENUM ('question_correct', 'question_wrong', 'quiz_passed', 'quiz_failed', 'active_learning');

CREATE TABLE "share_copy_styles" (
  "id" TEXT NOT NULL,
  "context" "ShareCopyContext" NOT NULL,
  "label" TEXT NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'published',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "share_copy_styles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "share_copy_phrases" (
  "id" TEXT NOT NULL,
  "styleId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'published',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "share_copy_phrases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "share_copy_styles_context_status_sortOrder_idx" ON "share_copy_styles"("context", "status", "sortOrder");
CREATE INDEX "share_copy_phrases_styleId_status_sortOrder_idx" ON "share_copy_phrases"("styleId", "status", "sortOrder");

ALTER TABLE "share_copy_phrases"
  ADD CONSTRAINT "share_copy_phrases_styleId_fkey"
  FOREIGN KEY ("styleId") REFERENCES "share_copy_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "share_copy_styles" ("id", "context", "label", "sortOrder") VALUES
  ('share-style-question-correct-typical', 'question_correct', '考点典型', 10),
  ('share-style-question-correct-frequency', 'question_correct', '高频收藏', 20),
  ('share-style-question-correct-review', 'question_correct', '复习提醒', 30),
  ('share-style-question-wrong-help', 'question_wrong', '求助讨论', 10),
  ('share-style-question-wrong-review', 'question_wrong', '错题复盘', 20),
  ('share-style-question-wrong-idea', 'question_wrong', '想听思路', 30),
  ('share-style-quiz-passed-continue', 'quiz_passed', '继续冲', 10),
  ('share-style-quiz-passed-clear', 'quiz_passed', '满血通关', 20),
  ('share-style-quiz-passed-checkin', 'quiz_passed', '打卡记录', 30),
  ('share-style-quiz-failed-review', 'quiz_failed', '复盘再战', 10),
  ('share-style-quiz-failed-weakness', 'quiz_failed', '错题提醒', 20),
  ('share-style-quiz-failed-steady', 'quiz_failed', '稳住节奏', 30),
  ('share-style-active-rhythm', 'active_learning', '学习节奏', 10),
  ('share-style-active-checkin', 'active_learning', '坚持打卡', 20),
  ('share-style-active-buddy', 'active_learning', '搭子监督', 30);

INSERT INTO "share_copy_phrases" ("id", "styleId", "content", "sortOrder") VALUES
  ('share-phrase-question-correct-typical-1', 'share-style-question-correct-typical', '这道题我做对了，考点挺典型。', 10),
  ('share-phrase-question-correct-frequency-1', 'share-style-question-correct-frequency', '刷到一道高频感很强的题，分享给大家一起记。', 10),
  ('share-phrase-question-correct-review-1', 'share-style-question-correct-review', '这个知识点容易混，顺手做个复习标记。', 10),
  ('share-phrase-question-wrong-help-1', 'share-style-question-wrong-help', '这道题我想听听大家怎么理解。', 10),
  ('share-phrase-question-wrong-review-1', 'share-style-question-wrong-review', '这题踩坑了，先发出来做个错题复盘。', 10),
  ('share-phrase-question-wrong-idea-1', 'share-style-question-wrong-idea', '我的思路可能偏了，有没有同学讲讲这题怎么想？', 10),
  ('share-phrase-quiz-passed-continue-1', 'share-style-quiz-passed-continue', '刚闯关成功，下一关继续保持节奏。', 10),
  ('share-phrase-quiz-passed-clear-1', 'share-style-quiz-passed-clear', '这关顺利拿下，今天的学习进度继续推进。', 10),
  ('share-phrase-quiz-passed-checkin-1', 'share-style-quiz-passed-checkin', '完成一关，给今天的学习打个卡。', 10),
  ('share-phrase-quiz-failed-review-1', 'share-style-quiz-failed-review', '刚完成一次闯关复盘，把错题吃透再冲。', 10),
  ('share-phrase-quiz-failed-weakness-1', 'share-style-quiz-failed-weakness', '这关还差一点，先把薄弱点标出来。', 10),
  ('share-phrase-quiz-failed-steady-1', 'share-style-quiz-failed-steady', '没关系，复盘完再来一次，节奏不能乱。', 10),
  ('share-phrase-active-rhythm-1', 'share-style-active-rhythm', '晒一下最近的学习节奏，继续冲。', 10),
  ('share-phrase-active-checkin-1', 'share-style-active-checkin', '把学习活跃度发出来，给自己一个继续坚持的理由。', 10),
  ('share-phrase-active-buddy-1', 'share-style-active-buddy', '今天也在认真刷题，欢迎搭子们监督我。', 10);
