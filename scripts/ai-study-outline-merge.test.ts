import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  flattenNestedCandidateOutline,
  nestedCandidateOutlineSchema,
  OutlineCandidateCoverageError,
  validateNestedCandidateOutline,
  type OutlineCandidateWithId
} from "../src/lib/ai-study-outline-contract";
import {
  buildCandidateOutlineMergeTemplates,
  buildCandidateOutlineCoverageRepair,
  buildCandidateOutlineRepairMessages,
  buildCandidateOutlineTransportInstruction
} from "../src/lib/ai-study-outline-merge";
import { normalizeAiStudyPromptTemplates, renderAiStudyPromptTemplate, validateAiStudyPromptTemplates } from "../src/lib/ai-study-prompt-template";
import type { ChatMessage } from "../src/lib/qwen";

const candidates: OutlineCandidateWithId[] = Array.from({ length: 112 }, (_, index) => ({
  candidateId: `candidate_${Math.floor(index / 8) + 1}_${index % 8 + 1}`,
  title: `知识候选${index + 1}`,
  summary: `候选${index + 1}概述`,
  sourceChunkIds: [`chunk-${index + 1}`]
}));
const complete = nestedCandidateOutlineSchema.parse({
  root: {
    title: "经济学知识图谱",
    summary: "覆盖全部候选的四层知识图谱",
    modules: Array.from({ length: 6 }, (_, moduleIndex) => ({
      title: `模块${moduleIndex + 1}`,
      summary: "模块概述",
      candidateIds: candidates.filter((_, index) => index % 6 === moduleIndex).map((c) => c.candidateId),
      groups: [{
        title: `概念组${moduleIndex + 1}`,
        summary: "概念组概述",
        candidateIds: [candidates[moduleIndex].candidateId],
        points: [0, 1].map((pointIndex) => ({
          title: `知识点${moduleIndex + 1}-${pointIndex + 1}`,
          summary: "知识点概述",
          candidateIds: [candidates[moduleIndex + pointIndex * 6].candidateId]
        }))
      }]
    }))
  }
});
assert.doesNotThrow(() => validateNestedCandidateOutline(complete, candidates, 60));
const completeNodes = flattenNestedCandidateOutline(complete, candidates);
assert.equal(completeNodes.length, 25);
assert.equal(new Set(completeNodes.slice(1).flatMap((node) => node.sourceChunkIds)).size, 112);
assert.throws(() => validateNestedCandidateOutline(complete, candidates, 24), /超过上限/);

// Reproduce a structurally valid merge that loses the last 53 candidates.
const incomplete = structuredClone(complete);
const omitted = new Set(candidates.slice(59).map((c) => c.candidateId));
for (const module of incomplete.root.modules) {
  module.candidateIds = module.candidateIds.filter((id) => !omitted.has(id));
}
let coverageError: OutlineCandidateCoverageError | undefined;
try {
  validateNestedCandidateOutline(incomplete, candidates, 60);
} catch (error) {
  assert.ok(error instanceof OutlineCandidateCoverageError);
  coverageError = error;
}
assert.ok(coverageError);
assert.equal(coverageError.missingCandidateIds.length, 53);
assert.deepEqual(coverageError.missingCandidateIds, candidates.slice(59).map((c) => c.candidateId));
// Root evidence is always complete; it must never bypass non-root coverage.
assert.equal(flattenNestedCandidateOutline(incomplete, candidates)[0].sourceChunkIds.length, 112);
assert.throws(() => validateNestedCandidateOutline(incomplete, candidates, 60), OutlineCandidateCoverageError);

const unknown = structuredClone(complete);
unknown.root.modules[0].groups[0].points[0].candidateIds = ["unknown-candidate"];
assert.throws(() => validateNestedCandidateOutline(unknown, candidates, 60), /不存在的候选/);
const badStructure = structuredClone(complete);
badStructure.root.modules[0].groups[0].points = [];
assert.equal(nestedCandidateOutlineSchema.safeParse(badStructure).success, false);

const templates = buildCandidateOutlineMergeTemplates();
assert.deepEqual(Object.keys(templates).sort(), ["outline.merge.system", "outline.merge.user"]);
const original: ChatMessage[] = [
  { role: "system", content: renderAiStudyPromptTemplate(templates["outline.merge.system"], { maxNodesPerProject: 60 }) },
  { role: "user", content: renderAiStudyPromptTemplate(templates["outline.merge.user"], { projectTitle: "经济学", candidateNodes: JSON.stringify({ candidates }) }) }
];
const originalSnapshot = JSON.stringify(original);
const fullResponse = JSON.stringify(incomplete);
assert.ok(fullResponse.length > 1200);
const repairedMessages = buildCandidateOutlineRepairMessages(original, { error: coverageError, responseContent: fullResponse }, 60);
assert.equal(JSON.stringify(original), originalSnapshot);
assert.equal(repairedMessages.length, 4);
assert.deepEqual(repairedMessages.slice(0, 2), original);
assert.deepEqual(repairedMessages[2], { role: "assistant", content: fullResponse });
assert.ok(repairedMessages[3].content.includes(JSON.stringify(coverageError.missingCandidateIds)));
assert.ok(repairedMessages[3].content.includes(candidates.at(-1)!.candidateId));
assert.ok(repairedMessages[3].content.includes("保留上一份输出中已经正确的结构和候选引用"));
assert.ok(repairedMessages[3].content.includes("总节点最多 55 个"));
assert.ok(repairedMessages[3].content.includes("完整 JSON"));

const coverageRepair = buildCandidateOutlineCoverageRepair(original, { error: coverageError, responseContent: fullResponse }, 60);
assert.ok(coverageRepair);
const repairShape = coverageRepair.jsonSchema.schema as {
  properties: {
    assignments: { required: string[]; properties: Record<string, { enum: string[] }> };
    nodeUpdates: { required: string[] };
  };
};
assert.deepEqual(repairShape.properties.assignments.required, coverageError.missingCandidateIds);
const leafIds = repairShape.properties.assignments.properties[coverageError.missingCandidateIds[0]].enum;
assert.ok(leafIds.length > 0 && leafIds.every((id) => id.startsWith("point_")));
const repairContext = JSON.parse(coverageRepair.messages.at(-1)!.content) as { nodes: Array<{ nodeId: string; title: string; summary: string }> };
const repairPayload = {
  assignments: Object.fromEntries(coverageError.missingCandidateIds.map((id, index) => [id, leafIds[index % leafIds.length]])),
  nodeUpdates: Object.fromEntries(repairContext.nodes.map((node) => [node.nodeId, { title: node.title, summary: node.summary }]))
};
const repaired = coverageRepair.parseResponse(JSON.stringify(repairPayload));
assert.doesNotThrow(() => validateNestedCandidateOutline(repaired, candidates, 60));
assert.equal(flattenNestedCandidateOutline(repaired, candidates).length, completeNodes.length);
assert.equal(new Set(flattenNestedCandidateOutline(repaired, candidates).slice(1).flatMap((node) => node.sourceChunkIds)).size, 112);
assert.deepEqual(incomplete, JSON.parse(fullResponse));
for (const [index, node] of flattenNestedCandidateOutline(incomplete, candidates).entries()) {
  const fixed = flattenNestedCandidateOutline(repaired, candidates)[index];
  assert.ok(node.sourceChunkIds.every((id) => fixed.sourceChunkIds.includes(id)));
}
const missingAssignment = structuredClone(repairPayload);
delete missingAssignment.assignments[coverageError.missingCandidateIds.at(-1)!];
assert.throws(() => coverageRepair.parseResponse(JSON.stringify(missingAssignment)), /全部遗漏候选/);
const unknownAssignment = structuredClone(repairPayload);
unknownAssignment.assignments[coverageError.missingCandidateIds[0]] = "module_1";
assert.throws(() => coverageRepair.parseResponse(JSON.stringify(unknownAssignment)), /第4层知识点/);
const overloaded = structuredClone(repairPayload);
for (const id of Object.keys(overloaded.assignments)) overloaded.assignments[id] = leafIds[0];
assert.throws(() => coverageRepair.parseResponse(JSON.stringify(overloaded)), /引用上限/);
assert.equal(JSON.stringify(incomplete), fullResponse);
assert.equal(buildCandidateOutlineCoverageRepair(original, { error: new Error("fetch failed"), responseContent: null }, 60), null);

const disconnectedMessages = buildCandidateOutlineRepairMessages(original, { error: new Error("fetch failed"), responseContent: null }, 60);
assert.equal(disconnectedMessages.length, 3);
assert.equal(disconnectedMessages.some((m) => m.role === "assistant"), false);
assert.ok(disconnectedMessages.at(-1)!.content.includes("fetch failed"));
const malformedMessages = buildCandidateOutlineRepairMessages(original, { error: new Error("invalid JSON"), responseContent: '{"root":' }, 60);
assert.equal(malformedMessages[2].content, '{"root":');
assert.ok(malformedMessages[3].content.includes("invalid JSON"));
assert.ok(buildCandidateOutlineTransportInstruction(40).includes("总节点最多 40 个"));
assert.ok(original[0].content.includes("2-3 个 points"));
assert.equal(original[0].content.includes('"sourceChunkIds":'), false);
assert.equal(original[0].content.includes("2-4个"), false);
const seed = readFileSync("config/ai-study-prompts.md", "utf8");
const sections = Object.fromEntries(Array.from(seed.matchAll(/<!--\s*ai-study-prompt:([a-zA-Z0-9_.-]+)\s*-->\r?\n?([\s\S]*?)\r?\n?<!--\s*\/ai-study-prompt\s*-->/g), (m) => [m[1], m[2].trim()]));
assert.equal(sections["outline.merge.system"], templates["outline.merge.system"]);
assert.equal(sections["outline.merge.user"], templates["outline.merge.user"]);
assert.equal(validateAiStudyPromptTemplates(normalizeAiStudyPromptTemplates(sections)), null);

console.log("ai-study outline merge tests passed: 112 candidates, 53 required repair assignments, non-root coverage, preserved references and strict limits");
