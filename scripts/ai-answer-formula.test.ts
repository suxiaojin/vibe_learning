import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminAiFormulaInstruction,
  liveAiFormulaInstruction,
  sanitizeAdminAiDoubtHtml
} from "../src/lib/ai-formula-format";
import { renderMathPlainText } from "../src/lib/math-rich-text";

const root = process.cwd();

const renderedFormula = renderMathPlainText(
  "判据：$c_a \\cdot K_a \\ge 10^{-8}$；化学式：$\\mathrm{H_2O}$。",
  { invalidFormulaFallback: "source" }
);
assert.match(renderedFormula, /class="katex"/);
assert.match(renderedFormula, /katex-mathml/);
assert.doesNotMatch(renderedFormula, /\$c_a/);

const streamingPartial = renderMathPlainText("正在输出 $c_a", { invalidFormulaFallback: "source" });
assert.equal(streamingPartial, "正在输出 $c_a");

const malformedFormula = renderMathPlainText("保留 $\\unknowncommand{a}$ 原文", { invalidFormulaFallback: "source" });
assert.match(malformedFormula, /\$\\unknowncommand\{a\}\$/);
assert.doesNotMatch(malformedFormula, /公式识别异常/);

const sanitizedAdminAnswer = sanitizeAdminAiDoubtHtml(
  "```html\n<p>H<sub>2</sub>O，10<sup>−8</sup><BR /></p><img src=x onerror=alert(1)><sub onclick=alert(1)>x</sub>\n```"
);
assert.match(sanitizedAdminAnswer, /<p>H<sub>2<\/sub>O，10<sup>−8<\/sup><br><\/p>/);
assert.match(sanitizedAdminAnswer, /&lt;img/);
assert.match(sanitizedAdminAnswer, /&lt;sub onclick=/);
assert.doesNotMatch(sanitizedAdminAnswer, /<img|<sub onclick=/);

assert.match(liveAiFormulaInstruction, /LaTeX/);
assert.match(liveAiFormulaInstruction, /单个美元符号/);
assert.match(adminAiFormulaInstruction, /sub、sup/);

const sourceChecks = [
  ["src/app/api/ai/explain/route.ts", "liveAiFormulaInstruction"],
  ["src/app/api/ai/question-doubt/route.ts", "liveAiFormulaInstruction"],
  ["src/app/api/admin/question-banks/[paperId]/questions/[questionId]/ai-doubt/route.ts", "sanitizeAdminAiDoubtHtml"],
  ["src/components/wrong-question-ai.tsx", "MathMarkdownText"],
  ["src/app/mock-tests/special/[sectionId]/special-practice-runner.tsx", "MathMarkdownText"]
] as const;

for (const [relativePath, expected] of sourceChecks) {
  const source = readFileSync(join(root, relativePath), "utf8");
  assert.match(source, new RegExp(expected));
}

console.log("AI answer formula checks passed");
