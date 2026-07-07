import { readFile } from "fs/promises";
import path from "path";

const aiStudyPromptConfigPath = path.join(process.cwd(), "config", "ai-study-prompts.md");

const aiStudyPromptTemplateKeys = [
  "outline.system",
  "outline.user",
  "card.system",
  "card.user",
  "card.instruction.level1",
  "card.instruction.level2_3",
  "card.instruction.level4",
  "chat.system",
  "chat.user"
] as const;

const requiredAiStudyPromptKeys = ["prompt.version", ...aiStudyPromptTemplateKeys] as const;

export type AiStudyPromptTemplateKey = (typeof aiStudyPromptTemplateKeys)[number];

type AiStudyPromptVariables = Record<string, string | number | boolean | null | undefined>;

export type AiStudyPromptConfig = {
  version: string;
  render: (key: AiStudyPromptTemplateKey, variables?: AiStudyPromptVariables) => string;
};

export async function getAiStudyPromptConfig(): Promise<AiStudyPromptConfig> {
  const content = await readFile(aiStudyPromptConfigPath, "utf8").catch(() => "");
  if (!content.trim()) {
    throw new Error(`AI 学习搭子提示词配置文件不存在或为空：${aiStudyPromptConfigPath}`);
  }

  const sections = parseAiStudyPromptSections(content);
  const missingKeys = requiredAiStudyPromptKeys.filter((key) => !sections.get(key)?.trim());
  if (missingKeys.length > 0) {
    throw new Error(`AI 学习搭子提示词配置缺少 section：${missingKeys.join(", ")}`);
  }

  return {
    version: sections.get("prompt.version")!.trim(),
    render(key, variables = {}) {
      return renderAiStudyPromptTemplate(sections.get(key)!.trim(), variables);
    }
  };
}

function parseAiStudyPromptSections(content: string) {
  const sections = new Map<string, string>();
  const sectionPattern =
    /<!--\s*ai-study-prompt:([a-zA-Z0-9_.-]+)\s*-->\r?\n?([\s\S]*?)\r?\n?<!--\s*\/ai-study-prompt\s*-->/g;

  for (const match of content.matchAll(sectionPattern)) {
    sections.set(match[1].trim(), match[2].trim());
  }

  return sections;
}

function renderAiStudyPromptTemplate(template: string, variables: AiStudyPromptVariables) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
