import assert from "node:assert/strict";
import {
  buildEvidenceUnits,
  curriculumDirectorySchema,
  parseCurriculumDirectory,
  parseCurriculumTaxonomy,
  type LearningTopic
} from "../src/lib/ai-study-evidence";

const shared = { id: "block-1", content: "定义和适用条件。", pageNumber: 2, blockType: "text" };
const units = buildEvidenceUnits(["chunk-a", "chunk-b"].map((id) => ({
  id, content: shared.content, pageStart: 2, pageEnd: 2, evidenceBlocks: [shared]
})));
assert.equal(units.length, 1);
assert.deepEqual(units[0].sourceChunkIds, ["chunk-a", "chunk-b"]);

const topic: LearningTopic = { id: "topic-1", title: "适用条件", objectives: [] };
const taxonomy = parseCurriculumTaxonomy(JSON.stringify({ groups: [{ moduleTitle: "模块", groupTitle: "概念组" }] }));
const schema = curriculumDirectorySchema([topic], taxonomy);
assert.deepEqual((schema.properties.assignments as { required: string[] }).required, [topic.id]);
assert.deepEqual(
  parseCurriculumDirectory(JSON.stringify({ assignments: { [topic.id]: "模块 → 概念组" } }), [topic], taxonomy),
  { [topic.id]: taxonomy[0] }
);
assert.throws(
  () => parseCurriculumDirectory(JSON.stringify({ assignments: { [topic.id]: "未知 → 概念组" } }), [topic], taxonomy),
  /不属于/
);
console.log("ai-study evidence helpers passed");
