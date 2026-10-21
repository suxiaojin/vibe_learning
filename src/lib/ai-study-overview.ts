import { z } from "zod";
import type { ChatMessage } from "./qwen";
import { assertEvidenceFidelity } from "./ai-study-grounded-card";
import { renderAiStudyOverviewPrompt, type AiStudyOverviewPromptTemplates } from "./ai-study-overview-prompt-template";

export type OverviewNode = {
  id: string;
  parentId: string | null;
  title: string;
  depth: number;
  sourceChunkIds: unknown;
};

export type OverviewSource = { id: string; pageStart: number; content: string };

export type OverviewGroup = {
  title: string;
  topics: string[];
  evidence: { page: number; text: string }[];
};

export const overviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["overview"],
  properties: { overview: { type: "string", minLength: 40, maxLength: 400 } }
};

function chunkIds(node: OverviewNode): string[] {
  return Array.isArray(node.sourceChunkIds)
    ? node.sourceChunkIds.filter((id): id is string => typeof id === "string")
    : [];
}

function evenSample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  if (limit === 1) return [items[0]];
  return Array.from({ length: limit }, (_, index) => items[Math.floor(index * (items.length - 1) / (limit - 1))]);
}

export function selectOverviewSources(node: OverviewNode, descendants: OverviewNode[]) {
  if (node.depth !== 1) throw new Error("仅二层节点可以生成内容概述。");
  const groups = descendants.filter((item) => item.depth === 2 && item.parentId === node.id);
  if (!groups.length) throw new Error("二层节点缺少下层主题。");
  const sourceIds = new Set<string>();
  const leavesByGroup = groups.map((group) => ({
    group,
    leaves: descendants.filter((item) => item.depth === 3 && item.parentId === group.id),
    sampledIds: [] as string[]
  }));
  const perGroup = Math.max(1, Math.floor(32 / groups.length));
  for (const entry of leavesByGroup) {
    const selected = evenSample(entry.leaves.length ? entry.leaves : [entry.group], perGroup);
    for (const leaf of selected) {
      const ids = chunkIds(leaf).length ? chunkIds(leaf) : chunkIds(entry.group);
      for (const id of evenSample(ids, 2)) {
        sourceIds.add(id);
        entry.sampledIds.push(id);
      }
    }
  }
  if (!sourceIds.size) throw new Error("二层节点缺少可引用的原文片段。");
  return { leavesByGroup, sourceIds: [...sourceIds] };
}

function sourceText(value: string): string {
  return value.replace(/<\/\s*(?:p|tr|li)>/gi, "。")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

export function buildOverviewGroups(
  selected: ReturnType<typeof selectOverviewSources>,
  sources: OverviewSource[]
): OverviewGroup[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return selected.leavesByGroup.map(({ group, leaves, sampledIds }) => {
    const evidence = sampledIds
      .map((id) => byId.get(id))
      .filter((source): source is OverviewSource => Boolean(source))
      .map((source) => ({ page: source.pageStart, text: sourceText(source.content) }))
      .filter((item) => Boolean(item.text));
    return { title: group.title, topics: leaves.map((leaf) => leaf.title), evidence: [...new Map(evidence.map((item) => [item.page + item.text, item])).values()] };
  });
}

export function overviewMessages(projectTitle: string, nodeTitle: string, groups: OverviewGroup[], templates: AiStudyOverviewPromptTemplates): ChatMessage[] {
  if (!groups.some((group) => group.evidence.length)) throw new Error("概述缺少原文依据。");
  const context = JSON.stringify({ project: projectTitle, module: nodeTitle, groups });
  return [
    { role: "system", content: templates["overview.system"] },
    { role: "user", content: renderAiStudyOverviewPrompt(templates["overview.user"], context) }
  ];
}

export function parseOverview(raw: string, groups: OverviewGroup[]): string {
  const { overview } = z.object({ overview: z.string().trim().min(40).max(400) }).strict().parse(JSON.parse(raw));
  if (/本部分包含|请选择下层知识点|请选择下层/.test(overview) || /(?:^|\n)\s*(?:[-•]|\d+[.、])/.test(overview)) {
    throw new Error("概述仍是目录罗列，请改写为连贯导读。");
  }
  const evidence = groups.flatMap((group) => [group.title, ...group.topics, ...group.evidence.map((item) => item.text)]).join("\n");
  assertEvidenceFidelity(overview, evidence, { skipClaimHeuristics: true });
  return overview;
}
