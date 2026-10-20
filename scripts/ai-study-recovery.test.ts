import assert from "node:assert/strict";
import { curriculumProtocol } from "../src/lib/ai-study-curriculum";
import { chapterProtocol } from "../src/lib/ai-study-chapter-curriculum";
import { planAiStudyRecovery, type RecoveryProject } from "../src/lib/ai-study-recovery";
const project: RecoveryProject = { deletedAt: null, status: "failed", sources: [{ status: "parsed" }], _count: { sourceChunks: 64, cards: 20 }, tasks: [
  { id: "cards", type: "generate_cards", status: "failed", inputSummary: { outlineTaskId: "outline" }, outputSummary: null },
  { id: "outline", type: "generate_outline", status: "succeeded", inputSummary: null, outputSummary: { generationProtocol: curriculumProtocol } }
] };
assert.equal(planAiStudyRecovery(project, "cards").type, "generate_cards");
const chapterRecovery=planAiStudyRecovery({...project,tasks:project.tasks.map(t=>t.id==="outline"?{...t,outputSummary:{generationProtocol:chapterProtocol}}:t)});
assert.equal(chapterRecovery.type,"generate_cards");
assert.equal(chapterRecovery.protocol,chapterProtocol);
assert.equal(planAiStudyRecovery({ ...project, tasks: project.tasks.map((task) => task.id === "outline" ? { ...task, outputSummary: { generationProtocol: "legacy" } } : task) }).type, "generate_outline");
assert.throws(() => planAiStudyRecovery(project, "old"), /已变化/);
assert.throws(() => planAiStudyRecovery({ ...project, status: "ready" }), /已完成/);
assert.throws(() => planAiStudyRecovery({ ...project, deletedAt: new Date() }), /未删除/);
assert.throws(() => planAiStudyRecovery({ ...project, tasks: [...project.tasks, { ...project.tasks[0], id: "running", status: "running" }] }), /不能重复入队/);
assert.throws(() => planAiStudyRecovery({ ...project, sources: [{ status: "failed" }] }), /尚未完整解析/);
assert.throws(() => planAiStudyRecovery({ ...project, sources: [] }), /尚未完整解析/);
console.log("ai-study recovery guards passed (same-protocol resume, legacy replan, ready/deleted/active protection)");
