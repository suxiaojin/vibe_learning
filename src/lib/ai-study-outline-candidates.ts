import { z } from "zod";
import { outlineCandidateListSchema } from "./ai-study-outline-contract";

type CandidateSource = { id: string; content: string };

function sourceExcerpts(sources: CandidateSource[]) {
  return sources.flatMap((source, index) => {
    const parts: string[] = [];
    let current = "";
    for (const sentence of source.content.match(/[^。！？\n]+[。！？\n]?/g) ?? [source.content]) {
      if (current.length + sentence.length > 240 && current) { parts.push(current); current = ""; }
      let rest = sentence;
      while (rest.length > 240) { parts.push(rest.slice(0, 240)); rest = rest.slice(240); }
      current += rest;
    }
    if (current.trim()) parts.push(current);
    return parts.filter((part) => part.trim()).map((text, j) => ({ id: `excerpt_${index + 1}_${j + 1}`, sourceId: source.id, text: text.trim() }));
  });
}

export function formatOutlineCandidateSources(sources: CandidateSource[]) {
  const excerpts = sourceExcerpts(sources);
  return sources.map((source) => `[sourceChunkId=${source.id}]\n${excerpts.filter((excerpt) => excerpt.sourceId === source.id).map((excerpt) => `[${excerpt.id}] ${excerpt.text}`).join("\n")}`).join("\n\n---\n\n");
}

export function buildOutlineCandidatePlanJsonSchema(maxCandidates: number, sources: CandidateSource[]): Record<string, unknown> {
  const sourceIds = sources.map((source) => source.id);
  const excerptIds = sourceExcerpts(sources).map((excerpt) => excerpt.id);
  const candidateIds = Array.from({ length: maxCandidates }, (_, i) => `candidate_${i + 1}`);
  return {
    type: "object", additionalProperties: false, required: ["candidates", "assignments"],
    properties: {
      candidates: {
        type: "array", minItems: 1, maxItems: maxCandidates, items: {
          type: "object", additionalProperties: false, required: ["candidateId", "title", "excerptIds"],
          properties: {
            candidateId: { type: "string", enum: candidateIds },
            title: { type: "string", minLength: 1, maxLength: 80 },
            excerptIds: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: excerptIds } }
          }
        }
      },
      assignments: {
        type: "object", additionalProperties: false, required: sourceIds,
        properties: Object.fromEntries(sourceIds.map((id) => [id, {
          type: "array", minItems: 1, maxItems: Math.min(8, maxCandidates), items: { type: "string", enum: candidateIds }
        }]))
      }
    }
  };
}

export function parseOutlineCandidatePlan(content: string, maxCandidates: number, sources: CandidateSource[]) {
  const sourceIds = sources.map((source) => source.id);
  const plan = z.object({
    candidates: z.array(z.object({ candidateId: z.string().min(1), title: z.string().trim().min(1).max(80), excerptIds: z.array(z.string().min(1)).min(1).max(2) }).strict()).min(1).max(maxCandidates),
    assignments: z.record(z.array(z.string().min(1)).min(1).max(Math.min(8, maxCandidates)))
  }).strict().parse(JSON.parse(content));
  const allowedSources = new Set(sourceIds);
  if (Object.keys(plan.assignments).some((id) => !allowedSources.has(id)) || sourceIds.some((id) => !Object.hasOwn(plan.assignments, id))) throw new Error("候选来源归属必须与本批全部片段一一对应。");
  const sourcesByCandidate = new Map<string, string[]>();
  for (const candidate of plan.candidates) {
    if (sourcesByCandidate.has(candidate.candidateId) || !Array.from({ length: maxCandidates }, (_, i) => `candidate_${i + 1}`).includes(candidate.candidateId)) throw new Error("候选 ID 无效或重复。");
    sourcesByCandidate.set(candidate.candidateId, []);
  }
  for (const [sourceId, targets] of Object.entries(plan.assignments)) {
    for (const target of new Set(targets)) {
      const sources = sourcesByCandidate.get(target);
      if (!sources) throw new Error(`来源指向未生成的候选：${target}`);
      sources.push(sourceId);
    }
  }
  const excerptById = new Map(sourceExcerpts(sources).map((excerpt) => [excerpt.id, excerpt]));
  return outlineCandidateListSchema.parse({ candidates: plan.candidates.map(({ candidateId, title, excerptIds }) => {
    const sourceChunkIds = sourcesByCandidate.get(candidateId)!;
    const summary = Array.from(new Set(excerptIds)).map((id) => {
      const excerpt = excerptById.get(id);
      if (!excerpt) throw new Error(`候选 ${candidateId} 的摘句 ${id} 不存在。`);
      // The model explicitly chose this original passage as evidence. Restore
      // its actual provenance even if the separate coverage map omitted it.
      if (!sourceChunkIds.includes(excerpt.sourceId)) sourceChunkIds.push(excerpt.sourceId);
      return excerpt.text;
    }).join("\n");
    return { title, summary, sourceChunkIds };
  }) });
}

export function buildOutlineCandidatePlanInstruction(maxCandidates: number) {
  return [
    "【固定输出协议，优先级高于可配置提示词中的旧字段和示例】",
    `只输出 {candidates:[{candidateId,title,excerptIds}],assignments:{每个输入sourceChunkId:[candidateId]}}。候选最多${maxCandidates}个；candidateId 使用 candidate_1 到 candidate_${maxCandidates}，不得重复。`,
    "每个候选围绕单一原子主题。依据原文语义逐一归属全部来源片段；一个片段包含多个独立主题时可归属多个相应候选。图片或图注应依据其内容和上下文归属相应主题。",
    "title 概括主题；excerptIds 选择原文中直接说明该主题的1-2个真实 excerpt 编号，只能来自 assignments 为该候选绑定的来源片段。程序按编号恢复原文作为候选摘要，保留数字、单位、否定、推测与限定条件。不要自行生成 summary。",
    "assignments 必须包含本批全部真实 sourceChunkId；目标只能是本次生成的候选，且每个候选都必须有来源。不能仅按位置邻近补绑，也不能为覆盖片段把不相关主题混成一个候选。",
    "候选不要输出 sourceChunkIds、层级树或额外解释；程序根据 assignments 恢复完整来源。"
  ].join("\n");
}
