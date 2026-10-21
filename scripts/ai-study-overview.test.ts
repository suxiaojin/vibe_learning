import assert from "node:assert/strict";
import { buildOverviewGroups, overviewMessages, parseOverview, selectOverviewSources, type OverviewNode } from "../src/lib/ai-study-overview";
import { defaultAiStudyOverviewPromptTemplates, validateAiStudyOverviewPromptTemplates } from "../src/lib/ai-study-overview-prompt-template";

const moduleNode: OverviewNode = { id: "module", parentId: "root", title: "会计对象、要素与等式", depth: 1, sourceChunkIds: [] };
const descendants: OverviewNode[] = [
  { id: "g1", parentId: "module", title: "会计对象与资金运动", depth: 2, sourceChunkIds: [] },
  { id: "g2", parentId: "module", title: "反映财务状况的要素", depth: 2, sourceChunkIds: [] },
  { id: "t1", parentId: "g1", title: "会计对象与资金运动", depth: 3, sourceChunkIds: ["s1"] },
  { id: "t2", parentId: "g2", title: "资产、负债与所有者权益", depth: 3, sourceChunkIds: ["s2"] }
];
const selected = selectOverviewSources(moduleNode, descendants);
assert.deepEqual(selected.sourceIds, ["s1", "s2"]);
const groups = buildOverviewGroups(selected, [
  { id: "s1", pageStart: 4, content: "会计对象是企业的资金运动，包括资金投入、运用和退出。" },
  { id: "s2", pageStart: 8, content: "资产、负债与所有者权益是反映企业财务状况的会计要素。" }
]);
assert.equal(groups.length, 2);
assert.equal(groups[1].topics[0], "资产、负债与所有者权益");
assert.equal(validateAiStudyOverviewPromptTemplates(defaultAiStudyOverviewPromptTemplates), null);
assert.match(validateAiStudyOverviewPromptTemplates({ ...defaultAiStudyOverviewPromptTemplates, "overview.user": "没有上下文" }) || "", /context/);
assert.match(overviewMessages("基础会计", moduleNode.title, groups, defaultAiStudyOverviewPromptTemplates)[1].content, /资金投入/);
const customized = overviewMessages("基础会计", moduleNode.title, groups, {
  "overview.system": "请根据原文概括关系，只输出JSON {overview}。",
  "overview.user": "请阅读：{{context}}"
});
assert.equal(customized[0].content, "请根据原文概括关系，只输出JSON {overview}。");
assert.match(customized[1].content, /^请阅读：\{/);
const good = "本节从企业资金投入、运用和退出所形成的资金运动认识会计对象，再用资产、负债与所有者权益理解企业财务状况。这些要素将抽象的经济活动转化为可描述的会计内容。";
assert.equal(parseOverview(JSON.stringify({ overview: good }), groups), good);
assert.throws(() => parseOverview(JSON.stringify({ overview: "本部分包含：会计对象与资金运动、反映财务状况的要素。请选择下层知识点学习。" }), groups));
assert.throws(() => parseOverview(JSON.stringify({ overview: `${good} 2028年必须使用新等式。` }), groups));
console.log("ai-study-overview tests passed");
