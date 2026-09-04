import { z } from "zod";

const titleSchema = z.string().trim().min(1).max(80);
const summarySchema = z.string().trim().min(1).max(600);
const sourceChunkIdsSchema = z.array(z.string().trim().min(1)).min(1).max(5000);

export const outlineCandidateSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  sourceChunkIds: sourceChunkIdsSchema
}).strict();

export const outlineCandidateListSchema = z.object({
  candidates: z.array(outlineCandidateSchema).min(1)
}).strict();

const outlinePointSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  sourceChunkIds: sourceChunkIdsSchema
}).strict();

const outlineGroupSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  sourceChunkIds: sourceChunkIdsSchema,
  points: z.array(outlinePointSchema).min(2).max(4)
}).strict();

const outlineModuleSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  sourceChunkIds: sourceChunkIdsSchema,
  groups: z.array(outlineGroupSchema).min(1).max(4)
}).strict();

const outlineRootSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  sourceChunkIds: sourceChunkIdsSchema,
  modules: z.array(outlineModuleSchema).min(3).max(6)
}).strict();

export const nestedOutlineSchema = z.object({
  root: outlineRootSchema
}).strict();

export type OutlineCandidate = z.infer<typeof outlineCandidateSchema>;
export type NestedOutline = z.infer<typeof nestedOutlineSchema>;

export type FlatOutlineNode = {
  clientId: string;
  parentClientId: string | null;
  title: string;
  summary: string;
  sourceChunkIds: string[];
};

export function flattenNestedOutline(outline: NestedOutline): FlatOutlineNode[] {
  const nodes: FlatOutlineNode[] = [{
    clientId: "root",
    parentClientId: null,
    title: outline.root.title,
    summary: outline.root.summary,
    sourceChunkIds: outline.root.sourceChunkIds
  }];

  for (const [moduleIndex, module] of outline.root.modules.entries()) {
    const moduleId = `module_${moduleIndex + 1}`;
    nodes.push({
      clientId: moduleId,
      parentClientId: "root",
      title: module.title,
      summary: module.summary,
      sourceChunkIds: module.sourceChunkIds
    });

    for (const [groupIndex, group] of module.groups.entries()) {
      const groupId = `group_${moduleIndex + 1}_${groupIndex + 1}`;
      nodes.push({
        clientId: groupId,
        parentClientId: moduleId,
        title: group.title,
        summary: group.summary,
        sourceChunkIds: group.sourceChunkIds
      });

      for (const [pointIndex, point] of group.points.entries()) {
        nodes.push({
          clientId: `point_${moduleIndex + 1}_${groupIndex + 1}_${pointIndex + 1}`,
          parentClientId: groupId,
          title: point.title,
          summary: point.summary,
          sourceChunkIds: point.sourceChunkIds
        });
      }
    }
  }

  return nodes;
}

function buildSourceChunkIdsJsonSchema(allowedSourceChunkIds: string[]) {
  const allowedIds = Array.from(new Set(allowedSourceChunkIds.filter(Boolean)));
  if (allowedIds.length === 0) {
    throw new Error("结构化大纲缺少可用的来源片段 ID。");
  }
  return {
    type: "array",
    minItems: 1,
    maxItems: Math.min(8, allowedIds.length),
    items: { type: "string", enum: allowedIds }
  };
}

function buildBaseNodeJsonProperties(allowedSourceChunkIds: string[]) {
  return {
    title: { type: "string", minLength: 1, maxLength: 80 },
    summary: { type: "string", minLength: 1, maxLength: 600 },
    sourceChunkIds: buildSourceChunkIdsJsonSchema(allowedSourceChunkIds)
  };
}

export function buildOutlineCandidateJsonSchema(
  maxCandidates: number,
  allowedSourceChunkIds: string[]
): Record<string, unknown> {
  const baseNodeJsonProperties = buildBaseNodeJsonProperties(allowedSourceChunkIds);
  return {
    type: "object",
    additionalProperties: false,
    required: ["candidates"],
    properties: {
      candidates: {
        type: "array",
        minItems: 1,
        maxItems: Math.max(1, Math.floor(maxCandidates)),
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "summary", "sourceChunkIds"],
          properties: baseNodeJsonProperties
        }
      }
    }
  };
}

export function buildNestedOutlineJsonSchema(allowedSourceChunkIds: string[]): Record<string, unknown> {
  const baseNodeJsonProperties = buildBaseNodeJsonProperties(allowedSourceChunkIds);
  return {
    type: "object",
    additionalProperties: false,
    required: ["root"],
    properties: {
      root: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "sourceChunkIds", "modules"],
        properties: {
          ...baseNodeJsonProperties,
          modules: {
            type: "array",
            minItems: 3,
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "summary", "sourceChunkIds", "groups"],
              properties: {
                ...baseNodeJsonProperties,
                groups: {
                  type: "array",
                  minItems: 1,
                  maxItems: 4,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "summary", "sourceChunkIds", "points"],
                    properties: {
                      ...baseNodeJsonProperties,
                      points: {
                        type: "array",
                        minItems: 2,
                        maxItems: 4,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["title", "summary", "sourceChunkIds"],
                          properties: baseNodeJsonProperties
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}
