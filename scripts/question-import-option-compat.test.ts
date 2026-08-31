import assert from "node:assert/strict";
import { assertImportQuestionPaperPayload } from "../src/lib/question-paper-import";

const payload: unknown = {
  title: "math import contract",
  year: 2025,
  paperType: "real_exam",
  regionName: "江苏三年制",
  publicSubjectName: "高等数学",
  courseName: "高等数学",
  chapterTitle: "整卷导入",
  knowledgePointTitle: "待打标",
  questions: [
    {
      number: 1,
      type: "single_choice",
      stem: "$x^2$",
      options: [
        { key: "a", content: "$e^{a-b}$" },
        { key: "B", text: "$e^{b-a}$" }
      ],
      answer: ["A"],
      analysis: "$e^{a-b}$"
    }
  ]
};

assertImportQuestionPaperPayload(payload);
assert.deepEqual(payload.questions[0].options, [
  { key: "A", text: "$e^{a-b}$" },
  { key: "B", text: "$e^{b-a}$" }
]);

console.log("question import option compatibility: 2/2 passed");
