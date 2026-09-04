export const aiStudyPromptTemplateKeys = [
  "outline.system",
  "outline.user",
  "outline.partial.system",
  "outline.partial.user",
  "outline.merge.system",
  "outline.merge.user",
  "card.system",
  "card.user",
  "card.evidence.system",
  "card.evidence.user",
  "card.instruction.level1",
  "card.instruction.level2_3",
  "card.instruction.level4",
  "chat.system",
  "chat.user"
] as const;

export type AiStudyPromptTemplateKey = (typeof aiStudyPromptTemplateKeys)[number];
export type AiStudyPromptTemplates = Record<AiStudyPromptTemplateKey, string>;
export type AiStudyPromptVariables = Record<string, string | number | boolean | null | undefined>;

type PromptTemplateDefinition = {
  key: AiStudyPromptTemplateKey;
  label: string;
  description: string;
  allowedVariables: readonly string[];
  requiredVariables: readonly string[];
};

export const aiStudyPromptGroups: Array<{
  key: "outline" | "card" | "chat";
  label: string;
  description: string;
  templates: PromptTemplateDefinition[];
}> = [
  {
    key: "outline",
    label: "大纲生成",
    description: "管理短文档直出、长文档分批候选和最终合并三条链路。",
    templates: [
      { key: "outline.system", label: "短文档 · System", description: "直接生成完整大纲时的角色、规则和输出要求。", allowedVariables: ["maxNodesPerProject"], requiredVariables: ["maxNodesPerProject"] },
      { key: "outline.user", label: "短文档 · User", description: "注入项目名称和完整来源片段。", allowedVariables: ["projectTitle", "sourceChunks"], requiredVariables: ["projectTitle", "sourceChunks"] },
      { key: "outline.partial.system", label: "长文档分批 · System", description: "每批提取候选节点时的规则。", allowedVariables: ["partialMaxNodes"], requiredVariables: ["partialMaxNodes"] },
      { key: "outline.partial.user", label: "长文档分批 · User", description: "注入批次编号、项目名称和本批来源。", allowedVariables: ["projectTitle", "batchNumber", "batchCount", "sourceChunks"], requiredVariables: ["projectTitle", "batchNumber", "batchCount", "sourceChunks"] },
      { key: "outline.merge.system", label: "长文档合并 · System", description: "把各批候选合并为最终四层大纲。", allowedVariables: ["maxNodesPerProject"], requiredVariables: ["maxNodesPerProject"] },
      { key: "outline.merge.user", label: "长文档合并 · User", description: "注入项目名称和全部候选节点。", allowedVariables: ["projectTitle", "candidateNodes"], requiredVariables: ["projectTitle", "candidateNodes"] }
    ]
  },
  {
    key: "card",
    label: "知识卡片",
    description: "管理卡片生成、长证据压缩和不同层级的卡片要求。",
    templates: [
      { key: "card.system", label: "卡片生成 · System", description: "知识卡片的角色、来源边界和输出结构。", allowedVariables: [], requiredVariables: [] },
      { key: "card.user", label: "卡片生成 · User", description: "注入项目、节点、层级指令和来源片段。", allowedVariables: ["projectTitle", "level", "nodeTitle", "nodeSummary", "cardInstruction", "sourceChunks"], requiredVariables: ["projectTitle", "level", "nodeTitle", "nodeSummary", "cardInstruction", "sourceChunks"] },
      { key: "card.evidence.system", label: "证据压缩 · System", description: "节点证据过长时，分批压缩原文证据。", allowedVariables: [], requiredVariables: [] },
      { key: "card.evidence.user", label: "证据压缩 · User", description: "注入节点、批次和本批来源片段。", allowedVariables: ["projectTitle", "nodeTitle", "batchNumber", "batchCount", "sourceChunks"], requiredVariables: ["projectTitle", "nodeTitle", "batchNumber", "batchCount", "sourceChunks"] },
      { key: "card.instruction.level1", label: "第1层卡片指令", description: "根节点卡片的专属要求。", allowedVariables: [], requiredVariables: [] },
      { key: "card.instruction.level2_3", label: "第2至3层卡片指令", description: "模块和概念群卡片的专属要求。", allowedVariables: [], requiredVariables: [] },
      { key: "card.instruction.level4", label: "第4层卡片指令", description: "具体知识点卡片和AI详解的专属要求。", allowedVariables: [], requiredVariables: [] }
    ]
  },
  {
    key: "chat",
    label: "问问搭子",
    description: "发布后从下一条新提问开始使用新版，不改动历史消息。",
    templates: [
      { key: "chat.system", label: "问问搭子 · System", description: "对话助手的角色、回答风格和来源边界。", allowedVariables: [], requiredVariables: [] },
      { key: "chat.user", label: "问问搭子 · User", description: "注入项目、节点、卡片、原文和学生问题组成的上下文。", allowedVariables: ["context"], requiredVariables: ["context"] }
    ]
  }
];

const variablePattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
const definitions = new Map(aiStudyPromptGroups.flatMap((group) => group.templates).map((item) => [item.key, item]));

export function normalizeAiStudyPromptTemplates(value: unknown): AiStudyPromptTemplates {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(aiStudyPromptTemplateKeys.map((key) => [key, typeof source[key] === "string" ? source[key].trim() : ""])) as AiStudyPromptTemplates;
}

export function validateAiStudyPromptTemplates(value: unknown) {
  const templates = normalizeAiStudyPromptTemplates(value);
  let totalLength = 0;

  for (const key of aiStudyPromptTemplateKeys) {
    const template = templates[key];
    const definition = definitions.get(key)!;
    if (!template) {
      return `${definition.label}不能为空。`;
    }
    if (template.length > 30_000) {
      return `${definition.label}不能超过30000字。`;
    }
    totalLength += template.length;

    const variables = Array.from(template.matchAll(variablePattern), (match) => match[1]);
    const allowed = new Set(definition.allowedVariables);
    const unknown = Array.from(new Set(variables.filter((variable) => !allowed.has(variable))));
    if (unknown.length > 0) {
      return `${definition.label}包含未知变量：${unknown.join("、")}。`;
    }
    const missing = definition.requiredVariables.filter((variable) => !variables.includes(variable));
    if (missing.length > 0) {
      return `${definition.label}缺少必要变量：${missing.join("、")}。`;
    }
  }

  if (totalLength > 180_000) {
    return "整套学习搭子Prompt不能超过180000字。";
  }
  return null;
}

export function renderAiStudyPromptTemplate(template: string, variables: AiStudyPromptVariables) {
  return template.replace(variablePattern, (_, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
