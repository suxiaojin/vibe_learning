import assert from "node:assert/strict";
import {
  buildNestedCandidateOutlineJsonSchema,
  buildOutlineCandidateJsonSchema,
  buildNestedOutlineJsonSchema,
  ensureOutlineCandidateSourceCoverage,
  flattenNestedCandidateOutline,
  flattenNestedOutline,
  maximumStructuredOutlineNodes,
  nestedCandidateOutlineSchema,
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
assert.equal(nestedOutlineSchema.safeParse({
  root: {
    ...parsed.root,
    modules: parsed.root.modules.map((module) => ({
      ...module,
      groups: [module.groups[0], module.groups[0], module.groups[0]]
    }))
  }
}).success, false);
assert.equal(nestedOutlineSchema.safeParse({
  root: {
    ...parsed.root,
    modules: parsed.root.modules.map((module) => ({
      ...module,
      groups: [{
        ...module.groups[0],
        points: [point("知识点1"), point("知识点2"), point("知识点3"), point("知识点4")]
      }]
    }))
  }
}).success, false);

const maximumOutline = nestedOutlineSchema.parse({
  root: {
    title: "最大结构",
    summary: "最大结构概述",
    sourceChunkIds: ["chunk-1"],
    modules: Array.from({ length: 6 }, (_, moduleIndex) => ({
      title: `模块${moduleIndex + 1}`,
      summary: `模块${moduleIndex + 1}概述`,
      sourceChunkIds: ["chunk-1"],
      groups: Array.from({ length: 2 }, (_, groupIndex) => ({
        title: `概念组${moduleIndex + 1}-${groupIndex + 1}`,
        summary: "概念组概述",
        sourceChunkIds: ["chunk-1"],
        points: Array.from({ length: 3 }, (_, pointIndex) =>
          point(`知识点${moduleIndex + 1}-${groupIndex + 1}-${pointIndex + 1}`))
      }))
    }))
  }
});
assert.equal(maximumStructuredOutlineNodes, 55);
assert.equal(flattenNestedOutline(maximumOutline).length, maximumStructuredOutlineNodes);

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
assert.equal(cappedSourceSchema.properties.candidates.items.properties.sourceChunkIds.maxItems, 30);

const coveredCandidates = ensureOutlineCandidateSourceCoverage([
  { title: "候选1", summary: "候选1概述", sourceChunkIds: ["chunk-1"] },
  { title: "候选2", summary: "候选2概述", sourceChunkIds: ["chunk-4"] }
], ["chunk-1", "chunk-2", "chunk-3", "chunk-4"]);
assert.deepEqual(
  Array.from(new Set(coveredCandidates.flatMap((candidate) => candidate.sourceChunkIds))).sort(),
  ["chunk-1", "chunk-2", "chunk-3", "chunk-4"]
);
assert.throws(() => ensureOutlineCandidateSourceCoverage([
  { title: "候选", summary: "概述", sourceChunkIds: ["invalid-chunk"] }
], ["chunk-1"]), /不存在的来源片段/);

const candidateOutline = nestedCandidateOutlineSchema.parse({
  root: {
    title: "候选知识树",
    summary: "候选知识树概述",
    modules: [1, 2, 3].map((moduleIndex) => ({
      title: `候选模块${moduleIndex}`,
      summary: `候选模块${moduleIndex}概述`,
      candidateIds: [moduleIndex === 1 ? "candidate-1" : "candidate-2"],
      groups: [{
        title: `候选概念组${moduleIndex}`,
        summary: `候选概念组${moduleIndex}概述`,
        candidateIds: [moduleIndex === 1 ? "candidate-1" : "candidate-2"],
        points: [1, 2].map((pointIndex) => ({
          title: `候选知识点${moduleIndex}-${pointIndex}`,
          summary: `候选知识点${moduleIndex}-${pointIndex}概述`,
          candidateIds: [moduleIndex === 1 ? "candidate-1" : "candidate-2"]
        }))
      }]
    }))
  }
});
const candidateNodes = flattenNestedCandidateOutline(candidateOutline, [
  { candidateId: "candidate-1", title: "候选1", summary: "概述1", sourceChunkIds: ["chunk-1", "chunk-2"] },
  { candidateId: "candidate-2", title: "候选2", summary: "概述2", sourceChunkIds: ["chunk-3"] }
]);
assert.deepEqual(candidateNodes[0].sourceChunkIds, ["chunk-1", "chunk-2", "chunk-3"]);
assert.deepEqual(candidateNodes[1].sourceChunkIds, ["chunk-1", "chunk-2"]);

const longDocumentChunkIds = Array.from({ length: 849 }, (_, index) => `chunk-${index + 1}`);
const largeCandidateSet = ensureOutlineCandidateSourceCoverage(
  Array.from({ length: 160 }, (_, candidateIndex) => ({
    title: `候选${candidateIndex + 1}`,
    summary: `候选${candidateIndex + 1}概述`,
    sourceChunkIds: Array.from({ length: 493 }, (_, chunkIndex) => chunkIndex)
      .filter((chunkIndex) => chunkIndex % 160 === candidateIndex)
      .map((chunkIndex) => longDocumentChunkIds[chunkIndex])
  })),
  longDocumentChunkIds
).map((candidate, index) => ({ ...candidate, candidateId: `candidate-${index + 1}` }));
const pointCandidateGroups = Array.from({ length: 36 }, (_, pointIndex) =>
  largeCandidateSet
    .filter((_, candidateIndex) => candidateIndex % 36 === pointIndex)
    .map((candidate) => candidate.candidateId));
let pointGroupIndex = 0;
const largeCandidateOutline = nestedCandidateOutlineSchema.parse({
  root: {
    title: "大型资料知识树",
    summary: "大型资料知识树概述",
    modules: Array.from({ length: 6 }, (_, moduleIndex) => ({
      title: `大型模块${moduleIndex + 1}`,
      summary: `大型模块${moduleIndex + 1}概述`,
      candidateIds: pointCandidateGroups
        .slice(moduleIndex * 6, moduleIndex * 6 + 6)
        .flat(),
      groups: Array.from({ length: 2 }, (_, groupIndex) => {
        const groupPointCandidates = Array.from({ length: 3 }, () => pointCandidateGroups[pointGroupIndex++]);
        return {
          title: `大型概念组${moduleIndex + 1}-${groupIndex + 1}`,
          summary: "大型概念组概述",
          candidateIds: groupPointCandidates.flat(),
          points: groupPointCandidates.map((candidateIds, pointIndex) => ({
            title: `大型知识点${moduleIndex + 1}-${groupIndex + 1}-${pointIndex + 1}`,
            summary: "大型知识点概述",
            candidateIds
          }))
        };
      })
    }))
  }
});
const largeCandidateNodes = flattenNestedCandidateOutline(largeCandidateOutline, largeCandidateSet);
assert.equal(largeCandidateNodes.length, 55);
assert.equal(largeCandidateNodes[0].sourceChunkIds.length, 849);
assert.equal(new Set(largeCandidateNodes.slice(1).flatMap((node) => node.sourceChunkIds)).size, 849);

const nestedCandidateJsonSchema = buildNestedCandidateOutlineJsonSchema(["candidate-1", "candidate-2"]);
assert.deepEqual((nestedCandidateJsonSchema as { required: string[] }).required, ["root"]);
assert.throws(() => buildNestedCandidateOutlineJsonSchema([]), /缺少可用的候选 ID/);

const nestedOutlineJsonSchema = buildNestedOutlineJsonSchema(["chunk-1"]);
assert.deepEqual((nestedOutlineJsonSchema as { required: string[] }).required, ["root"]);
assert.throws(() => buildOutlineCandidateJsonSchema(12, []), /缺少可用的来源片段 ID/);

console.log("ai-study outline contract tests passed");
