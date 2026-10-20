import { z } from "zod";
import { nestedCandidateOutlineSchema, OutlineCandidateCoverageError, validateNestedCandidateOutline, type NestedCandidateOutline, type OutlineCandidateWithId } from "./ai-study-outline-contract";
import type { ChatMessage, QwenJsonSchema } from "./qwen";

export type StructuredJsonFailure = { error: Error; responseContent: string | null };
export type CandidateMergeCall = {
  stage: string; messages: ChatMessage[]; jsonSchema: QwenJsonSchema;
  validateContent: (content: string) => void;
  temperature: number; enableThinking: boolean; presencePenalty?: number; topP?: number;
};
export type CandidateTopic = { id: string; title: string; summary: string; candidateIds: string[] };
const title = z.string().trim().min(1).max(80);
const label = title.max(24);
const membershipSchema = z.object({ moduleTitle: label, groupTitle: label }).strict();
const layoutSchema = z.object({
  root: z.object({ title, summary: z.string().trim().min(1).max(600) }).strict(),
  assignments: z.record(membershipSchema)
}).strict();

function leafCapacity(maxNodes: number) {
  let feasible = 0;
  for (let modules = 3; modules <= 6; modules++) for (let groups = modules; groups <= modules * 3; groups++) {
    const leaves = Math.min(groups * 3, maxNodes - 1 - modules - groups);
    if (leaves >= groups) feasible = Math.max(feasible, leaves);
  }
  return feasible;
}
function minimumLeafTopics(count: number, maxNodes: number) {
  return count < 60 ? Math.min(count, 3) : Math.min(36, Math.ceil(count / 2.5), leafCapacity(maxNodes));
}
const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

// Present diverse topics first. This changes order, never evidence or bindings.
export function orderCandidateTitlesForPlanning(candidates: OutlineCandidateWithId[]) {
  const features = candidates.map((candidate) => {
    const text = candidate.title.replace(/原理|机制|定义|概念|发现|现象|性质|本质|的|与|及|和|\s/g, "").toLowerCase();
    return new Set(Array.from({ length: Math.max(1, text.length - 1) }, (_, i) => text.slice(i, i + 2)));
  });
  const frequency = new Map<string, number>();
  for (const set of features) for (const token of set) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  const weights = new Map([...frequency].map(([token, count]) => [token, Math.log(1 + candidates.length / count)]));
  const masses = features.map((set) => [...set].reduce((sum, token) => sum + weights.get(token)!, 0));
  const similarity = (a: number, b: number) => {
    let intersection = 0;
    for (const token of features[a]) if (features[b].has(token)) intersection += weights.get(token)!;
    const union = masses[a] + masses[b] - intersection;
    return union ? intersection / union : 1;
  };
  const remaining = new Set(candidates.map((_, i) => i)), selected: number[] = [], closest = candidates.map(() => 0);
  while (remaining.size) {
    let next = remaining.values().next().value as number, distance = -1;
    for (const index of remaining) if (1 - closest[index] > distance) { next = index; distance = 1 - closest[index]; }
    selected.push(next); remaining.delete(next);
    for (const index of remaining) closest[index] = Math.max(closest[index], similarity(index, next));
  }
  return selected.map((index) => ({ candidateId: candidates[index].candidateId, title: candidates[index].title }));
}

export function buildCandidateClusterJsonSchema(ids: string[]) {
  return object({ assignments: object(Object.fromEntries(ids.map((id) => [id, { type: "string", enum: ids }]))) });
}

export function parseCandidateClusters(content: string, candidates: OutlineCandidateWithId[], maxNodes: number): CandidateTopic[] {
  const { assignments } = z.object({ assignments: z.record(z.string().min(1)) }).strict().parse(JSON.parse(content));
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  if (Object.keys(assignments).some((id) => !byId.has(id))) throw new Error("归并表引用了不存在的候选。");
  const missing = candidates.filter((candidate) => !Object.hasOwn(assignments, candidate.candidateId)).map((candidate) => candidate.candidateId);
  if (missing.length) throw new OutlineCandidateCoverageError(missing);
  const groups = new Map<string, string[]>();
  for (const candidate of candidates) {
    const representative = assignments[candidate.candidateId];
    if (!byId.has(representative)) throw new Error(`归并表指向不存在的代表候选：${representative}`);
    const members = groups.get(representative) ?? [];
    members.push(candidate.candidateId); groups.set(representative, members);
  }
  const badRepresentatives = [...groups.keys()].filter((id) => assignments[id] !== id);
  if (badRepresentatives.length) throw new Error(`同一组的代表必须指向自身，不能形成归并链或循环：${badRepresentatives.join("、")}`);
  const max = leafCapacity(maxNodes), min = minimumLeafTopics(candidates.length, maxNodes);
  if (groups.size > max || groups.size < min) throw new Error(`${candidates.length}个候选应归并为${min}-${max}个具体知识点，实际${groups.size}个。合并同一对象的历史、性质、证据；不同对象保持独立，禁止按学科大类压缩。`);
  return [...groups].map(([id, candidateIds]) => {
    if (candidateIds.length > 32) throw new Error(`候选组${id}超过32个，请拆分。`);
    const representative = byId.get(id)!;
    return { id, title: representative.title, summary: representative.summary, candidateIds };
  });
}

export function buildCandidateHierarchyJsonSchema(topics: CandidateTopic[]) {
  const text = { type: "string", minLength: 1, maxLength: 24 };
  return object({
    root: object({ title: { ...text, maxLength: 80 }, summary: { type: "string", minLength: 1, maxLength: 600 } }),
    assignments: object(Object.fromEntries(topics.map((topic) => [topic.id, object({ moduleTitle: text, groupTitle: text })])))
  });
}

export function parseCandidateHierarchy(content: string, topics: CandidateTopic[], candidates: OutlineCandidateWithId[], maxNodes: number): NestedCandidateOutline {
  const layout = layoutSchema.parse(JSON.parse(content));
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  if (Object.keys(layout.assignments).some((id) => !byId.has(id))) throw new Error("目录引用了不存在的知识点。");
  const missing = topics.filter((topic) => !Object.hasOwn(layout.assignments, topic.id));
  if (missing.length) throw new OutlineCandidateCoverageError(missing.flatMap((topic) => topic.candidateIds));
  const moduleTitles = [...new Set(topics.map((topic) => layout.assignments[topic.id].moduleTitle))];
  if (moduleTitles.length < 3 || moduleTitles.length > 6) throw new Error(`目录实际${moduleTitles.length}个模块，必须为3-6个。`);
  const modules = moduleTitles.map((moduleTitle) => {
    const moduleTopics = topics.filter((topic) => layout.assignments[topic.id].moduleTitle === moduleTitle);
    const groupTitles = [...new Set(moduleTopics.map((topic) => layout.assignments[topic.id].groupTitle))];
    if (groupTitles.length < 1 || groupTitles.length > 3) throw new Error(`模块“${moduleTitle}”实际${groupTitles.length}个概念组，必须包含1-3个；请合并上位概念或调整模块，保留全部知识点。`);
    const groups = groupTitles.map((groupTitle) => {
      const points = moduleTopics.filter((topic) => layout.assignments[topic.id].groupTitle === groupTitle).map(({ title, summary, candidateIds }) => ({ title, summary, candidateIds }));
      if (points.length < 1 || points.length > 3) throw new Error(`概念组“${groupTitle}”实际${points.length}个知识点，必须为1-3个；请拆分概念组或调整模块，不得删减知识点。`);
      return { title: groupTitle, summary: `包含：${points.map((point) => point.title).join("、")}。`, candidateIds: points.flatMap((point) => point.candidateIds), points };
    });
    return { title: moduleTitle, summary: `包含：${groups.map((group) => group.title).join("、")}。`, candidateIds: groups.flatMap((group) => group.candidateIds), groups };
  });
  const outline = nestedCandidateOutlineSchema.parse({ root: { ...layout.root, modules } });
  validateNestedCandidateOutline(outline, candidates, maxNodes);
  return outline;
}

// Settle atomic topics across the whole document, then organize immutable IDs.
// These are generation steps, not a post-generation model review.
export async function generateCandidateOutline(originalMessages: ChatMessage[], candidates: OutlineCandidateWithId[], maxNodes: number, request: (call: CandidateMergeCall) => Promise<string>, onRetry?: () => Promise<void>): Promise<NestedCandidateOutline> {
  async function requestStage(call: CandidateMergeCall) {
    let previous: StructuredJsonFailure | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) await onRetry?.();
      let responseContent: string | null = null;
      try {
        return await request({
          ...call,
          stage: `${call.stage}${attempt > 1 ? "_retry_1" : ""}`,
          messages: previous ? [
            ...call.messages,
            ...(previous.responseContent ? [{ role: "assistant" as const, content: previous.responseContent }] : []),
            { role: "user", content: ["本步骤未通过程序校验：", previous.error.message,
              ...(previous.error instanceof OutlineCandidateCoverageError ? [`缺失候选：${JSON.stringify(previous.error.missingCandidateIds)}`] : []),
              "保持本步骤原有协议及全部输入，按JSON Schema重新输出完整结果。",
              call.stage === "merging_outline_hierarchy"
                ? "只重新安排目录，不要改变已确定知识点的标题、合并关系或来源。"
                : "根据全部候选重新归并，合并同主题重复项，保留独立主题，不得丢弃候选。"
            ].join("\n") }
          ] : call.messages,
          validateContent: (content) => { responseContent = content; call.validateContent(content); }
        });
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (attempt === 2) throw failure;
        previous = { error: failure, responseContent };
      }
    }
    throw new Error("知识框架生成失败。");
  }
  const clustered = await requestStage({
        stage: "merging_outline_topics",
        messages: [...originalMessages, { role: "user", content: `本步只做语义归并，不写上层目录。先读完全部候选，把同一具体对象或机制的历史、性质、证据、应用归并为一个学习点。不同对象保持独立，同属某学科或理论不能作为混为一个点的理由。为每个候选选择本组最有代表性、能统摄本组内容的真实candidateId；代表必须指向自身，独立主题可以自成一组。目标${minimumLeafTopics(candidates.length, maxNodes)}-${leafCapacity(maxNodes)}组。只输出 {assignments:{每个candidateId:代表candidateId}}。` }],
        jsonSchema: { name: "ai_study_outline_topic_clusters", schema: buildCandidateClusterJsonSchema(candidates.map((candidate) => candidate.candidateId)) },
        validateContent: (content) => { parseCandidateClusters(content, candidates, maxNodes); },
        temperature: 0.6, presencePenalty: 0, topP: 0.95, enableThinking: true
      });
      const topics = parseCandidateClusters(clustered, candidates, maxNodes);
      let result: NestedCandidateOutline | undefined;
      await requestStage({
        stage: "merging_outline_hierarchy",
        messages: [
          { role: "system", content: `你是知识目录编辑。把给定的全部知识点组织成完整四层树：根→模块→概念组→知识点。知识点已经确定，不得合并、改名或删减；只设计上位模块和概念组。只输出 {root:{title,summary},assignments:{每个知识点ID:{moduleTitle:模块名称,groupTitle:概念组名称}}}。每个知识点直接填写其语义匹配的上位概念名称，不使用组编号或pointIds数组，避免按输入顺序错位。重复使用完全相同的模块名和组名代表同一个父节点，程序按名称组装树。模块和概念组必须是子节点共同的上位概念，不同学科不得硬凑一组，也不能仅拼接不同主题名称充当概念组。先统筹所有知识点的主题分布，再逐点填写归属。3-6个模块，每模块1-3组，每组1-3点，总节点最多${maxNodes}，包括根、模块、概念组及${topics.length}个知识点。因此模块和概念组共最多${maxNodes - 1 - topics.length}个。不得省略任何输入知识点。` },
          { role: "user", content: JSON.stringify({ topics: topics.map(({ id, title, candidateIds }) => ({ id, title, relatedTitles: candidates.filter((candidate) => candidateIds.includes(candidate.candidateId)).map((candidate) => candidate.title) })) }) }
        ],
        jsonSchema: { name: "ai_study_outline_hierarchy", schema: buildCandidateHierarchyJsonSchema(topics) },
        validateContent: (content) => { result = parseCandidateHierarchy(content, topics, candidates, maxNodes); },
        temperature: 0.6, presencePenalty: 0, topP: 0.95, enableThinking: true
      });
      if (!result) throw new Error("知识目录未完成校验。");
      return result;
}

export function buildCandidateOutlineTransportInstruction(maxNodes: number | string, candidateCount = 0) {
  return [
    "【长文档固定输出协议，优先级高于可配置提示词中的旧字段和结构示例】",
    "先完整阅读全部候选，再按具体主题归并候选。每个候选必须指定真实代表candidateId，代表指向自身。只输出 {assignments:{每个candidateId:代表candidateId}}。不要输出层级树、sourceChunkIds、summary或额外解释。",
    "同一对象的定义、性质、历史、证据及应用可共用一个知识点；不同对象、机制或独立主题不得因同属一个学科而混为一个点。选择能统摄本组的代表，保留全文后半部分和独立小主题。",
    `下一步程序会把确定的知识点组织为四层树，保留其标题、摘句和来源。总节点上限${maxNodes}，含root；模块3-6，每模块概念组1-3，每组知识点1-3。`,
    ...(typeof maxNodes === "number" && candidateCount > 0 ? [`本次${candidateCount}个候选应归并为${minimumLeafTopics(candidateCount, maxNodes)}-${leafCapacity(maxNodes)}个具体知识点；禁止为达到数量而混合不相关主题，也不要将同一对象的重复描述拆成多个点。`] : [])
  ].join("\n");
}
export function buildCandidateOutlineMergeTemplates() {
  return {
    "outline.merge.system": ["你是学习资料知识图谱总编。先从全文候选归并出完整且主题单一的学习点，再由程序组织上层目录。不得因为沿用旧目录而混合无关内容。", buildCandidateOutlineTransportInstruction("{{maxNodesPerProject}}")].join("\n\n"),
    "outline.merge.user": ["项目名称：{{projectTitle}}", "完整阅读以下全部候选后归并。相同主题合并，不同对象及独立机制保持独立。", "{{candidateNodes}}"].join("\n\n")
  };
}
