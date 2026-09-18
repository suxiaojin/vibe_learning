import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hasMeaningfulRichText } from "../src/lib/rich-text-plain";

const root = process.cwd();

for (const value of ["", "   ", "<br>", "<br/>", "<p><br></p>", "<div>&nbsp;</div>", "<p>&#160;</p>", "<p>&#xA0;</p>"]) {
  assert.equal(hasMeaningfulRichText(value), false, `expected visually empty content: ${value}`);
}

for (const value of ["解析", "<p>解析</p>", '<img src="data:image/png;base64,AA==">', "<table><tr><td></td></tr></table>"]) {
  assert.equal(hasMeaningfulRichText(value), true, `expected meaningful content: ${value}`);
}

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const importSource = read("src/lib/question-paper-import.ts");
const workbenchSource = read("src/components/question-bank-detail-workbench.tsx");
const adminRouteSource = read("src/app/api/admin/question-banks/[paperId]/questions/[questionId]/ai-doubt/route.ts");
const explanationRouteSource = read("src/app/api/ai/explain/route.ts");
const specialDoubtRouteSource = read("src/app/api/ai/question-doubt/route.ts");

assert.ok(importSource.includes("hasMeaningfulRichText(question.analysis) ? question.analysis.trim() : null"));
assert.ok(workbenchSource.includes("if (hasMeaningfulRichText(answer))"));
assert.ok(adminRouteSource.includes("hasMeaningfulRichText(submittedAnswer) ? submittedAnswer : \"\""));
assert.ok(explanationRouteSource.includes("hasMeaningfulRichText(submittedCachedAnswer) ? submittedCachedAnswer : \"\""));
assert.ok(explanationRouteSource.includes("if (hasMeaningfulRichText(savedAnswer))"));
assert.ok(specialDoubtRouteSource.includes("if (hasMeaningfulRichText(priorAnswer))"));

console.log("AI doubt visual-empty checks passed");
