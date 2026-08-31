import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAdvancedMathPublicSubject,
  isQuestionBankAutoGradedForOwner
} from "../src/lib/question-bank-types";

const gradingCases: Array<[string, string, string, boolean]> = [
  ["single_choice", "public_subject", "高等数学", true],
  ["multiple_choice", "public_subject", "高等数学", true],
  ["fill_blank", "public_subject", "高等数学", false],
  ["true_false", "public_subject", "高等数学", false],
  ["calculation", "public_subject", "高等数学", false],
  ["proof", "public_subject", "高等数学", false],
  ["comprehensive", "public_subject", "高等数学", false],
  ["fill_blank", "public_subject", "大学语文", true],
  ["fill_blank", "major", "高等数学", true],
  ["short_answer", "major", "管理类", false]
];

for (const [type, ownerType, ownerName, expected] of gradingCases) {
  assert.equal(
    isQuestionBankAutoGradedForOwner(type, ownerType, ownerName),
    expected,
    `${ownerType}/${ownerName}/${type}`
  );
}

assert.equal(isAdvancedMathPublicSubject("public_subject", "高等数学"), true);
assert.equal(isAdvancedMathPublicSubject("major", "高等数学"), false);

const readSource = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");
const editorSource = readSource("src/components/question-bank-detail-workbench.tsx");
const progressSource = readSource("src/app/api/progress/submit/route.ts");
const checkSource = readSource("src/app/api/learning/sections/[sectionId]/questions/check/route.ts");
const learnPageSource = readSource("src/app/learn/[id]/page.tsx");
const resultSource = readSource("src/app/learn/[id]/result/page.tsx");
const quizRunnerSource = readSource("src/components/quiz-runner.tsx");
const specialPageSource = readSource("src/app/mock-tests/special/[sectionId]/page.tsx");
const specialRunnerSource = readSource("src/app/mock-tests/special/[sectionId]/special-practice-runner.tsx");

assert.match(editorSource, /onPaste=\{pasteImage\}/);
assert.match(editorSource, /renderMath \? \([\s\S]*?<RichTextEditor[\s\S]*?name="answer"/);
assert.match(progressSource, /isQuestionBankAutoGradedForOwner\(question\.type, result\.group\.key, result\.group\.name\)/);
assert.match(checkSource, /isQuestionBankAutoGradedForOwner\(question\.type, result\.group\.key, result\.group\.name\)/);
assert.match(learnPageSource, /isQuestionBankAutoGradedForOwner\(question\.type, access\.group\.key, access\.group\.name\)/);
assert.match(learnPageSource, /ownerName=\{access\.group\.name\}[\s\S]*ownerType=\{access\.group\.key\}/);
assert.match(quizRunnerSource, /const isSubjectiveQuestion = Boolean\(current && !isQuestionBankAutoGradedForOwner\(current\.type, ownerType, ownerName\)\)/);
assert.match(quizRunnerSource, /\{isSubjectiveQuestion \? text\.submitAnswer : text\.check\}/);
assert.match(resultSource, /!ungraded && !hideAiExplanation/);
assert.match(specialPageSource, /ownerName=\{context\.group\.name\}/);
assert.match(specialRunnerSource, /!hideAiDoubt \? \(/);
assert.match(specialRunnerSource, /!isQuestionBankAutoGradedForOwner\(question\.type, courseKey, ownerName\)/);

console.log(`advanced math subjective rules: ${gradingCases.length + 14} checks passed`);
