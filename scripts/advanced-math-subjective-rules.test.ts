import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAdvancedMathPublicSubject,
  isQuestionBankAutoGradedForOwner
} from "../src/lib/question-bank-types";

const gradingCases: Array<[string, string, string, boolean, boolean]> = [
  ["single_choice", "public_subject", "高等数学", false, true],
  ["multiple_choice", "public_subject", "高等数学", false, true],
  ["fill_blank", "public_subject", "高等数学", false, false],
  ["fill_blank", "public_subject", "高等数学", true, false],
  ["true_false", "public_subject", "高等数学", false, false],
  ["calculation", "public_subject", "高等数学", false, false],
  ["proof", "public_subject", "高等数学", false, false],
  ["comprehensive", "public_subject", "高等数学", false, false],
  ["fill_blank", "public_subject", "大学语文", false, false],
  ["fill_blank", "public_subject", "大学语文", true, true],
  ["fill_blank", "major", "高等数学", false, false],
  ["fill_blank", "major", "高等数学", true, true],
  ["short_answer", "major", "管理类", true, false]
];

for (const [type, ownerType, ownerName, fillBlankScored, expected] of gradingCases) {
  assert.equal(
    isQuestionBankAutoGradedForOwner(type, ownerType, ownerName, fillBlankScored),
    expected,
    `${ownerType}/${ownerName}/${type}/${fillBlankScored}`
  );
}

assert.equal(isAdvancedMathPublicSubject("public_subject", "高等数学"), true);
assert.equal(isAdvancedMathPublicSubject("major", "高等数学"), false);

const readSource = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");
const editorSource = readSource("src/components/question-bank-detail-workbench.tsx");
const fillBlankFormSource = editorSource.slice(
  editorSource.indexOf("function FillBlankQuestionForm"),
  editorSource.indexOf("function RichAnswerQuestionForm")
);
const progressSource = readSource("src/app/api/progress/submit/route.ts");
const checkSource = readSource("src/app/api/learning/sections/[sectionId]/questions/check/route.ts");
const learnPageSource = readSource("src/app/learn/[id]/page.tsx");
const resultSource = readSource("src/app/learn/[id]/result/page.tsx");
const quizRunnerSource = readSource("src/components/quiz-runner.tsx");
const specialPageSource = readSource("src/app/mock-tests/special/[sectionId]/page.tsx");
const specialRunnerSource = readSource("src/app/mock-tests/special/[sectionId]/special-practice-runner.tsx");
const schemaSource = readSource("prisma/schema.prisma");
const adminActionsSource = readSource("src/app/admin/actions.ts");
const questionBankPageSource = readSource("src/app/admin/question-banks/[paperId]/page.tsx");
const migrationSource = readSource("prisma/migrations/20260920210000_add_fill_blank_scoring/migration.sql");

assert.match(editorSource, /onPaste=\{pasteImage\}/);
assert.match(fillBlankFormSource, /<RichTextEditor[\s\S]*?name="answer"/);
assert.match(fillBlankFormSource, /fillBlankScoring=\{allowScoring \? \{ defaultChecked: question\?\.fillBlankScored \|\| false \} : undefined\}/);
assert.match(editorSource, /<span>是否计分<\/span>[\s\S]*?name="fillBlankScored"/);
assert.doesNotMatch(fillBlankFormSource, /<textarea/);
assert.doesNotMatch(editorSource, /renderMath|MathRichText|hasLatexMath|renderLatexInHtml|公式预览/);
assert.doesNotMatch(editorSource, /label="插入公式"/);
assert.match(editorSource, /const \[formHtml, setFormHtml\] = useState\(initialHtml\);/);
assert.match(editorSource, /editor\.innerHTML = initialHtml;[\s\S]*?setFormHtml\(initialHtml\);/);
assert.match(editorSource, /<input type="hidden" name=\{name\} value=\{formHtml\} readOnly \/>/);
assert.doesNotMatch(editorSource, /inputRef/);
assert.doesNotMatch(editorSource, /contentEditable\s+dangerouslySetInnerHTML/);
assert.match(progressSource, /isQuestionBankAutoGradedForOwner\([\s\S]*?question\.type,[\s\S]*?result\.group\.key,[\s\S]*?result\.group\.name,[\s\S]*?question\.fillBlankScored[\s\S]*?\)/);
assert.match(checkSource, /isQuestionBankAutoGradedForOwner\([\s\S]*?question\.type,[\s\S]*?result\.group\.key,[\s\S]*?result\.group\.name,[\s\S]*?question\.fillBlankScored[\s\S]*?\)/);
assert.match(learnPageSource, /isQuestionBankAutoGradedForOwner\([\s\S]*?question\.type,[\s\S]*?access\.group\.key,[\s\S]*?access\.group\.name,[\s\S]*?question\.fillBlankScored[\s\S]*?\)/);
assert.match(learnPageSource, /ownerName=\{access\.group\.name\}[\s\S]*ownerType=\{access\.group\.key\}/);
assert.match(quizRunnerSource, /const isSubjectiveQuestion = Boolean\(current && !isQuestionBankAutoGradedForOwner\([\s\S]*?current\.fillBlankScored[\s\S]*?\)\)/);
assert.match(quizRunnerSource, /\{isSubjectiveQuestion \? text\.submitAnswer : text\.check\}/);
assert.match(resultSource, /attempt\.question\.showAiExplanation \? \(/);
assert.doesNotMatch(resultSource, /hideAiExplanation/);
assert.match(specialPageSource, /ownerName=\{context\.group\.name\}/);
assert.match(specialRunnerSource, /!hideAiDoubt \? \(/);
assert.match(specialRunnerSource, /!isQuestionBankAutoGradedForOwner\([\s\S]*?question\.fillBlankScored[\s\S]*?\)/);
assert.match(schemaSource, /fillBlankScored\s+Boolean\s+@default\(false\)/);
assert.match(adminActionsSource, /fillBlankScored: type === "fill_blank" && formData\.get\("fillBlankScored"\) === "on"/);
assert.match(questionBankPageSource, /allowFillBlankScoring=\{!isAdvancedMathPublicSubject\(/);
assert.match(migrationSource, /ADD COLUMN "fillBlankScored" BOOLEAN NOT NULL DEFAULT false/);

console.log(`advanced math and fill-blank scoring rules: ${gradingCases.length + 29} checks passed`);
