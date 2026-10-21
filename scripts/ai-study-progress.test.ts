import assert from "node:assert/strict";
import type { AiStudyGenerationTask } from "@prisma/client";
import { buildAiStudyGenerationProgress } from "../src/lib/ai-study-progress-cache";

const task = (type: AiStudyGenerationTask["type"], status: AiStudyGenerationTask["status"], stage: string): AiStudyGenerationTask => ({
  id: `${type}-${stage}`, projectId: "project", sourceId: null, type, status, stage,
  errorMessage: null, createdAt: new Date(), updatedAt: new Date()
} as AiStudyGenerationTask);

const organizing = buildAiStudyGenerationProgress({
  id: "project", status: "processing", tasks: [task("generate_outline", "running", "organizing_four_level_taxonomy")]
});
assert.equal(organizing.percent, 95);
assert.equal(organizing.text, "正在组织完整知识目录...");

const withCardTask = buildAiStudyGenerationProgress({
  id: "project", status: "processing", tasks: [
    task("generate_outline", "succeeded", "outline_generated"),
    task("generate_cards", "running", "generating_card_1_of_100")
  ]
});
assert.equal(withCardTask.percent, 99, "card generation must not contribute to parsing percentage");
assert(!withCardTask.steps.some((step) => step.type === "generate_cards"), "card generation is not a parsing step");

const available = buildAiStudyGenerationProgress({
  id: "project", status: "processing", learningReadyAt: new Date(),
  cardJobs: [{status:"unrequested"}, {status:"pending"}], tasks: [task("generate_cards", "running", "scheduling_cards")]
});
assert.equal(available.percent, 100);
assert.equal(available.learningAvailable, true);
assert.equal(available.cards?.unrequested, 1);

console.log("AI study directory progress tests passed");
