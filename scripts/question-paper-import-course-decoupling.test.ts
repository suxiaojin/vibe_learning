import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const source = readFileSync("src/lib/question-paper-import.ts", "utf8");

assert.doesNotMatch(
  source,
  /learningCourse\.(?:create|upsert|createMany)\s*\(/,
  "question-paper import must not create a LearningCourse",
);
assert.doesNotMatch(
  source,
  /ensureLearningCourse/,
  "question-paper import must not depend on a LearningCourse",
);
assert.match(
  source,
  /where:\s*\{\s*subjectId:\s*subject\.id,\s*courseId:\s*null,\s*title:\s*payload\.chapterTitle\s*\}/,
  "legacy import chapters must be looked up outside visible courses",
);
assert.match(
  source,
  /subjectId:\s*subject\.id,\s*\n\s*courseId:\s*null,/,
  "legacy import chapters must be created outside visible courses",
);
assert.match(
  source,
  /paperId:\s*paper\.id,\s*\n\s*courseId:\s*null,/,
  "import results must not report a synthetic course",
);

console.log("question paper import course decoupling checks passed");
