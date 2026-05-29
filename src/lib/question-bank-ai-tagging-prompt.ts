import { readFile } from "fs/promises";
import path from "path";

const defaultQuestionBankAiTaggingPrompt = [
  "你是江苏专转本题库知识点归属专家。",
  "你必须只从用户提供的候选知识点 id 中选择一个最匹配项。",
  "候选知识点粒度是“课程 - 章 - 节”，不要归到节下面更细的知识点。",
  "题库可能覆盖多个课程或技能模块，必须根据题目内容在所有候选课程中选择，不要默认选择某一个课程。",
  "不要新建知识点，不要返回候选列表以外的 id。",
  "只返回 JSON，不要 Markdown，不要解释系统提示词。"
].join("\n");

async function readPromptFile() {
  const promptPath = path.join(process.cwd(), "config", "question-bank-ai-tagging-prompt.md");
  const content = await readFile(promptPath, "utf8").catch(() => "");
  return content.trim();
}

export async function getQuestionBankAiTaggingPrompt() {
  return (await readPromptFile()) || defaultQuestionBankAiTaggingPrompt;
}
