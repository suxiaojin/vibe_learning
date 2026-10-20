import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flattenNestedCandidateOutline, OutlineCandidateCoverageError, validateNestedCandidateOutline, type OutlineCandidateWithId } from "../src/lib/ai-study-outline-contract";
import { buildCandidateClusterJsonSchema, buildCandidateHierarchyJsonSchema, buildCandidateOutlineMergeTemplates, generateCandidateOutline, orderCandidateTitlesForPlanning, parseCandidateClusters, parseCandidateHierarchy } from "../src/lib/ai-study-outline-merge";
import { normalizeAiStudyPromptTemplates, validateAiStudyPromptTemplates } from "../src/lib/ai-study-prompt-template";
import { buildDepthScopedCardJsonSchema, normalizeAiStudyCardForDepth } from "../src/lib/ai-study-card-quality";
import { parseOutlineCandidatePlan } from "../src/lib/ai-study-outline-candidates";

async function main() {
  const candidates: OutlineCandidateWithId[] = Array.from({ length: 112 }, (_, i) => ({ candidateId: `candidate_${i + 1}`, title: `候选${i + 1}`, summary: `来源摘句${i + 1}`, sourceChunkIds: [`chunk_${i + 1}`] }));
  const ids = candidates.map((c) => c.candidateId);
  const ordered = orderCandidateTitlesForPlanning(candidates);
  assert.deepEqual(ordered.map((c) => c.candidateId).sort(), [...ids].sort());
  const duplicates = Array.from({ length: 8 }, (_, i) => ({ ...candidates[i], title: "引力定律" }));
  const diverse = orderCandidateTitlesForPlanning([...duplicates, { ...candidates[8], title: "神经可塑性" }]);
  assert.equal(diverse[1].title, "神经可塑性");
  const hierarchy = {
    root: { title: "科学知识", summary: "科学主题" },
    assignments: Object.fromEntries(ids.slice(0, 36).map((id, i) => [id, { moduleTitle: `模块${Math.floor(i / 6) + 1}`, groupTitle: `概念组${Math.floor(i / 3) + 1}` }]))
  };
  const assignments = { assignments: Object.fromEntries(ids.map((id, i) => [id, ids[i % 36]])) };
  const cluster = (value: unknown) => parseCandidateClusters(JSON.stringify(value), candidates, 60);
  const topics = cluster(assignments);
  const apply = (value: unknown) => parseCandidateHierarchy(JSON.stringify(value), topics, candidates, 60);
  const outline = apply(hierarchy);
  validateNestedCandidateOutline(outline, candidates, 60);
  const flat = flattenNestedCandidateOutline(outline, candidates);
  assert.equal(flat.length, 55);
  assert.equal(new Set(flat.filter((n) => n.clientId.startsWith("point_")).flatMap((n) => n.sourceChunkIds)).size, 112);
  assert.equal(outline.root.modules[0].groups[0].points[0].summary, candidates[0].summary);
  assert.throws(() => parseCandidateHierarchy(JSON.stringify(hierarchy), topics, candidates, 54), /超过/);
  const overloaded = structuredClone(hierarchy);
  overloaded.assignments[ids[0]] = { moduleTitle: "模块1", groupTitle: "概念组2" };
  assert.throws(() => apply(overloaded), /必须为1-3个/);
  const missing = structuredClone(assignments);
  for (const id of ids.slice(59)) delete missing.assignments[id];
  assert.throws(() => cluster(missing), (error) => error instanceof OutlineCandidateCoverageError && error.missingCandidateIds.length === 53);
  const noMatch = structuredClone(assignments);
  noMatch.assignments[ids[0]] = "__UNMATCHED__";
  assert.throws(() => cluster(noMatch), /不存在的代表/);
  const unknown = structuredClone(assignments);
  unknown.assignments.unknown = "知识点1";
  assert.throws(() => cluster(unknown), /不存在的候选/);
  const invalidTarget = structuredClone(assignments);
  invalidTarget.assignments[ids[0]] = ids[1];
  assert.throws(() => cluster(invalidTarget), /代表必须指向自身/);
  const missingLeaf = structuredClone(hierarchy);
  delete missingLeaf.assignments[ids[0]];
  assert.throws(() => apply(missingLeaf), OutlineCandidateCoverageError);
  const unknownPoint = structuredClone(hierarchy);
  unknownPoint.assignments.unknown = { moduleTitle: "模块1", groupTitle: "概念组1" };
  assert.throws(() => apply(unknownPoint), /不存在的知识点/);
  const tooManyGroups = structuredClone(hierarchy);
  tooManyGroups.assignments[ids[0]].groupTitle = "额外组1";
  tooManyGroups.assignments[ids[1]].groupTitle = "额外组2";
  assert.throws(() => apply(tooManyGroups), /必须包含1-3个/);
  const tooManyModules = structuredClone(hierarchy);
  tooManyModules.assignments[ids[0]].moduleTitle = "额外模块";
  assert.throws(() => apply(tooManyModules), /必须为3-6个/);
  const tooMany = { assignments: Object.fromEntries(ids.map((id) => [id, id])) };
  assert.throws(() => cluster(tooMany), /实际112个/);
  const ancestorOnly = structuredClone(outline);
  ancestorOnly.root.modules[0].groups[0].points[0].candidateIds = [ids[0]];
  assert.throws(() => validateNestedCandidateOutline(ancestorOnly, candidates, 60), OutlineCandidateCoverageError);
  const shape = buildCandidateClusterJsonSchema(ids) as unknown as { properties: { assignments: { required: string[]; properties: Record<string, { enum: string[] }> } } };
  assert.deepEqual(shape.properties.assignments.required, ids);
  assert.deepEqual(shape.properties.assignments.properties[ids[0]].enum, ids);
  const hierarchyShape = buildCandidateHierarchyJsonSchema(topics) as unknown as { properties: { assignments: { required: string[]; additionalProperties: boolean } } };
  assert.deepEqual(hierarchyShape.properties.assignments.required, ids.slice(0, 36));
  assert.equal(hierarchyShape.properties.assignments.additionalProperties, false);
  const reorderedTopics = parseCandidateHierarchy(JSON.stringify(hierarchy), [...topics].reverse(), candidates, 60);
  const firstGroup = reorderedTopics.root.modules.find((module) => module.title === "模块1")!.groups.find((group) => group.title === "概念组1")!;
  assert.ok(firstGroup.points.some((point) => point.candidateIds.includes(ids[0])));
  assert.deepEqual(new Set(flattenNestedCandidateOutline(reorderedTopics, candidates).filter((node) => node.clientId.startsWith("point_")).flatMap((node) => node.sourceChunkIds)), new Set(candidates.flatMap((candidate) => candidate.sourceChunkIds)));

  // Retry only the failed directory step. Successful topics remain immutable.
  let calls = 0, retries = 0;
  const rebuilt = await generateCandidateOutline([{ role: "user", content: "候选输入" }], candidates, 60, async (call) => {
    calls++;
    const payload = calls === 1 ? assignments : calls === 2 ? missingLeaf : hierarchy;
    if (calls === 3) {
      assert.equal(call.stage, "merging_outline_hierarchy_retry_1");
      assert.ok(call.messages.some((m) => m.content.includes(ids[0])));
    }
    const content = JSON.stringify(payload); call.validateContent(content); return content;
  }, async () => { retries++; });
  assert.equal(calls, 3); assert.equal(retries, 1);
  assert.deepEqual(rebuilt, outline);
  calls = 0; retries = 0;
  await generateCandidateOutline([], candidates, 60, async (call) => {
    const payload = [missing, assignments, missingLeaf, hierarchy][calls++];
    const content = JSON.stringify(payload); call.validateContent(content); return content;
  }, async () => { retries++; });
  assert.equal(calls, 4); assert.equal(retries, 2);

  const card = { overview: "概述", explanation: "误填的上层详解", keyPoints: ["要点"] };
  for (const depth of [0, 1, 2]) {
    assert.equal(normalizeAiStudyCardForDepth(card, depth).explanation, "");
    const s = buildDepthScopedCardJsonSchema({ properties: { explanation: { type: "string" } } }, depth) as { properties: { explanation: { enum: string[] } } };
    assert.deepEqual(s.properties.explanation.enum, [""]);
  }
  assert.equal(normalizeAiStudyCardForDepth(card, 3).explanation, card.explanation);
  assert.throws(() => normalizeAiStudyCardForDepth({ explanation: " " }, 3), /非空 AI 详解/);
  const partial = { candidates: [{ candidateId: "candidate_1", title: "潮汐", excerptIds: ["excerpt_1_1"] }, { candidateId: "candidate_2", title: "黑洞", excerptIds: ["excerpt_2_1"] }], assignments: { source_1: ["candidate_1"], source_2: ["candidate_2"] } };
  const sources = [{ id: "source_1", content: "潮汐周期是24小时53分钟。" }, { id: "source_2", content: "黑洞具有事件视界。" }];
  assert.equal(parseOutlineCandidatePlan(JSON.stringify(partial), 8, sources).candidates[0].summary, sources[0].content);
  const inventedQuote = structuredClone(partial);
  inventedQuote.candidates[0].excerptIds = ["潮汐周期是25小时53分钟。"];
  assert.throws(() => parseOutlineCandidatePlan(JSON.stringify(inventedQuote), 8, sources), /摘句/);
  const missingSource = structuredClone(partial);
  delete (missingSource.assignments as Record<string, string[]>).source_2;
  assert.throws(() => parseOutlineCandidatePlan(JSON.stringify(missingSource), 8, sources), /一一对应/);
  const evidenceBinding = structuredClone(partial);
  evidenceBinding.assignments.source_2 = ["candidate_1"];
  assert.deepEqual(parseOutlineCandidatePlan(JSON.stringify(evidenceBinding), 8, sources).candidates[1].sourceChunkIds, ["source_2"]);
  const templates = buildCandidateOutlineMergeTemplates();
  const seed = readFileSync("config/ai-study-prompts.md", "utf8").replace(/\r\n/g, "\n");
  const sections = Object.fromEntries(Array.from(seed.matchAll(/<!--\s*ai-study-prompt:([a-zA-Z0-9_.-]+)\s*-->\n?([\s\S]*?)\n?<!--\s*\/ai-study-prompt\s*-->/g), (m) => [m[1], m[2].trim()]));
  assert.equal(sections["outline.merge.system"], templates["outline.merge.system"]);
  assert.equal(sections["outline.merge.user"], templates["outline.merge.user"]);
  assert.equal(validateAiStudyPromptTemplates(normalizeAiStudyPromptTemplates(sections)), null);
  console.log("passed: 112 candidates, 53 omissions rejected, topic clustering, complete hierarchy, source excerpts, card depth rules");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
