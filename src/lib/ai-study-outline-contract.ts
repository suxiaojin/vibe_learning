import { z } from "zod";

const titleSchema = z.string().trim().min(1).max(80);
const summarySchema = z.string().trim().min(1).max(600);
const sourceChunkIdsSchema = z.array(z.string().trim().min(1)).min(1).max(5000);
const candidateIdsSchema = z.array(z.string().trim().min(1)).min(1).max(5000);

export const outlineTreeLimits = {
  modules: { min: 3, max: 6 },
  groupsPerModule: { min: 1, max: 2 },
  pointsPerGroup: { min: 2, max: 3 }
} as const;

export const maximumStructuredOutlineNodes = 1
  + outlineTreeLimits.modules.max
  + outlineTreeLimits.modules.max * outlineTreeLimits.groupsPerModule.max
  + outlineTreeLimits.modules.max * outlineTreeLimits.groupsPerModule.max * outlineTreeLimits.pointsPerGroup.max;

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
  points: z.array(outlinePointSchema)
    .min(outlineTreeLimits.pointsPerGroup.min)
    .max(outlineTreeLimits.pointsPerGroup.max)
}).strict();

const outlineModuleSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  sourceChunkIds: sourceChunkIdsSchema,
  groups: z.array(outlineGroupSchema)
    .min(outlineTreeLimits.groupsPerModule.min)
    .max(outlineTreeLimits.groupsPerModule.max)
}).strict();

const outlineRootSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  sourceChunkIds: sourceChunkIdsSchema,
  modules: z.array(outlineModuleSchema)
    .min(outlineTreeLimits.modules.min)
    .max(outlineTreeLimits.modules.max)
}).strict();

export const nestedOutlineSchema = z.object({
  root: outlineRootSchema
}).strict();

const candidateOutlinePointSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  candidateIds: candidateIdsSchema
}).strict();

const candidateOutlineGroupSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  candidateIds: candidateIdsSchema,
  points: z.array(candidateOutlinePointSchema)
    .min(outlineTreeLimits.pointsPerGroup.min)
    .max(outlineTreeLimits.pointsPerGroup.max)
}).strict();

const candidateOutlineModuleSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  candidateIds: candidateIdsSchema,
  groups: z.array(candidateOutlineGroupSchema)
    .min(outlineTreeLimits.groupsPerModule.min)
    .max(outlineTreeLimits.groupsPerModule.max)
}).strict();

const candidateOutlineRootSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  modules: z.array(candidateOutlineModuleSchema)
    .min(outlineTreeLimits.modules.min)
    .max(outlineTreeLimits.modules.max)
}).strict();

export const nestedCandidateOutlineSchema = z.object({
  root: candidateOutlineRootSchema
}).strict();

export type OutlineCandidate = z.infer<typeof outlineCandidateSchema>;
export type NestedOutline = z.infer<typeof nestedOutlineSchema>;
export type NestedCandidateOutline = z.infer<typeof nestedCandidateOutlineSchema>;
export type OutlineCandidateWithId = OutlineCandidate & { candidateId: string };

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

export function flattenNestedCandidateOutline(
  outline: NestedCandidateOutline,
  candidates: OutlineCandidateWithId[]
): FlatOutlineNode[] {
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const resolveSourceChunkIds = (candidateIds: string[]) => Array.from(new Set(candidateIds.flatMap((candidateId) => {
    const candidate = candidateById.get(candidateId);
    if (!candidate) {
      throw new Error(`知识框架引用了不存在的候选：${candidateId}`);
    }
    return candidate.sourceChunkIds;
  })));
  const nodes: FlatOutlineNode[] = [{
    clientId: "root",
    parentClientId: null,
    title: outline.root.title,
    summary: outline.root.summary,
    sourceChunkIds: Array.from(new Set(candidates.flatMap((candidate) => candidate.sourceChunkIds)))
  }];

  for (const [moduleIndex, module] of outline.root.modules.entries()) {
    const moduleId = `module_${moduleIndex + 1}`;
    nodes.push({
      clientId: moduleId,
      parentClientId: "root",
      title: module.title,
      summary: module.summary,
      sourceChunkIds: resolveSourceChunkIds(module.candidateIds)
    });

    for (const [groupIndex, group] of module.groups.entries()) {
      const groupId = `group_${moduleIndex + 1}_${groupIndex + 1}`;
      nodes.push({
        clientId: groupId,
        parentClientId: moduleId,
        title: group.title,
        summary: group.summary,
        sourceChunkIds: resolveSourceChunkIds(group.candidateIds)
      });

      for (const [pointIndex, point] of group.points.entries()) {
        nodes.push({
          clientId: `point_${moduleIndex + 1}_${groupIndex + 1}_${pointIndex + 1}`,
          parentClientId: groupId,
          title: point.title,
          summary: point.summary,
          sourceChunkIds: resolveSourceChunkIds(point.candidateIds)
        });
      }
    }
  }

  return nodes;
}

export function ensureOutlineCandidateSourceCoverage(
  candidates: OutlineCandidate[],
  orderedSourceChunkIds: string[]
): OutlineCandidate[] {
  if (candidates.length === 0) {
    throw new Error("知识候选不能为空。");
  }
  const allowedIds = Array.from(new Set(orderedSourceChunkIds.filter(Boolean)));
  const allowedIdSet = new Set(allowedIds);
  const sourceIndexById = new Map(allowedIds.map((id, index) => [id, index]));
  const normalized = candidates.map((candidate) => ({
    ...candidate,
    sourceChunkIds: Array.from(new Set(candidate.sourceChunkIds))
  }));

  for (const candidate of normalized) {
    const invalidId = candidate.sourceChunkIds.find((id) => !allowedIdSet.has(id));
    if (invalidId) {
      throw new Error(`知识候选“${candidate.title}”引用了不存在的来源片段：${invalidId}`);
    }
  }

  const coveredIds = new Set(normalized.flatMap((candidate) => candidate.sourceChunkIds));
  for (const missingId of allowedIds) {
    if (coveredIds.has(missingId)) {
      continue;
    }
    const missingIndex = sourceIndexById.get(missingId) ?? 0;
    let targetIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [candidateIndex, candidate] of normalized.entries()) {
      const distance = Math.min(...candidate.sourceChunkIds.map((id) =>
        Math.abs((sourceIndexById.get(id) ?? missingIndex) - missingIndex)));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        targetIndex = candidateIndex;
      }
    }
    normalized[targetIndex].sourceChunkIds.push(missingId);
    coveredIds.add(missingId);
  }

  return normalized;
}

function buildSourceChunkIdsJsonSchema(allowedSourceChunkIds: string[], maxItems = 8) {
  const allowedIds = Array.from(new Set(allowedSourceChunkIds.filter(Boolean)));
  if (allowedIds.length === 0) {
    throw new Error("结构化大纲缺少可用的来源片段 ID。");
  }
  return {
    type: "array",
    minItems: 1,
    maxItems: Math.min(Math.max(1, maxItems), allowedIds.length),
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
  const baseNodeJsonProperties = {
    title: { type: "string", minLength: 1, maxLength: 80 },
    summary: { type: "string", minLength: 1, maxLength: 600 },
    sourceChunkIds: buildSourceChunkIdsJsonSchema(allowedSourceChunkIds, allowedSourceChunkIds.length)
  };
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
            minItems: outlineTreeLimits.modules.min,
            maxItems: outlineTreeLimits.modules.max,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "summary", "sourceChunkIds", "groups"],
              properties: {
                ...baseNodeJsonProperties,
                groups: {
                  type: "array",
                  minItems: outlineTreeLimits.groupsPerModule.min,
                  maxItems: outlineTreeLimits.groupsPerModule.max,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "summary", "sourceChunkIds", "points"],
                    properties: {
                      ...baseNodeJsonProperties,
                      points: {
                        type: "array",
                        minItems: outlineTreeLimits.pointsPerGroup.min,
                        maxItems: outlineTreeLimits.pointsPerGroup.max,
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

export function buildNestedCandidateOutlineJsonSchema(allowedCandidateIds: string[]): Record<string, unknown> {
  const candidateIds = Array.from(new Set(allowedCandidateIds.filter(Boolean)));
  if (candidateIds.length === 0) {
    throw new Error("结构化大纲缺少可用的候选 ID。");
  }
  const candidateIdListSchema = {
    type: "array",
    minItems: 1,
    maxItems: Math.min(32, candidateIds.length),
    items: { type: "string", enum: candidateIds }
  };
  const baseCandidateNodeJsonProperties = {
    title: { type: "string", minLength: 1, maxLength: 80 },
    summary: { type: "string", minLength: 1, maxLength: 600 },
    candidateIds: candidateIdListSchema
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["root"],
    properties: {
      root: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "modules"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 80 },
          summary: { type: "string", minLength: 1, maxLength: 600 },
          modules: {
            type: "array",
            minItems: outlineTreeLimits.modules.min,
            maxItems: outlineTreeLimits.modules.max,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "summary", "candidateIds", "groups"],
              properties: {
                ...baseCandidateNodeJsonProperties,
                groups: {
                  type: "array",
                  minItems: outlineTreeLimits.groupsPerModule.min,
                  maxItems: outlineTreeLimits.groupsPerModule.max,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "summary", "candidateIds", "points"],
                    properties: {
                      ...baseCandidateNodeJsonProperties,
                      points: {
                        type: "array",
                        minItems: outlineTreeLimits.pointsPerGroup.min,
                        maxItems: outlineTreeLimits.pointsPerGroup.max,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["title", "summary", "candidateIds"],
                          properties: baseCandidateNodeJsonProperties
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
