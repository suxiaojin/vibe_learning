const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expect(source, snippet, label) {
  if (!source.includes(snippet)) {
    throw new Error(`Missing ${label}: ${snippet}`);
  }
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260917150000_add_question_ai_explanation_visibility/migration.sql");
const adminPage = read("src/app/admin/question-banks/[paperId]/page.tsx");
const adminRoute = read("src/app/api/admin/question-banks/[paperId]/questions/[questionId]/ai-doubt/route.ts");
const workbench = read("src/components/question-bank-detail-workbench.tsx");
const resultPage = read("src/app/learn/[id]/result/page.tsx");

expect(schema, "showAiExplanation  Boolean                    @default(true)", "Prisma default-on field");
expect(migration, 'ADD COLUMN "showAiExplanation" BOOLEAN NOT NULL DEFAULT true;', "database default-on migration");
expect(adminPage, "showAiExplanation: item.question.showAiExplanation", "admin question payload");
expect(adminRoute, "data: { aiDoubtAnswer: answer || null, showAiExplanation }", "admin save behavior");
expect(workbench, "<span>前端显示</span>", "admin visibility control");
expect(workbench, "JSON.stringify({ answer, showAiExplanation })", "admin visibility submission");
expect(resultPage, "showAiExplanation: true", "result query field");
expect(resultPage, "attempt.question.showAiExplanation ? (", "per-question result visibility");

if (resultPage.includes("!ungraded && !hideAiExplanation")) {
  throw new Error("Legacy question-type visibility gate still exists");
}

console.log("question AI explanation visibility checks passed");
