import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { EnglishV1Sample } from "@/components/english-v1-workbench";
import { englishImportSections, type EnglishImportSection } from "@/lib/question-bank-types";
import { richTextToPlainText } from "@/lib/rich-text-plain";

export const englishPaperInclude = {
  questions: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { question: true } }
} satisfies Prisma.ExamPaperInclude;

type Paper = Prisma.ExamPaperGetPayload<{ include: typeof englishPaperInclude }>;
const labels = new Map<string, EnglishImportSection>(Object.entries(englishImportSections).map(([key, value]) => [value.label, key as EnglishImportSection]));
const sectionMarker = /^<p><strong>([^<]+)<\/strong><\/p>/;
const groupKeys = ["passages", "clozePassages", "judgmentPassages", "translationSections", "correctionPassages", "writingPassages"] as const;
const sectionKeys = {
  reading: "passages", cloze: "clozePassages", judgment: "judgmentPassages",
  translation_choice: "translationSections", word_selection: "translationSections", translation: "translationSections",
  correction: "correctionPassages", writing: "writingPassages"
} as const;
const translationNumbers = { translation_choice: 1, word_selection: 2, translation: 3 } as const;
const contextual = new Set<EnglishImportSection>(["reading", "cloze", "judgment", "word_selection"]);
const letter = z.enum(["A", "B", "C", "D"]);
const textField = z.string().max(50000);
const updateQuestion = z.object({
  number: z.number().int().positive(),
  prompt: textField.optional(),
  options: z.record(textField).optional(),
  answer: textField.nullable(),
  correction: textField.optional(),
  explanation: textField.optional()
});

export const englishPaperEdit = z.object({
  paperId: z.string().min(1).max(100),
  revision: z.string().length(64),
  group: z.enum(groupKeys),
  number: z.number().int().positive(),
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("stem"), stem: textField }),
    z.object({ kind: z.literal("answers"), questions: z.array(updateQuestion).max(300) })
  ])
});

export class EnglishPaperError extends Error {}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function paragraphs(value: string) {
  return value.split(/\r?\n/).map((line) => {
    const content = escapeHtml(line).replace(/ /g, "&nbsp;").replace(/\uE000/g, "<u>").replace(/\uE001/g, "</u>");
    return "<p>" + (content || "<br>") + "</p>";
  }).join("");
}

export function englishImportStemBody(stem: string) {
  const text = stem.trim();
  const marker = text.match(sectionMarker);
  return marker && labels.has(marker[1]) ? text.slice(marker[0].length).trim() : text;
}

export function encodeEnglishImportStem(section: EnglishImportSection, stem: string) {
  const body = englishImportStemBody(stem);
  const parts = body.match(/<p>[\s\S]*?<\/p>/gi);
  const content = parts?.join("") === body ? body : paragraphs(richTextToPlainText(
    body.replace(/<u\s*>/gi, "\uE000").replace(/<\/u\s*>/gi, "\uE001")
  ));
  return `<p><strong>${englishImportSections[section].label}</strong></p>${content}`;
}

function readParagraphs(html: string) {
  const parts = Array.from(html.matchAll(/<p>([\s\S]*?)<\/p>/gi));
  return parts.map((match) => {
    if (/^\s*(?:<br\s*\/?\s*>)?\s*$/i.test(match[1])) return "";
    let marker = "VIBE_WHITESPACE_MARKER";
    while (match[1].includes(marker)) marker += "_";
    const protectedText = match[1].replace(/<u\s*>/gi, "\uE000").replace(/<\/u\s*>/gi, "\uE001").replace(/ |&nbsp;|&#160;|&#x0*a0;/gi, marker);
    return richTextToPlainText("x" + protectedText + "x").slice(1, -1).replaceAll(marker, " ");
  }).join("\n");
}

function decodeQuestion(entry: Paper["questions"][number]) {
  const { question, sortOrder: number } = entry;
  const marker = question.stem.match(sectionMarker);
  const section = marker && labels.get(marker[1]);
  if (!marker || !section || question.type !== englishImportSections[section].type) {
    throw new EnglishPaperError("第 " + number + " 题缺少可识别的英语题型标记。");
  }
  const content = question.stem.slice(marker[0].length);
  const parts = content.match(/<p>[\s\S]*?<\/p>/gi) || [];
  if (!parts.length || parts.join("") !== content) {
    throw new EnglishPaperError("第 " + number + " 题的题干格式无法还原。");
  }
  const contextHtml = contextual.has(section) ? parts.slice(0, -1).join("") : "";
  const promptHtml = contextual.has(section) ? parts[parts.length - 1] : content;
  const options: Record<string, string> = {};
  if (Array.isArray(question.options)) {
    for (const option of question.options) {
      if (option && typeof option === "object" && !Array.isArray(option) &&
          typeof option.key === "string" && typeof option.text === "string") {
        options[option.key] = richTextToPlainText(option.text);
      }
    }
  }
  const rawAnswer = Array.isArray(question.answer) && typeof question.answer[0] === "string" ? question.answer[0] : "";
  const answer = rawAnswer.startsWith("<p>") ? readParagraphs(rawAnswer) : richTextToPlainText(rawAnswer);
  const correction = answer.match(/^([A-D])\.\s+([\s\S]+)$/);
  const stem = readParagraphs(contextHtml || promptHtml);
  const explanation = question.analysis.startsWith("<p>") ? readParagraphs(question.analysis) : richTextToPlainText(question.analysis);
  return {
    entry, section, number, marker: marker[0], contextHtml, promptHtml, stem,
    prompt: readParagraphs(promptHtml), options, answer, explanation,
    correction: correction?.[2] || "", correctionAnswer: letter.nullable().parse(correction?.[1] ?? null)
  };
}

type Row = ReturnType<typeof decodeQuestion>;
type Group = { section: EnglishImportSection; number: number; stem: string; rows: Row[] };
const translationWithPrompts = (section: EnglishImportSection) => section === "translation_choice" || section === "translation";
const renderPrompts = (rows: Row[]) => rows.map((row) => row.number + ". " + row.prompt).join("\n");

function groupQuestions(paper: Paper) {
  const groups: Group[] = [];
  const seen = new Set<number>();
  for (const entry of paper.questions) {
    const row = decodeQuestion(entry);
    if (row.number < 1 || seen.has(row.number)) throw new EnglishPaperError("英语题库的题号有重复或缺失。");
    seen.add(row.number);
    const last = groups.at(-1);
    const translationNumber = translationNumbers[row.section as keyof typeof translationNumbers];
    if (last?.section === row.section &&
        ((contextual.has(row.section) && last.rows[0].contextHtml === row.contextHtml) || translationWithPrompts(row.section))) {
      last.rows.push(row);
      continue;
    }
    const number = translationNumber ?? (row.section === "correction" ? row.number :
      groups.filter((group) => group.section === row.section).length + 1);
    groups.push({ section: row.section, number, stem: row.stem, rows: [row] });
  }
  const groupIds = new Set<string>();
  for (const group of groups) {
    const id = sectionKeys[group.section] + ":" + group.number;
    if (groupIds.has(id)) throw new EnglishPaperError("英语题库的翻译题分组不完整。");
    groupIds.add(id);
    if (translationWithPrompts(group.section)) group.stem = renderPrompts(group.rows);
  }
  return groups;
}

export function readEnglishPaper(paper: Paper) {
  const groups = groupQuestions(paper);
  const revision = createHash("sha256").update(JSON.stringify([
    paper.id, paper.updatedAt, paper.questions.map((row) => [row.id, row.sortOrder, row.question.updatedAt])
  ])).digest("hex");
  const sample: Required<EnglishV1Sample> = {
    title: paper.title, revision, passages: [], clozePassages: [], judgmentPassages: [],
    translationSections: [], correctionPassages: [], writingPassages: []
  };
  for (const group of groups) {
    const { number, stem, rows, section } = group;
    const options = rows.map((row) => ({ number: row.number, options: row.options, answer: row.answer || null }));
    const choices = options.map((item) => {
      const answer = letter.safeParse(item.answer);
      return { ...item, answer: answer.success ? answer.data : null };
    });
    switch (section) {
      case "reading":
        sample.passages.push({ number, stem, questions: choices.map((item, index) => ({ ...item, prompt: rows[index].prompt })) });
        break;
      case "cloze":
        sample.clozePassages.push({ number, stem, questions: choices });
        break;
      case "judgment":
        sample.judgmentPassages.push({ number, stem, questions: options.map((item, index) => ({
          ...item, prompt: rows[index].prompt, answer: item.answer === "A" || item.answer === "B" ? item.answer : null
        })) });
        break;
      case "correction":
        sample.correctionPassages.push({ number, stem, labelPage: null, sourcePage: null,
          stemIssue: /(?:\[A:.*\])[\s\S]*\[B:[^\]]+\][\s\S]*\[C:[^\]]+\][\s\S]*\[D:[^\]]+\]/.test(stem) ? null : "请核对 A–D 改错标记。",
          questions: rows.map((row) => ({ number: row.number, correction: row.correction, answer: row.correctionAnswer,
            explanation: row.explanation, answerIssue: row.correctionAnswer ? null : "请核对错误位置和改正内容。" }))
        });
        break;
      case "writing":
        sample.writingPassages.push({ number, stem, questions: rows.map((row) => ({ number: row.number, answer: row.answer })) });
        break;
      default:
        sample.translationSections.push({ number, stem, title: englishImportSections[section].label, questions: options });
    }
  }
  return { groups, sample };
}

function splitTranslationStems(stem: string, rows: Row[]) {
  const markers = Array.from(stem.matchAll(/^(\d+)\.[ \t]/gm));
  if (markers.length !== rows.length || markers[0]?.index !== 0 ||
      markers.some((match, index) => Number(match[1]) !== rows[index].number)) {
    throw new EnglishPaperError("请保留原有题号及其顺序，每道翻译题以“题号. ”开头。");
  }
  return markers.map((match, index) => stem.slice(match.index + match[0].length, markers[index + 1]?.index).replace(/\r?\n$/, ""));
}

export function planEnglishPaperEdit(paper: Paper, edit: z.infer<typeof englishPaperEdit>) {
  const { groups, sample } = readEnglishPaper(paper);
  if (sample.revision !== edit.revision) throw new EnglishPaperError("题库内容已有更新，请刷新后再保存。");
  const group = groups.find((item) => sectionKeys[item.section] === edit.group && item.number === edit.number);
  if (!group) throw new EnglishPaperError("找不到该题目分组。");
  const { change } = edit;
  const stems = change.kind === "stem" && translationWithPrompts(group.section)
    ? splitTranslationStems(change.stem, group.rows) : null;
  if (change.kind === "stem" && (!change.stem.trim() || stems?.some((stem) => !stem.trim()))) {
    throw new EnglishPaperError("题干不能为空。");
  }
  if (change.kind === "stem") {
    for (const line of change.stem.split(/\r?\n/)) {
      let underlined = false;
      for (const char of line) {
        if (char === "\uE000") {
          if (underlined) throw new EnglishPaperError("下划线格式无效，请重新选择文字。");
          underlined = true;
        } else if (char === "\uE001") {
          if (!underlined) throw new EnglishPaperError("下划线格式无效，请重新选择文字。");
          underlined = false;
        }
      }
      if (underlined) throw new EnglishPaperError("下划线格式无效，请重新选择文字。");
    }
  }
  if (change.kind === "stem" && contextual.has(group.section)) {
    const position = groups.indexOf(group);
    const neighbors = [groups[position - 1], groups[position + 1]];
    if (neighbors.some((neighbor) => neighbor?.section === group.section && neighbor.stem === change.stem.trim())) {
      throw new EnglishPaperError("该题干与相邻分组相同，请保留各组各自的材料。");
    }
  }
  if (change.kind === "answers" && (change.questions.length !== group.rows.length ||
      change.questions.some((item, index) => item.number !== group.rows[index].number))) {
    throw new EnglishPaperError("提交的题号与题库不一致。");
  }
  return group.rows.flatMap((row, index) => {
    const { question } = row.entry;
    const data: Prisma.QuestionUpdateInput = {};
    if (change.kind === "stem") {
      const stem = stems ? stems[index] : change.stem;
      if (contextual.has(row.section)) {
        if (stem !== group.stem) data.stem = row.marker + paragraphs(stem) + row.promptHtml;
      } else if (stem !== row.prompt) {
        data.stem = row.marker + paragraphs(stem);
      }
    } else {
      const item = change.questions[index];
      if (item.prompt !== undefined && item.prompt !== row.prompt) {
        if ((row.section !== "reading" && row.section !== "judgment") || !item.prompt.trim()) {
          throw new EnglishPaperError("请填写有效的小题题干。");
        }
        data.stem = row.marker + row.contextHtml + paragraphs(item.prompt.trim().replace(/\s*\r?\n\s*/g, " "));
      }
      const letters = englishImportSections[row.section].options;
      if (letters) {
        if (!item.options || Object.keys(item.options).sort().join("") !== letters ||
            Object.values(item.options).some((option) => !option.trim()) ||
            (item.answer !== null && (item.answer.length !== 1 || !letters.includes(item.answer)))) {
          throw new EnglishPaperError("请核对第 " + row.number + " 题的选项和答案。");
        }
        if (Object.entries(item.options).some(([key, value]) => value !== row.options[key])) {
          data.options = Array.from(letters, (key) => ({ key, text: escapeHtml(item.options![key].trim()) }));
        }
        if ((item.answer || "") !== row.answer) data.answer = item.answer ? [item.answer] : [];
      } else if (row.section === "correction") {
        if (!letter.safeParse(item.answer).success || !item.correction?.trim()) {
          throw new EnglishPaperError("请选择改错位置并填写改正内容。");
        }
        if (item.answer !== row.correctionAnswer || item.correction !== row.correction) {
          data.answer = [paragraphs(item.answer + ". " + item.correction.trim())];
        }
        if (item.explanation !== undefined && item.explanation !== row.explanation) data.analysis = paragraphs(item.explanation);
      } else if ((item.answer || "") !== row.answer) {
        data.answer = item.answer?.trim() ? [paragraphs(item.answer)] : [];
      }
    }
    return Object.keys(data).length ? [{ id: question.id, data }] : [];
  });
}
