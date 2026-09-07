import assert from "node:assert/strict";
import { buildAiStudyOpeningSuggestions } from "../src/lib/ai-study-chat-suggestions";

const sharedContext = {
  cardKeyPoints: ["开源许可证与模型权重的发布方式", "社区协作机制"],
  cardOverview: "部分开源模型通常会公开权重，但使用范围仍受许可证约束。",
  summary: "介绍部分开源模型的基本定义和主要特点。",
  title: "部分开源模型"
};

assert.deepEqual(buildAiStudyOpeningSuggestions({ ...sharedContext, depth: 0 }), [
  "怎么梳理“部分开源模型”的整体框架？",
  "“开源许可证与模型权重的发布方式”为什么值得优先学？"
]);

assert.deepEqual(buildAiStudyOpeningSuggestions({ ...sharedContext, depth: 1 }), [
  "“部分开源模型”在整体框架中起什么作用？",
  "“开源许可证与模型权重的发布方式”和本模块其他内容有何联系？"
]);

assert.deepEqual(buildAiStudyOpeningSuggestions({ ...sharedContext, depth: 2 }), [
  "“部分开源模型”包含哪些关键概念？",
  "理解“开源许可证与模型权重的发布方式”时最容易混淆什么？"
]);

assert.deepEqual(buildAiStudyOpeningSuggestions({ ...sharedContext, depth: 3 }), [
  "“部分开源模型”的核心原理是什么？",
  "用“开源许可证与模型权重的发布方式”举个具体例子？"
]);

assert.deepEqual(buildAiStudyOpeningSuggestions({
  cardKeyPoints: ["<strong>同名节点</strong>。后续内容"],
  cardOverview: "**卡片概述重点**。更多说明",
  depth: 3,
  summary: "节点摘要",
  title: "同名节点"
}), [
  "“同名节点”的核心原理是什么？",
  "用“卡片概述重点”举个具体例子？"
]);

const fallbackSuggestions = buildAiStudyOpeningSuggestions({
  cardKeyPoints: [],
  cardOverview: "",
  depth: 3,
  summary: "",
  title: "数据库索引"
});
assert.equal(fallbackSuggestions.length, 2);
assert.equal(new Set(fallbackSuggestions).size, 2);
assert.ok(fallbackSuggestions.every((suggestion) => suggestion.endsWith("？")));

const summarySuggestions = buildAiStudyOpeningSuggestions({
  cardKeyPoints: [],
  cardOverview: "",
  depth: 2,
  summary: "事务的原子性与回滚机制。其余说明",
  title: "数据库事务"
});
assert.match(summarySuggestions[1], /事务的原子性与回滚机制/);

console.log("ai-study chat suggestion tests passed");
