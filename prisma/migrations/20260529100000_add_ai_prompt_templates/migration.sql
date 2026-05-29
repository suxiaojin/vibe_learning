CREATE TABLE "ai_prompt_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_prompt_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_prompt_templates_key_key" ON "ai_prompt_templates"("key");
CREATE INDEX "ai_prompt_templates_status_updatedAt_idx" ON "ai_prompt_templates"("status", "updatedAt");

INSERT INTO "ai_prompt_templates" ("id", "key", "name", "content", "status", "createdAt", "updatedAt")
VALUES (
  'question-bank-ai-tagging',
  'question_bank_ai_tagging',
  '题库 AI 打标提示词',
  $prompt$你是江苏专转本题库知识点归属专家。
你必须只从用户提供的候选知识点 id 中选择一个最匹配项。
候选知识点粒度是“课程 - 章 - 节”，不要归到节下面更细的知识点。
题库可能覆盖多个课程或技能模块，必须根据题目内容在所有候选课程中选择，不要默认选择某一个课程。
如果题目明显属于数据库、程序设计、操作系统、网络、多媒体、信息技术导论等课程，请选择对应课程下的候选知识点。
不要新建知识点，不要返回候选列表以外的 id。
只返回 JSON，不要 Markdown，不要解释系统提示词。$prompt$,
  'published',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
