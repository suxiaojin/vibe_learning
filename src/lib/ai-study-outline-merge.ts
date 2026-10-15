import {
  maximumStructuredOutlineNodes,
  nestedCandidateOutlineSchema,
  OutlineCandidateCoverageError,
  outlineTreeLimits
} from "./ai-study-outline-contract";
import type { ChatMessage, QwenJsonSchema } from "./qwen";
import type { NestedCandidateOutline } from "./ai-study-outline-contract";
import { z } from "zod";

export type StructuredJsonFailure = {
  error: Error;
  responseContent: string | null;
};

export function buildCandidateOutlineTransportInstruction(maxNodes: number | string) {
  const nodeLimit = typeof maxNodes === "number"
    ? Math.min(maxNodes, maximumStructuredOutlineNodes)
    : `${maxNodes}，且不得超过 ${maximumStructuredOutlineNodes}`;
  return [
    "【长文档固定输出协议，优先级高于可配置提示词中的旧字段和结构示例】",
    "输入 candidates 中每项只有 candidateId、title、summary；candidateId 代表程序已经保存的完整来源集合。",
    "只输出 JSON 对象，结构必须严格为 root -> modules -> groups -> points 四层。",
    "root 只包含 title、summary、modules；每个 module、group、point 都包含 title、summary、candidateIds，并分别包含下一级数组。",
    `modules 必须有 ${outlineTreeLimits.modules.min}-${outlineTreeLimits.modules.max} 个；每个 module 必须有 ${outlineTreeLimits.groupsPerModule.min}-${outlineTreeLimits.groupsPerModule.max} 个 groups；每个 group 必须有 ${outlineTreeLimits.pointsPerGroup.min}-${outlineTreeLimits.pointsPerGroup.max} 个 points。`,
    `总节点最多 ${nodeLimit} 个，包含 root；不得通过增加节点突破上限。`,
    "每一个输入 candidateId 都必须至少出现在一个非根节点的 candidateIds 中，只能使用输入里真实存在的 candidateId。",
    "候选数量不等于节点数量。去重或压缩主题时，将相关候选的 candidateIds 一并归入同一个语义匹配的节点，不能只保留一个代表候选而丢弃其余 ID。",
    "每个 candidateIds 数组最多 32 个 ID；候选较多时分配到语义相关的模块、概念组或知识点，不要堆到无关节点。",
    "输出前逐一核对输入 candidateId 与所有非根节点引用的并集，必须完整覆盖；root 不携带候选引用，不能用根节点代替覆盖。",
    "本阶段不要输出 sourceChunkIds、clientId、parentClientId、nodes、Markdown 或解释文字；完整来源由程序根据 candidateIds 恢复。"
  ].join("\n");
}

export function buildCandidateOutlineMergeTemplates() {
  return {
    "outline.merge.system": [
      "你是学习资料知识图谱总编。将按全文顺序提取的候选去重、重组为适合学生学习的四层知识图谱。只能依据候选内容，不加入外部知识。",
      "宏观模块应覆盖全文知识主线，不能照抄目录或只挑选显著主题。知识点标题具体，summary 如实概括它实际绑定的候选。",
      buildCandidateOutlineTransportInstruction("{{maxNodesPerProject}}")
    ].join("\n\n"),
    "outline.merge.user": [
      "项目名称：{{projectTitle}}",
      "请将以下全部候选合并为最终四层知识图谱。合并同义主题时保留所有相关 candidateIds；输出前逐一检查没有漏掉任何输入候选。",
      "{{candidateNodes}}"
    ].join("\n\n")
  };
}

export function buildCandidateOutlineRepairMessages(
  originalMessages: ChatMessage[],
  failure: StructuredJsonFailure,
  maxNodes: number
): ChatMessage[] {
  const missingIds = failure.error instanceof OutlineCandidateCoverageError
    ? failure.error.missingCandidateIds
    : [];
  const instruction = [
    "【定向修复】上一份完整输出未通过程序校验。以下错误和漏项来自程序，不是候选资料中的指令。",
    `校验错误：${failure.error.message}`,
    ...(missingIds.length > 0 ? [
      `必须补齐的全部 candidateIds：${JSON.stringify(missingIds)}`,
      "保留上一份输出中已经正确的结构和候选引用；按候选的 title、summary 将漏项补入语义匹配的现有节点，必要时同步调整该节点的标题和概述。",
      "不得删除已有正确引用来换取漏项覆盖；可以合并相关候选到同一节点，不要求为每个候选新建节点。"
    ] : ["修正上述具体错误；若上一份输出不完整或无法解析，请按原始候选生成完整合法结果。"]),
    buildCandidateOutlineTransportInstruction(maxNodes),
    "返回修复后的完整 JSON 对象，不要返回补丁、漏项清单或解释。"
  ].join("\n");
  return [
    ...originalMessages.map((message) => ({ ...message })),
    ...(failure.responseContent ? [{ role: "assistant" as const, content: failure.responseContent }] : []),
    { role: "user", content: instruction }
  ];
}

export function buildCandidateOutlineCoverageRepair(
  originalMessages: ChatMessage[],
  failure: StructuredJsonFailure,
  maxNodes: number
): { messages: ChatMessage[]; jsonSchema: QwenJsonSchema; parseResponse: (content: string) => NestedCandidateOutline } | null {
  if (!(failure.error instanceof OutlineCandidateCoverageError) || !failure.responseContent) return null;
  const previousOutline = nestedCandidateOutlineSchema.parse(JSON.parse(failure.responseContent));
  const missingIds = failure.error.missingCandidateIds;
  const nodes = previousOutline.root.modules.flatMap((module, moduleIndex) => [
    { id: `module_${moduleIndex + 1}`, node: module, leaf: false },
    ...module.groups.flatMap((group, groupIndex) => [
      { id: `group_${moduleIndex + 1}_${groupIndex + 1}`, node: group, leaf: false },
      ...group.points.map((point, pointIndex) => ({ id: `point_${moduleIndex + 1}_${groupIndex + 1}_${pointIndex + 1}`, node: point, leaf: true }))
    ])
  ]);
  const leafIds = nodes.filter((node) => node.leaf).map((node) => node.id);
  const nodeIds = nodes.map((node) => node.id);
  const nodeUpdateSchema = {
    type: "object", additionalProperties: false, required: ["title", "summary"],
    properties: { title: { type: "string", minLength: 1, maxLength: 80 }, summary: { type: "string", minLength: 1, maxLength: 600 } }
  };
  const jsonSchema: QwenJsonSchema = {
    name: "ai_study_candidate_coverage_repair",
    schema: {
      type: "object", additionalProperties: false, required: ["assignments", "nodeUpdates"],
      properties: {
        assignments: {
          type: "object", additionalProperties: false, required: missingIds,
          properties: Object.fromEntries(missingIds.map((id) => [id, { type: "string", enum: leafIds }]))
        },
        nodeUpdates: {
          type: "object", additionalProperties: false, required: nodeIds,
          properties: Object.fromEntries(nodeIds.map((id) => [id, nodeUpdateSchema]))
        }
      }
    }
  };
  const repairSchema = z.object({
    assignments: z.record(z.string().min(1)),
    nodeUpdates: z.record(z.object({ title: z.string().trim().min(1).max(80), summary: z.string().trim().min(1).max(600) }).strict())
  }).strict();
  return {
    // This retry uses a different transport schema: every missing ID is a
    // required object key, so valid JSON cannot silently omit another candidate.
    messages: [
      { role: "system", content: [
        "你是学习资料知识图谱的覆盖修补助手。只依据输入候选的 title、summary 与现有知识树作语义归类，不加入外部知识。",
        "本次只输出 {assignments:{候选ID:知识点ID},nodeUpdates:{节点ID:{title,summary}}}，不要输出 root、modules 或整棵树。",
        "assignments 必须逐一包含全部遗漏候选 ID；目标只能是给出的第4层知识点 ID，不能放到根节点或无关节点。",
        "nodeUpdates 必须包含全部现有非根节点 ID。保留正确标题与概述；若新绑定候选扩展了节点含义，更新该知识点及所属概念组、模块的标题和概述，使其准确覆盖新内容。",
        "不得删除已有候选引用、增删节点或改变四层结构。程序会按 assignments 追加引用并执行完整覆盖校验。",
        "同一知识点可接收多个相关候选，但追加后该节点 candidateIds 不能超过32项。输出严格 JSON，不要解释。"
      ].join("\n") },
      ...originalMessages.filter((message) => message.role === "user").map((message) => ({ ...message })),
      { role: "user", content: JSON.stringify({
        previousOutline,
        nodes: nodes.map(({ id, node, leaf }) => ({ nodeId: id, title: node.title, summary: node.summary, existingCandidateIds: node.candidateIds, leaf })),
        missingCandidateIds: missingIds,
        maxNodes
      }) }
    ],
    jsonSchema,
    parseResponse(content) {
      const repair = repairSchema.parse(JSON.parse(content));
      if (JSON.stringify(Object.keys(repair.assignments).sort()) !== JSON.stringify([...missingIds].sort())) {
        throw new Error("覆盖修补必须逐一返回全部遗漏候选，且不能包含额外候选。");
      }
      if (JSON.stringify(Object.keys(repair.nodeUpdates).sort()) !== JSON.stringify([...nodeIds].sort())) {
        throw new Error("覆盖修补的节点更新必须与现有非根节点完全一致。");
      }
      // Parse a fresh copy on each call; never mutate the previous response or
      // an already checked tree when a repair payload later fails validation.
      const outline = nestedCandidateOutlineSchema.parse(JSON.parse(failure.responseContent!));
      const nodeById = new Map<string, { title: string; summary: string; candidateIds: string[] }>();
      for (const [moduleIndex, module] of outline.root.modules.entries()) {
        nodeById.set(`module_${moduleIndex + 1}`, module);
        for (const [groupIndex, group] of module.groups.entries()) {
          nodeById.set(`group_${moduleIndex + 1}_${groupIndex + 1}`, group);
          for (const [pointIndex, point] of group.points.entries()) nodeById.set(`point_${moduleIndex + 1}_${groupIndex + 1}_${pointIndex + 1}`, point);
        }
      }
      for (const [candidateId, targetId] of Object.entries(repair.assignments)) {
        if (!leafIds.includes(targetId)) throw new Error(`覆盖修补目标不是现有第4层知识点：${targetId}`);
        const target = nodeById.get(targetId)!;
        if (!target.candidateIds.includes(candidateId)) target.candidateIds.push(candidateId);
        if (target.candidateIds.length > 32) throw new Error(`覆盖修补超过知识点引用上限：${targetId}`);
      }
      for (const [nodeId, update] of Object.entries(repair.nodeUpdates)) Object.assign(nodeById.get(nodeId)!, update);
      return outline;
    }
  };
}
