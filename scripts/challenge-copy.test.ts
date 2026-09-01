import assert from "node:assert/strict";
import { matchChallengeQuestions, type ChallengeCopyQuestionContent } from "../src/lib/challenge-copy";

function question(id: string, options: unknown = [{ key: "A", text: "1" }]): ChallengeCopyQuestionContent {
  return {
    id,
    type: "single_choice",
    stem: "1 + 1 = ?",
    options,
    answer: ["A"],
    analysis: "基础计算",
    source: "2024真题",
    sourceType: "manual",
    sourceYear: 2024,
    difficulty: "easy"
  };
}

const exact = matchChallengeQuestions(
  [question("source")],
  [question("target", [{ text: "1", key: "A" }])]
);
assert.deepEqual(exact, {
  matches: [{ sourceQuestionId: "source", targetQuestionId: "target" }],
  sourceQuestionCount: 1,
  mappedQuestionCount: 1,
  unmappedQuestionCount: 0
});

const ambiguous = matchChallengeQuestions(
  [question("source")],
  [question("target-1"), question("target-2")]
);
assert.equal(ambiguous.mappedQuestionCount, 0);
assert.equal(ambiguous.unmappedQuestionCount, 1);

const different = matchChallengeQuestions(
  [question("source")],
  [{ ...question("target"), analysis: "不同解析" }]
);
assert.equal(different.mappedQuestionCount, 0);

console.log("cross-region challenge question matching tests passed");
