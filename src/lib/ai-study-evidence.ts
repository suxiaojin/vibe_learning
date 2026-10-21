import crypto from "node:crypto";
import { z } from "zod";
import type { ChatMessage, QwenJsonSchema } from "./qwen";

const text = z.string().trim().min(1);
const title = text.max(80);
const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const string = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const unique = <T>(values: T[]) => [...new Set(values)];
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export type EvidenceSource = {
  id: string; content: string; pageStart: number; pageEnd: number;
  evidenceBlocks?: { id: string; content: string; pageNumber: number; blockType?: string }[];
};
export type EvidenceUnit = { id: string; sourceChunkId: string; sourceChunkIds?: string[]; sourceBlockIds: string[]; blockType?: string; pageStart: number; pageEnd: number; text: string };
export type EvidenceDecision = { topics: { title: string; anchor: string }[]; exclusion: "" | "publication_metadata" | "navigation" | "supporting_material" };
export type LearningObjective = { id: string; unitId: string; title: string; anchor: string };
export type LearningTopic = { id: string; title: string; objectives: LearningObjective[] };
export type CurriculumNode = { clientId: string; parentClientId: string | null; title: string; summary: string; sourceChunkIds: string[]; depth: number; sortOrder: number };
export type Curriculum = {
  protocol: string; fingerprint: string; units: EvidenceUnit[];
  decisions: Record<string, EvidenceDecision>; topics: LearningTopic[];
  nodes: CurriculumNode[]; nodeIds?: Record<string, string>;
};
export type CurriculumCall = {
  stage: string; messages: ChatMessage[]; jsonSchema: QwenJsonSchema;
  validateContent: (content: string) => void; maxCompletionTokens: number;
  inputIds?: string[];
};

function splitText(value: string, limit: number): string[] {
  const result: string[] = [];
  let current = "";
  for (const sentence of value.match(/[^。！？\n]+[。！？\n]?|[。！？\n]/g) ?? [value]) {
    if (current && current.length + sentence.length > limit) { result.push(current); current = ""; }
    let remaining = sentence;
    while (remaining.length > limit) { result.push(remaining.slice(0, limit)); remaining = remaining.slice(limit); }
    current += remaining;
  }
  if (current) result.push(current);
  return result.filter((part) => part.trim()).map((part) => part.trim());
}

export function buildEvidenceUnits(sources: EvidenceSource[]): EvidenceUnit[] {
  const owners = new Map<string, string[]>();
  for (const source of sources) for (const block of source.evidenceBlocks ?? [{ id: source.id }]) owners.set(block.id, unique([...(owners.get(block.id) ?? []), source.id]));
  const seenBlocks = new Set<string>();
  return sources.flatMap((source) => {
    const blocks: NonNullable<EvidenceSource["evidenceBlocks"]> = source.evidenceBlocks?.length
      ? source.evidenceBlocks
      : [{ id: source.id, content: source.content, pageNumber: source.pageStart }];
    const units: EvidenceUnit[] = [];
    let parts: { id: string; content: string; pageNumber: number; blockType?: string }[] = [];
    const flush = () => {
      if (!parts.length) return;
      const content = parts.map((part) => part.content).join("\n\n");
      units.push({
        id: `e_${hash(`${source.id}\0${units.length}\0${content}`).slice(0, 16)}`,
        sourceChunkId: source.id, sourceChunkIds: unique(parts.flatMap((part) => owners.get(part.id) ?? [source.id])), sourceBlockIds: unique(parts.map((part) => part.id)), blockType: parts[0].blockType,
        pageStart: Math.min(...parts.map((part) => part.pageNumber)),
        pageEnd: source.evidenceBlocks?.length ? Math.max(...parts.map((part) => part.pageNumber)) : source.pageEnd,
        text: content
      });
      parts = [];
    };
    for (const block of blocks) {
      if (seenBlocks.has(block.id)) continue;
      seenBlocks.add(block.id);
      const previous = units.at(-1);
      if (previous && ["equation", "table", "code"].includes(block.blockType ?? "")
        && /公式|方程|如下|下表|代码|程序/.test(previous.text.slice(-300))
        && previous.text.length + block.content.length + 2 <= 6000) {
        previous.text += `\n\n${block.content}`;
        previous.blockType = "text";
        previous.sourceBlockIds = unique([...previous.sourceBlockIds, block.id]);
        previous.sourceChunkIds = unique([...(previous.sourceChunkIds ?? [source.id]), ...(owners.get(block.id) ?? [source.id])]);
        previous.pageEnd = Math.max(previous.pageEnd, block.pageNumber);
        previous.id = `e_${hash(`${source.id}\0${units.length - 1}\0${previous.text}`).slice(0, 16)}`;
        continue;
      }
      const paragraphs = ["equation", "table", "code"].includes(block.blockType ?? "") || block.content.startsWith("```") ? [block.content] : block.content.split(/\n{2,}/).filter((part) => part.trim());
      for (const paragraph of paragraphs) for (const part of splitText(paragraph, 6000)) {
        parts.push({ ...block, content: part });
        // Never combine distinct paragraphs. Their claims may concern different
        // objects even when they appear on the same page or in the same chunk.
        flush();
      }
    }
    flush();
    return units;
  });
}

function assertExactKeys(actual: object, expected: string[], label: string) {
  const allowed = new Set(expected);
  const missing = expected.filter((id) => !Object.hasOwn(actual, id));
  const extra = Object.keys(actual).filter((id) => !allowed.has(id));
  if (missing.length || extra.length) throw new Error(`${label}不完整；缺失：${missing.join("、")}；未知：${extra.join("、")}`);
}

const membership = z.object({ moduleTitle: title, groupTitle: title }).strict();
const directoryChoice = (entry: z.infer<typeof membership>) => `${entry.moduleTitle} → ${entry.groupTitle}`;
export function curriculumDirectorySchema(topics: LearningTopic[], taxonomy?: z.infer<typeof membership>[]) {
  const item = taxonomy?.length ? { type: "string", enum: taxonomy.map(directoryChoice) } : object({ moduleTitle: string(80), groupTitle: string(80) });
  return object({ assignments: object(Object.fromEntries(topics.map((topic) => [topic.id, item]))) });
}

export function parseCurriculumDirectory(content: string, topics: LearningTopic[], taxonomy?: z.infer<typeof membership>[]) {
  const wire = z.object({ assignments: z.record(z.union([membership, text])) }).strict().parse(JSON.parse(content));
  const assignments = Object.fromEntries(Object.entries(wire.assignments).map(([id, entry]) => {
    const restored = typeof entry === "string" ? taxonomy?.find((option) => directoryChoice(option) === entry) : entry;
    if (!restored) throw new Error("目录路径不属于全文统一目录。");
    return [id, restored];
  }));
  assertExactKeys(assignments, topics.map((topic) => topic.id), "知识目录");
  if (taxonomy) for (const entry of Object.values(assignments)) if (!taxonomy.some((item) => item.moduleTitle === entry.moduleTitle && item.groupTitle === entry.groupTitle)) throw new Error("知识点归属不在全文统一目录中。");
  return assignments;
}

export function parseCurriculumTaxonomy(content: string) {
  const { groups } = z.object({ groups: z.array(membership).min(1).max(120) }).strict().parse(JSON.parse(content));
  if (new Set(groups.map((item) => `${item.moduleTitle}\0${item.groupTitle}`)).size !== groups.length) throw new Error("全文目录包含重复分组。");
  if (new Set(groups.map(directoryChoice)).size !== groups.length) throw new Error("全文目录路径存在歧义，请使用不同的模块或概念组名称。");
  return groups;
}
