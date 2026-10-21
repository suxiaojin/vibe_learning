export const aiStudyPromptTemplateKeys = [
  "chat.system",
  "chat.user"
] as const;

export type AiStudyEditablePromptTemplateKey = (typeof aiStudyPromptTemplateKeys)[number];
export type AiStudyPromptTemplateKey = AiStudyEditablePromptTemplateKey;
export type AiStudyPromptTemplates = Record<AiStudyEditablePromptTemplateKey, string>;
export type AiStudyPromptVariables = Record<string, string | number | boolean | null | undefined>;

type PromptTemplateDefinition = {
  key: AiStudyEditablePromptTemplateKey;
  label: string;
  description: string;
  allowedVariables: readonly string[];
  requiredVariables: readonly string[];
};

export const aiStudyPromptGroups: Array<{
  key: "chat";
  label: string;
  description: string;
  templates: PromptTemplateDefinition[];
}> = [
  {
    key: "chat",
    label: "问问搭子",
    description: "当前只有问问搭子的对话 Prompt 由后台版本控制；发布后从下一条提问开始使用新版。",
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

  if (totalLength > 60_000) {
    return "整套问问搭子Prompt不能超过60000字。";
  }
  return null;
}

export function renderAiStudyPromptTemplate(template: string, variables: AiStudyPromptVariables) {
  return template.replace(variablePattern, (_, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
