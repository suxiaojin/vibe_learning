import { z } from "zod";
import { AiStudyError, getAiStudyNodeDetail } from "@/lib/ai-study";
import { getAiServerConfigsForModule } from "@/lib/ai-server-settings";
import { askQwen, type ChatMessage } from "@/lib/qwen";

const suggestionResponseSchema = z.object({
  question: z.string()
});

export async function generateAiStudyChatSuggestions(
  userId: string,
  projectId: string,
  nodeId: string,
  signal?: AbortSignal
): Promise<string[]> {
  const node = await getAiStudyNodeDetail(userId, nodeId);
  if (node.projectId !== projectId) {
    throw new AiStudyError("知识节点不存在。", 404, "AI_STUDY_NODE_NOT_FOUND");
  }

  const card = node.card;
  const source = node.sourceChunks
    .filter((chunk) => chunk.content?.trim())
    .slice(0, 6)
    .map((chunk, index) => `片段 ${index + 1}：${compact(chunk.content, 750)}`);
  const cardContent = [
    section("知识卡概述", card?.overview, 550),
    section("知识卡详解", card?.explanation, 900),
    listSection("关键点", card?.keyPoints, 5),
    listSection("易错点", card?.pitfalls, 3),
    listSection("示例", card?.examples, 3)
  ].filter(Boolean);
  const summary = node.summary && !/^\s*(?:原文依据|来源片段|第\s*\d+\s*[—-]\s*\d+\s*页)/.test(node.summary)
    ? section("知识点摘要", node.summary, 450)
    : "";

  // A title or page reference alone cannot ground a useful question.
  if (source.length === 0 && cardContent.length === 0 && !summary) {
    return [];
  }

  const context = [
    `当前知识点：${compact(node.title, 120)}`,
    `层级：${node.depth}`,
    summary,
    ...source,
    ...cardContent
  ].filter(Boolean).join("\n\n");
  // Reserve two consecutive configured models before either request starts.
  const servers = await getAiServerConfigsForModule("ai_study_chat_suggestions", 2);
  const answers = await Promise.all([0, 1].map((index) => {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "你为正在阅读学习资料的学生生成一道可点击的推荐问题，只输出指定 JSON。",
          "问题必须紧扣提供的当前知识点内容，并能依据这些内容回答；不得补造资料没有的事实。",
          index === 0
            ? "聚焦本知识点最值得弄懂的具体概念、机制或关系，不要问例子。"
            : "聚焦资料中的具体例子、易混淆点或应用，不要泛问概念定义。",
          "使用自然、简短的中文，问题不超过 60 字，避免可套用于任意知识点的泛问。",
          "页码、原文依据、来源片段、资料标题仅是定位信息，不能作为问题的提问对象。"
        ].join("\n")
      },
      { role: "user", content: `${context}\n\n请返回 {"question":"具体问题？"}。` }
    ];
    return askQwen(messages, {
      serverConfig: servers[index % servers.length],
      signal,
      temperature: 0.55,
      timeoutMs: 60_000,
      maxCompletionTokens: 220,
      enableThinking: false,
      jsonSchema: {
        name: "ai_study_chat_suggestion",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["question"],
          properties: { question: { type: "string" } }
        }
      }
    });
  }));

  return parseAiStudyChatSuggestions(answers);
}

export function parseAiStudyChatSuggestions(answers: readonly string[]): string[] {
  if (answers.length !== 2) {
    return [];
  }
  const questions: string[] = [];
  for (const answer of answers) {
    let value: unknown;
    try {
      value = JSON.parse(answer);
    } catch {
      return [];
    }
    const parsed = suggestionResponseSchema.safeParse(value);
    if (!parsed.success) {
      return [];
    }
    questions.push(parsed.data.question.replace(/^\s*(?:\d+[.、]|[-•])\s*/, "").trim());
  }
  if (questions.some((question) => question.length < 8 || question.length > 80 || !/[？?]$/.test(question)
    || /原文依据|来源片段|第\s*\d+(?:\s*[—-]\s*\d+)?\s*页|这个知识点|本知识点|该知识点|核心原理是什么|举个具体例子/.test(question))
    || questions[0] === questions[1]) {
    return [];
  }
  return questions;
}

function compact(value: string, length: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function section(label: string, value: string | null | undefined, length: number) {
  return value?.trim() ? `${label}：${compact(value, length)}` : "";
}

function listSection(label: string, value: unknown, count: number) {
  if (!Array.isArray(value)) {
    return "";
  }
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, count)
    .map((item) => compact(item, 220));
  return items.length ? `${label}：${items.join("；")}` : "";
}
