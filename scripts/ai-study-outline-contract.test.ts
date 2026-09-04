import assert from "node:assert/strict";
import {
  buildOutlineCandidateJsonSchema,
  buildNestedOutlineJsonSchema,
  flattenNestedOutline,
  nestedOutlineSchema,
  outlineCandidateListSchema
} from "../src/lib/ai-study-outline-contract";
import { assertCompleteFourLevelOutline } from "../src/lib/ai-study-outline-validation";

const point = (title: string) => ({
  title,
  summary: `${title}概述`,
  sourceChunkIds: ["chunk-1"]
});

const parsed = nestedOutlineSchema.parse({
  root: {
    title: "测试资料",
    summary: "资料概述",
    sourceChunkIds: ["chunk-1"],
    modules: [1, 2, 3].map((moduleIndex) => ({
      title: `模块${moduleIndex}`,
      summary: `模块${moduleIndex}概述`,
      sourceChunkIds: ["chunk-1"],
      groups: [{
        title: `概念组${moduleIndex}`,
        summary: `概念组${moduleIndex}概述`,
        sourceChunkIds: ["chunk-1"],
        points: [point(`知识点${moduleIndex}-1`), point(`知识点${moduleIndex}-2`)]
      }]
    }))
  }
});

const nodes = flattenNestedOutline(parsed);
assert.deepEqual(nodes.slice(0, 4).map((node) => [node.clientId, node.parentClientId]), [
  ["root", null],
  ["module_1", "root"],
  ["group_1_1", "module_1"],
  ["point_1_1_1", "group_1_1"]
]);
assert.doesNotThrow(() => assertCompleteFourLevelOutline(nodes.map((node) => ({
  clientId: node.clientId,
  parentClientId: node.parentClientId,
  title: node.title,
  depth: node.clientId === "root" ? 0 : node.clientId.startsWith("module_") ? 1 : node.clientId.startsWith("group_") ? 2 : 3
}))));

assert.equal(nestedOutlineSchema.safeParse({ root: { ...parsed.root, modules: [] } }).success, false);
assert.equal(nestedOutlineSchema.safeParse({
  root: {
    ...parsed.root,
    modules: parsed.root.modules.map((module) => ({ ...module, groups: [] }))
  }
}).success, false);

assert.equal(outlineCandidateListSchema.safeParse({
  candidates: [{ title: "候选", summary: "概述", sourceChunkIds: ["chunk-1"] }]
}).success, true);
assert.equal(outlineCandidateListSchema.safeParse({
  candidates: [{ clientId: "n1", title: "候选", summary: "概述", sourceChunkIds: ["chunk-1"] }]
}).success, false);

const candidateSchema = buildOutlineCandidateJsonSchema(12, ["chunk-1", "chunk-2"]) as {
  properties: {
    candidates: {
      maxItems: number;
      items: { properties: { sourceChunkIds: { items: { enum: string[] } } } };
    };
  };
};
assert.equal(candidateSchema.properties.candidates.maxItems, 12);
assert.deepEqual(
  candidateSchema.properties.candidates.items.properties.sourceChunkIds.items.enum,
  ["chunk-1", "chunk-2"]
);
const cappedSourceSchema = buildOutlineCandidateJsonSchema(
  12,
  Array.from({ length: 30 }, (_, index) => `chunk-${index + 1}`)
) as {
  properties: {
    candidates: {
      items: { properties: { sourceChunkIds: { maxItems: number } } };
    };
  };
};
assert.equal(cappedSourceSchema.properties.candidates.items.properties.sourceChunkIds.maxItems, 8);

const nestedOutlineJsonSchema = buildNestedOutlineJsonSchema(["chunk-1"]);
assert.deepEqual((nestedOutlineJsonSchema as { required: string[] }).required, ["root"]);
assert.throws(() => buildOutlineCandidateJsonSchema(12, []), /缺少可用的来源片段 ID/);

console.log("ai-study outline contract tests passed");
