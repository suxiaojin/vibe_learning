"use client";

import Link from "next/link";
import type { PointerEventHandler, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckSquare,
  CircleDot,
  CopyPlus,
  Eye,
  FileText,
  Image,
  ListChecks,
  Search,
  Sigma,
  Trash2,
  X,
  type LucideIcon
} from "lucide-react";
import {
  createQuestionBankTypedQuestion,
  deleteQuestionBankPaperQuestion,
  reorderQuestionBankPaperQuestions,
  updateQuestionBankQuestion
} from "@/app/admin/actions";
import {
  getQuestionBankTypeLabel,
  isQuestionBankChoiceQuestionType,
  isQuestionBankEditableQuestionType,
  isQuestionBankRichAnswerQuestionType,
  type QuestionBankChoiceQuestionType,
  type QuestionBankEditableQuestionType,
  type QuestionBankQuestionTypeConfig,
  type QuestionBankRichAnswerQuestionType
} from "@/lib/question-bank-types";
import { cn } from "@/lib/utils";

type QuestionOption = {
  key: string;
  text: string;
};

type ChoiceOptionDraft = {
  key: string;
  text: string;
};

type QuestionRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  difficulty: string;
  options: QuestionOption[];
  answer: string[];
  analysis: string;
  knowledgePointTitle: string;
  chapterTitle: string;
};

export type KnowledgeTreeSection = {
  id: string;
  title: string;
};

export type KnowledgeTreeChapter = {
  id: string;
  title: string;
  sections: KnowledgeTreeSection[];
};

export type KnowledgeTreeCourse = {
  id: string;
  title: string;
  chapters: KnowledgeTreeChapter[];
};

type QuestionBankDetailWorkbenchProps = {
  paperId: string;
  paperTitle: string;
  ownerHref: string;
  questionTypes: QuestionBankQuestionTypeConfig[];
  knowledgeTree: KnowledgeTreeCourse[];
  questions: QuestionRow[];
};

type ActiveEditorType = QuestionBankEditableQuestionType | null;
type EditableQuestionType = QuestionBankEditableQuestionType;
type ChoiceQuestionType = QuestionBankChoiceQuestionType;
type RichAnswerQuestionType = QuestionBankRichAnswerQuestionType;

type ToolItem = {
  label: string;
  icon: LucideIcon;
  tone: "normal" | "danger";
  onClick?: () => void;
  form?: string;
  disabled?: boolean;
  questionType?: EditableQuestionType;
};

type QuestionTypeMeta = {
  label: string;
  row: string;
  selectedRow: string;
  chip: string;
  activeChip: string;
};

const optionKeys = ["A", "B", "C", "D"] as const;
const alphabetOptionKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const layoutStorageKey = "question-bank-detail-column-layout";
const defaultColumnLayout = {
  editor: 820,
  list: 385,
  attributes: 570
};
const minColumnLayout = {
  editor: 520,
  list: 280,
  attributes: 380
};

const questionTypeStyles: Record<string, QuestionTypeMeta> = {
  single_choice: {
    label: "单选题",
    row: "border-[#9bd7ad] bg-[#e3f7e9] text-[#14532d]",
    selectedRow: "border-[#22c55e] bg-[#c9f6d5] text-[#052e16] ring-2 ring-[#22c55e]/30",
    chip: "border-[#86efac] bg-[#dcfce7] text-[#166534]",
    activeChip: "border-[#22c55e] bg-[#22c55e] text-white shadow-sm shadow-[#22c55e]/30"
  },
  multiple_choice: {
    label: "多选题",
    row: "border-[#93c5fd] bg-[#dbeafe] text-[#1d4ed8]",
    selectedRow: "border-[#3b82f6] bg-[#bfdbfe] text-[#1e3a8a] ring-2 ring-[#3b82f6]/30",
    chip: "border-[#93c5fd] bg-[#dbeafe] text-[#1d4ed8]",
    activeChip: "border-[#3b82f6] bg-[#3b82f6] text-white shadow-sm shadow-[#3b82f6]/30"
  },
  true_false: {
    label: "判断题",
    row: "border-[#f6c35d] bg-[#fff3cf] text-[#92400e]",
    selectedRow: "border-[#f59e0b] bg-[#fde68a] text-[#78350f] ring-2 ring-[#f59e0b]/30",
    chip: "border-[#f6c35d] bg-[#fff3cf] text-[#92400e]",
    activeChip: "border-[#f59e0b] bg-[#f59e0b] text-white shadow-sm shadow-[#f59e0b]/30"
  },
  fill_blank: {
    label: "填空题",
    row: "border-[#67e8f9] bg-[#cffafe] text-[#0e7490]",
    selectedRow: "border-[#06b6d4] bg-[#a5f3fc] text-[#164e63] ring-2 ring-[#06b6d4]/30",
    chip: "border-[#67e8f9] bg-[#cffafe] text-[#0e7490]",
    activeChip: "border-[#06b6d4] bg-[#06b6d4] text-white shadow-sm shadow-[#06b6d4]/30"
  },
  calculation: {
    label: "计算题",
    row: "border-[#c4b5fd] bg-[#ede9fe] text-[#5b21b6]",
    selectedRow: "border-[#8b5cf6] bg-[#ddd6fe] text-[#4c1d95] ring-2 ring-[#8b5cf6]/30",
    chip: "border-[#c4b5fd] bg-[#ede9fe] text-[#5b21b6]",
    activeChip: "border-[#8b5cf6] bg-[#8b5cf6] text-white shadow-sm shadow-[#8b5cf6]/30"
  },
  proof: {
    label: "证明题",
    row: "border-[#f9a8d4] bg-[#fce7f3] text-[#9d174d]",
    selectedRow: "border-[#ec4899] bg-[#fbcfe8] text-[#831843] ring-2 ring-[#ec4899]/30",
    chip: "border-[#f9a8d4] bg-[#fce7f3] text-[#9d174d]",
    activeChip: "border-[#ec4899] bg-[#ec4899] text-white shadow-sm shadow-[#ec4899]/30"
  },
  comprehensive: {
    label: "综合题",
    row: "border-[#fda4af] bg-[#ffe4e6] text-[#be123c]",
    selectedRow: "border-[#f43f5e] bg-[#fecdd3] text-[#881337] ring-2 ring-[#f43f5e]/30",
    chip: "border-[#fda4af] bg-[#ffe4e6] text-[#be123c]",
    activeChip: "border-[#f43f5e] bg-[#f43f5e] text-white shadow-sm shadow-[#f43f5e]/30"
  }
};

const questionTypeStyleAliases: Record<string, string> = {
  term_explanation: "proof",
  calculation_analysis: "calculation",
  practical_writing: "comprehensive",
  short_answer: "fill_blank",
  essay: "comprehensive",
  comprehensive_analysis: "comprehensive",
  material_analysis: "proof",
  operation_record: "fill_blank",
  practical_operation: "calculation",
  application: "calculation",
  question_answer: "fill_blank",
  handwriting: "fill_blank",
  reading_comprehension: "comprehensive",
  classical_chinese_translation: "proof",
  writing: "comprehensive",
  legal_document: "proof",
  chinese_character_writing: "fill_blank",
  language_expression: "comprehensive",
  teaching_design: "calculation",
  comprehensive_essay: "comprehensive"
};

const defaultQuestionTypeStyle: QuestionTypeMeta = {
  label: "题目",
  row: "border-[#d5e9f4] bg-[#d8edf7] text-[#071b38]",
  selectedRow: "border-[#9bb5cc] bg-[#dbe7f1] text-[#071b38] ring-2 ring-[#9bb5cc]/30",
  chip: "border-[#d7dee8] bg-[#eef2f7] text-[#344054]",
  activeChip: "border-[#667085] bg-[#667085] text-white"
};

function questionTypeIcon(type: string): LucideIcon {
  if (type === "single_choice") {
    return CircleDot;
  }
  if (type === "multiple_choice") {
    return CheckSquare;
  }
  if (type === "calculation" || type === "calculation_analysis" || type === "application" || type === "practical_operation" || type === "teaching_design") {
    return Sigma;
  }
  if (type === "true_false" || type === "comprehensive" || type === "comprehensive_analysis" || type === "comprehensive_essay") {
    return ListChecks;
  }
  return FileText;
}

function getQuestionTypeMeta(type?: string, questionTypes: QuestionBankQuestionTypeConfig[] = []) {
  if (!type) {
    return defaultQuestionTypeStyle;
  }
  const style = questionTypeStyles[type] || questionTypeStyles[questionTypeStyleAliases[type]] || defaultQuestionTypeStyle;
  return {
    ...style,
    label: getQuestionBankTypeLabel(type, questionTypes)
  };
}

function questionTypeText(type?: string, questionTypes: QuestionBankQuestionTypeConfig[] = []) {
  return type ? getQuestionTypeMeta(type, questionTypes).label : "";
}

function difficultyText(difficulty?: string) {
  if (difficulty === "easy") {
    return "1星";
  }
  if (difficulty === "hard") {
    return "5星";
  }
  return difficulty ? "3星" : "";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readColumnLayout() {
  if (typeof window === "undefined") {
    return defaultColumnLayout;
  }

  try {
    const saved = window.localStorage.getItem(layoutStorageKey);
    if (!saved) {
      return defaultColumnLayout;
    }
    const parsed = JSON.parse(saved) as Partial<typeof defaultColumnLayout>;
    return {
      editor: Math.max(Number(parsed.editor) || defaultColumnLayout.editor, minColumnLayout.editor),
      list: Math.max(Number(parsed.list) || defaultColumnLayout.list, minColumnLayout.list),
      attributes: Math.max(Number(parsed.attributes) || defaultColumnLayout.attributes, minColumnLayout.attributes)
    };
  } catch {
    return defaultColumnLayout;
  }
}

function saveColumnLayout(layout: typeof defaultColumnLayout) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toRichTextHtml(value: string) {
  if (!value) {
    return "";
  }
  if (/<\/?[a-z][\s\S]*>/i.test(value)) {
    return value;
  }
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function questionSearchText(question: QuestionRow) {
  return [
    stripHtml(question.title),
    stripHtml(question.analysis),
    question.options.map((option) => `${option.key} ${option.text}`).join(" ")
  ].join(" ").toLowerCase();
}

function initialChoiceOptions(question?: QuestionRow): ChoiceOptionDraft[] {
  if (!question?.options.length) {
    return optionKeys.map((key) => ({ key, text: "" }));
  }

  const options = question.options
    .map((option) => ({
      key: option.key.toUpperCase(),
      text: option.text
    }))
    .filter((option, index, array) => alphabetOptionKeys.includes(option.key) && array.findIndex((item) => item.key === option.key) === index)
    .sort((left, right) => alphabetOptionKeys.indexOf(left.key) - alphabetOptionKeys.indexOf(right.key));

  return options.length > 0 ? options : optionKeys.map((key) => ({ key, text: "" }));
}

function nextOptionKey(keys: string[]) {
  return alphabetOptionKeys.find((key) => !keys.includes(key));
}

function ToolbarButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button className="inline-flex h-7 items-center gap-1.5 px-3 text-xs font-medium text-[#1f2b3d] hover:bg-white" type="button">
      <Icon size={13} />
      {label}
    </button>
  );
}

function EditorShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex h-10 items-center justify-between border-b border-[#d4dae4] bg-[#eef3f9] px-3">
        <h2 className="text-sm font-black text-[#111827]">{title}</h2>
      </div>
      <div className="border-b border-[#d4dae4] bg-white">
        <div className="flex h-8 items-center justify-between">
          <div className="flex items-center">
            <ToolbarButton icon={CopyPlus} label="截图" />
            <ToolbarButton icon={Eye} label="识别" />
            <ToolbarButton icon={Image} label="插入图表" />
            <ToolbarButton icon={Sigma} label="插入公式" />
          </div>
          <button className="grid h-8 w-9 place-items-center bg-[#ef3e46] text-white" type="button" aria-label="删除内容">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

function AttributeChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span className={cn("inline-flex h-8 min-w-14 items-center justify-center rounded bg-[#eef2f7] px-3 text-sm font-medium text-[#344054]", active && "bg-[#1da1f2] text-white")}>
      {label}
    </span>
  );
}

function KnowledgeTreeView({ courses }: { courses: KnowledgeTreeCourse[] }) {
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(() => new Set());
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(() => new Set());

  function toggleCourse(courseId: string) {
    setExpandedCourseIds((current) => {
      const next = new Set(current);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }

  function toggleChapter(chapterId: string) {
    setExpandedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }

  if (courses.length === 0) {
    return <div className="grid h-full min-h-[260px] place-items-center rounded border border-[#d7dee8] bg-[#fbfcfe] text-sm text-slate-400">暂无知识点</div>;
  }

  return (
    <div className="h-full min-h-[260px] overflow-auto rounded border border-[#d7dee8] bg-[#fbfcfe] p-4">
      <div className="space-y-4">
        {courses.map((course) => {
          const courseExpanded = expandedCourseIds.has(course.id);
          return (
          <div key={course.id}>
            <button
              className="flex min-h-8 w-full items-center gap-2 text-left text-sm font-black text-[#071b38] hover:text-[#1d4ed8]"
              type="button"
              aria-expanded={courseExpanded}
              onClick={() => toggleCourse(course.id)}
            >
              <span className="grid size-4 shrink-0 place-items-center rounded border border-[#9aa9bc] bg-white text-xs leading-none text-[#071b38]">{courseExpanded ? "-" : "+"}</span>
              <span className="size-5 shrink-0 rounded border border-[#7aa2ff] bg-white" />
              <span className="min-w-0 truncate" title={course.title}>{course.title}</span>
            </button>

            {courseExpanded && course.chapters.length > 0 ? (
              <div className="ml-[26px] mt-1 space-y-1 border-l border-[#d6dbe4] pl-5">
                {course.chapters.map((chapter) => {
                  const chapterExpanded = expandedChapterIds.has(chapter.id);
                  return (
                  <div key={chapter.id} className="relative">
                    <span className="absolute -left-5 top-4 h-px w-3 bg-[#d6dbe4]" />
                    <button
                      className="flex min-h-8 w-full items-center gap-2 text-left text-sm font-semibold text-[#071b38] hover:text-[#1d4ed8]"
                      type="button"
                      aria-expanded={chapterExpanded}
                      onClick={() => toggleChapter(chapter.id)}
                    >
                      <span className="grid size-4 shrink-0 place-items-center rounded border border-[#d4dbe6] bg-white text-xs leading-none text-[#071b38]">{chapterExpanded ? "-" : "+"}</span>
                      <span className="size-5 shrink-0 rounded border border-[#d4dbe6] bg-white" />
                      <span className="min-w-0 truncate" title={chapter.title}>{chapter.title}</span>
                    </button>

                    {chapterExpanded && chapter.sections.length > 0 ? (
                      <div className="ml-[10px] space-y-1 border-l border-[#e0e5ec] pl-5">
                        {chapter.sections.map((section) => (
                          <div key={section.id} className="relative flex min-h-8 items-center gap-2 text-sm text-[#071b38]">
                            <span className="absolute -left-5 top-4 h-px w-3 bg-[#e0e5ec]" />
                            <span className="size-5 shrink-0 rounded border border-[#d4dbe6] bg-white" />
                            <span className="min-w-0 truncate" title={section.title}>{section.title}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function RichTextEditor({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  const initialHtml = toRichTextHtml(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const syncValue = () => {
    if (inputRef.current) {
      inputRef.current.value = editorRef.current?.innerHTML || "";
    }
  };
  const applyCommand = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    syncValue();
  };
  const insertTable = () => {
    editorRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>'
    );
    syncValue();
  };

  return (
    <div className="bg-[#d9e5fb]">
      <input ref={inputRef} type="hidden" name={name} defaultValue={initialHtml} />
      <div className="flex h-8 items-center gap-1 border-b border-[#c6d3e6] bg-white px-2">
        {[
          { label: "B", command: "bold" },
          { label: "I", command: "italic" },
          { label: "U", command: "underline" },
          { label: "•", command: "insertUnorderedList" },
          { label: "1.", command: "insertOrderedList" }
        ].map((item) => (
          <button
            key={item.command}
            className="grid h-6 min-w-7 place-items-center rounded border border-[#d4dae4] bg-[#f8fafc] px-2 text-xs font-black text-[#1f2b3d] hover:border-[#94a3b8]"
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              applyCommand(item.command);
            }}
          >
            {item.label}
          </button>
        ))}
        <button
          className="grid h-6 min-w-10 place-items-center rounded border border-[#d4dae4] bg-[#f8fafc] px-2 text-xs font-black text-[#1f2b3d] hover:border-[#94a3b8]"
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            insertTable();
          }}
        >
          表格
        </button>
      </div>
      <div
        ref={editorRef}
        className="min-h-[240px] w-full bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38] outline-none focus:ring-2 focus:ring-inset focus:ring-[#3b82f6]/40 [&_td]:min-w-24 [&_td]:border [&_td]:border-[#8ea3c2] [&_td]:bg-white/35 [&_td]:px-2 [&_td]:py-1 [&_table]:my-2 [&_table]:border-collapse"
        contentEditable
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        role="textbox"
        tabIndex={0}
        onInput={(event) => {
          if (inputRef.current) {
            inputRef.current.value = event.currentTarget.innerHTML;
          }
        }}
        suppressContentEditableWarning
      />
    </div>
  );
}

function RichTextDisplay({ value }: { value: string }) {
  return <div className="min-h-[150px] bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38] [&_td]:min-w-24 [&_td]:border [&_td]:border-[#8ea3c2] [&_td]:bg-white/35 [&_td]:px-2 [&_td]:py-1 [&_table]:my-2 [&_table]:border-collapse" dangerouslySetInnerHTML={{ __html: toRichTextHtml(value) }} />;
}

function QuestionTypeChip({
  type,
  active,
  count,
  onClick,
  questionTypes
}: {
  type: string;
  active: boolean;
  count: number;
  onClick: () => void;
  questionTypes: QuestionBankQuestionTypeConfig[];
}) {
  const meta = getQuestionTypeMeta(type, questionTypes);

  return (
    <button
      className={cn(
        "inline-flex h-8 min-w-16 items-center justify-center rounded border px-3 text-sm font-semibold transition",
        meta.chip,
        active ? meta.activeChip : "opacity-70 hover:opacity-100",
        count === 0 && "cursor-not-allowed opacity-35 hover:opacity-35"
      )}
      type="button"
      disabled={count === 0}
      onClick={onClick}
      title={count > 0 ? `跳转到${meta.label}` : `暂无${meta.label}`}
    >
      {meta.label}
    </button>
  );
}

function ResizeHandle({ onPointerDown }: { onPointerDown: PointerEventHandler<HTMLDivElement> }) {
  return (
    <div className="group grid cursor-col-resize place-items-center bg-[#d7dee8] transition hover:bg-[#93a8c5]" onPointerDown={onPointerDown}>
      <span className="h-12 w-0.5 rounded-full bg-[#aeb9c8] transition group-hover:bg-[#3b82f6]" />
    </div>
  );
}

function EmptyQuestionCanvas() {
  return (
    <>
      <EditorShell title="题干">
        <div className="min-h-[160px] bg-[#d9e5fb]" />
      </EditorShell>
      <EditorShell title="解答详情">
        <div className="min-h-[160px] bg-[#d9e5fb]" />
      </EditorShell>
    </>
  );
}

function isChoiceQuestionType(type?: string): type is ChoiceQuestionType {
  return isQuestionBankChoiceQuestionType(type);
}

function isEditableQuestionType(type?: string): type is EditableQuestionType {
  return isQuestionBankEditableQuestionType(type);
}

function isRichAnswerQuestionType(type?: string): type is RichAnswerQuestionType {
  return isQuestionBankRichAnswerQuestionType(type);
}

function createQuestionFormId(type: EditableQuestionType) {
  return `create-${type}-question-form`;
}

function editQuestionFormId(questionId: string) {
  return `edit-question-form-${questionId}`;
}

function ChoiceQuestionForm({
  paperId,
  question,
  type
}: {
  paperId: string;
  question?: QuestionRow;
  type: ChoiceQuestionType;
}) {
  const editing = Boolean(question);
  const formId = editing && question ? editQuestionFormId(question.id) : createQuestionFormId(type);
  const action = editing ? updateQuestionBankQuestion : createQuestionBankTypedQuestion;
  const inputType = type === "single_choice" ? "radio" : "checkbox";
  const focusColor = type === "single_choice" ? "focus:border-[#22c55e]" : "focus:border-[#3b82f6]";
  const accentColor = type === "single_choice" ? "accent-[#22c55e]" : "accent-[#3b82f6]";
  const [choiceOptions, setChoiceOptions] = useState(() => initialChoiceOptions(question));
  const addOption = () => {
    const nextKey = nextOptionKey(choiceOptions.map((option) => option.key));
    if (nextKey) {
      setChoiceOptions([...choiceOptions, { key: nextKey, text: "" }]);
    }
  };
  const updateOptionKey = (index: number, value: string) => {
    const key = value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1);
    setChoiceOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? { ...option, key } : option)));
  };
  const updateOptionText = (index: number, text: string) => {
    setChoiceOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? { ...option, text } : option)));
  };

  return (
    <form id={formId} action={action} key={question?.id || type}>
      <input type="hidden" name="paperId" value={paperId} />
      <input type="hidden" name="questionType" value={type} />
      {question ? <input type="hidden" name="paperQuestionId" value={question.id} /> : null}
      <EditorShell title="题干">
        <textarea
          className="min-h-[150px] w-full resize-none bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38] outline-none"
          name="stem"
          defaultValue={question?.title || ""}
          required
        />
      </EditorShell>
      <section>
        <div className="flex h-10 items-center justify-between border-b border-[#d4dae4] bg-[#eef3f9] px-3">
          <h2 className="text-sm font-black text-[#111827]">选择题选项</h2>
          <button className="text-xs font-bold text-[#1d4ed8] hover:text-[#0f3aa8]" type="button" onClick={addOption}>
            增加选项
          </button>
        </div>
        <div className="grid gap-3 bg-[#eef3f8] p-4">
          {choiceOptions.map((option, index) => {
            const checked = question?.answer.includes(option.key) || false;
            return (
              <label key={index} className="grid min-h-[64px] grid-cols-[48px_1fr_52px] items-center gap-2">
                <input
                  className={cn("h-10 border border-[#c6d3e6] bg-white text-center text-sm font-black uppercase outline-none", focusColor)}
                  name="optionKey"
                  value={option.key}
                  maxLength={1}
                  pattern="[A-Za-z]"
                  required
                  aria-label="选项字母"
                  onChange={(event) => updateOptionKey(index, event.target.value)}
                />
                <input
                  className={cn("h-12 border border-[#c6d3e6] bg-[#d9e5fb] px-3 text-sm outline-none", focusColor)}
                  name="optionText"
                  value={option.text}
                  required
                  onChange={(event) => updateOptionText(index, event.target.value)}
                />
                <span className="grid place-items-center">
                  <input
                    className={cn("size-4", accentColor)}
                    name="answer"
                    type={inputType}
                    value={option.key}
                    defaultChecked={checked}
                    required={type === "single_choice"}
                    aria-label={`${option.key || "该"}选项为正确答案`}
                  />
                </span>
              </label>
            );
          })}
        </div>
      </section>
      <EditorShell title="解答详情">
        <RichTextEditor name="analysis" defaultValue={question?.analysis || ""} />
      </EditorShell>
    </form>
  );
}

function TrueFalseQuestionForm({ paperId, question }: { paperId: string; question?: QuestionRow }) {
  const editing = Boolean(question);
  const formId = editing && question ? editQuestionFormId(question.id) : createQuestionFormId("true_false");
  const answer = question?.answer[0] || "";

  return (
    <form id={formId} action={editing ? updateQuestionBankQuestion : createQuestionBankTypedQuestion} key={question?.id || "true_false"}>
      <input type="hidden" name="paperId" value={paperId} />
      <input type="hidden" name="questionType" value="true_false" />
      {question ? <input type="hidden" name="paperQuestionId" value={question.id} /> : null}
      <EditorShell title="题干">
        <textarea
          className="min-h-[150px] w-full resize-none bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38] outline-none"
          name="stem"
          defaultValue={question?.title || ""}
          required
        />
      </EditorShell>
      <section>
        <div className="flex h-10 items-center justify-between border-b border-[#d4dae4] bg-[#eef3f9] px-3">
          <h2 className="text-sm font-black text-[#111827]">判断选项</h2>
          <span className="text-xs font-medium text-[#60718a]">选择正确答案</span>
        </div>
        <div className="grid gap-3 bg-[#eef3f8] p-4">
          {[
            { key: "A", text: "正确" },
            { key: "B", text: "错误" }
          ].map((option) => (
            <label key={option.key} className="grid min-h-[64px] grid-cols-[40px_1fr_52px] items-center gap-2">
              <input type="hidden" name="optionKey" value={option.key} />
              <input type="hidden" name={`option${option.key}`} value={option.text} />
              <span className="text-center text-sm font-black">({option.key})</span>
              <div className="flex h-12 items-center border border-[#c6d3e6] bg-[#d9e5fb] px-3 text-sm">{option.text}</div>
              <span className="grid place-items-center">
                <input
                  className="size-4 accent-[#f59e0b]"
                  name="answer"
                  type="radio"
                  value={option.key}
                  defaultChecked={answer === option.key}
                  required
                  aria-label={`${option.text}为正确答案`}
                />
              </span>
            </label>
          ))}
        </div>
      </section>
      <EditorShell title="解答详情">
        <RichTextEditor name="analysis" defaultValue={question?.analysis || ""} />
      </EditorShell>
    </form>
  );
}

function FillBlankQuestionForm({ paperId, question }: { paperId: string; question?: QuestionRow }) {
  const editing = Boolean(question);
  const formId = editing && question ? editQuestionFormId(question.id) : createQuestionFormId("fill_blank");

  return (
    <form id={formId} action={editing ? updateQuestionBankQuestion : createQuestionBankTypedQuestion} key={question?.id || "fill_blank"}>
      <input type="hidden" name="paperId" value={paperId} />
      <input type="hidden" name="questionType" value="fill_blank" />
      {question ? <input type="hidden" name="paperQuestionId" value={question.id} /> : null}
      <EditorShell title="题干">
        <textarea
          className="min-h-[150px] w-full resize-none bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38] outline-none"
          name="stem"
          defaultValue={question?.title || ""}
          required
        />
      </EditorShell>
      <section>
        <div className="flex h-10 items-center border-b border-[#d4dae4] bg-[#eef3f9] px-3">
          <h2 className="text-sm font-black text-[#111827]">答案</h2>
        </div>
        <div className="bg-[#eef3f8] p-4">
          <textarea
            className="min-h-[96px] w-full resize-y border border-[#c6d3e6] bg-[#d9e5fb] px-3 py-3 text-sm leading-7 text-[#071b38] outline-none focus:border-[#06b6d4]"
            name="answer"
            defaultValue={question?.answer.join("\n") || ""}
            required
          />
        </div>
      </section>
      <EditorShell title="解答详情">
        <RichTextEditor name="analysis" defaultValue={question?.analysis || ""} />
      </EditorShell>
    </form>
  );
}

function RichAnswerQuestionForm({ paperId, question, type }: { paperId: string; question?: QuestionRow; type: RichAnswerQuestionType }) {
  const editing = Boolean(question);
  const formId = editing && question ? editQuestionFormId(question.id) : createQuestionFormId(type);
  const action = editing ? updateQuestionBankQuestion : createQuestionBankTypedQuestion;

  return (
    <form id={formId} action={action} key={question?.id || type}>
      <input type="hidden" name="paperId" value={paperId} />
      <input type="hidden" name="questionType" value={type} />
      {question ? <input type="hidden" name="paperQuestionId" value={question.id} /> : null}
      <EditorShell title="题干">
        <RichTextEditor name="stem" defaultValue={question?.title || ""} />
      </EditorShell>
      <EditorShell title="答案">
        <RichTextEditor name="answer" defaultValue={question?.answer[0] || ""} />
      </EditorShell>
      <EditorShell title="解答详情">
        <RichTextEditor name="analysis" defaultValue={question?.analysis || ""} />
      </EditorShell>
    </form>
  );
}

function ReadonlyQuestionPreview({ question }: { question: QuestionRow }) {
  return (
    <>
      <EditorShell title="题干">
        <RichTextDisplay value={question.title} />
      </EditorShell>
      {question.options.length > 0 ? (
        <section>
          <div className="flex h-10 items-center border-b border-[#d4dae4] bg-[#eef3f9] px-3">
            <h2 className="text-sm font-black text-[#111827]">选择题选项</h2>
          </div>
          <div className="grid gap-3 bg-[#eef3f8] p-4">
            {question.options.map((option) => {
              const checked = question.answer.includes(option.key);
              return (
                <div key={option.key} className="grid min-h-[64px] grid-cols-[40px_1fr_52px] items-center gap-2">
                  <span className="text-center text-sm font-black">({option.key})</span>
                  <div className={cn("flex h-12 items-center bg-[#d9e5fb] px-3 text-sm", checked && "font-bold text-[#166534]")}>{option.text}</div>
                  <span className="grid place-items-center">
                    <span className={cn("grid size-5 place-items-center rounded-full border text-xs", checked ? "border-[#22c55e] bg-[#22c55e] text-white" : "border-[#c8d2df] bg-white text-transparent")}>
                      ✓
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      <EditorShell title="解答详情">
        <RichTextDisplay value={question.analysis} />
      </EditorShell>
    </>
  );
}

export function QuestionBankDetailWorkbench({ paperId, paperTitle, ownerHref, questionTypes, knowledgeTree, questions }: QuestionBankDetailWorkbenchProps) {
  const [activeEditorType, setActiveEditorType] = useState<ActiveEditorType>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [orderedQuestions, setOrderedQuestions] = useState(questions);
  const [columnLayout, setColumnLayout] = useState(readColumnLayout);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const draggedQuestionIdRef = useRef("");
  const orderInputRef = useRef<HTMLInputElement | null>(null);
  const reorderFormRef = useRef<HTMLFormElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedQuestion = orderedQuestions.find((question) => question.id === selectedQuestionId) || null;
  const selectedChoiceType = isChoiceQuestionType(selectedQuestion?.type) ? selectedQuestion.type : null;
  const selectedEditableType = isEditableQuestionType(selectedQuestion?.type) ? selectedQuestion.type : null;
  const activeType = activeEditorType || selectedQuestion?.type || "";
  const activeDifficulty = activeEditorType ? "3星" : difficultyText(selectedQuestion?.difficulty);
  const activeFormId = activeEditorType
    ? createQuestionFormId(activeEditorType)
    : selectedQuestion && selectedEditableType
      ? editQuestionFormId(selectedQuestion.id)
      : undefined;
  const visibleTypeOrder = questionTypes;
  const typeCounts = orderedQuestions.reduce<Record<string, number>>((counts, question) => {
    counts[question.type] = (counts[question.type] || 0) + 1;
    return counts;
  }, {});
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const listedQuestions = normalizedSearchQuery
    ? orderedQuestions.filter((question) => questionSearchText(question).includes(normalizedSearchQuery))
    : orderedQuestions;

  useEffect(() => {
    setOrderedQuestions(questions);
  }, [questions]);

  useEffect(() => {
    if (searchOpen) {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  function submitQuestionOrder(nextQuestions: QuestionRow[]) {
    if (!orderInputRef.current || !reorderFormRef.current) {
      return;
    }
    orderInputRef.current.value = nextQuestions.map((question) => question.id).join(",");
    reorderFormRef.current.requestSubmit();
  }

  function moveQuestionAfter(targetQuestionId: string) {
    const draggedQuestionId = draggedQuestionIdRef.current;
    if (!draggedQuestionId || draggedQuestionId === targetQuestionId) {
      return;
    }

    const nextQuestions = [...orderedQuestions];
    const from = nextQuestions.findIndex((question) => question.id === draggedQuestionId);
    if (from < 0) {
      return;
    }
    const [movedQuestion] = nextQuestions.splice(from, 1);
    const targetIndex = nextQuestions.findIndex((question) => question.id === targetQuestionId);
    if (targetIndex < 0) {
      return;
    }
    nextQuestions.splice(targetIndex + 1, 0, movedQuestion);
    setOrderedQuestions(nextQuestions);
    submitQuestionOrder(nextQuestions);
  }

  function jumpToQuestionType(type: string) {
    const question = orderedQuestions.find((item) => item.type === type);
    if (!question) {
      return;
    }
    setActiveEditorType(null);
    setSelectedQuestionId(question.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`paper-question-${question.id}`)?.scrollIntoView({ block: "center" });
    });
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
  }

  const resizeColumns = (left: "editor" | "list", right: "list" | "attributes", startX: number, startLayout: typeof defaultColumnLayout, clientX: number) => {
    const dx = clientX - startX;
    const safeDx = clamp(dx, minColumnLayout[left] - startLayout[left], startLayout[right] - minColumnLayout[right]);
    const nextLayout = {
      ...startLayout,
      [left]: startLayout[left] + safeDx,
      [right]: startLayout[right] - safeDx
    };
    setColumnLayout(nextLayout);
    saveColumnLayout(nextLayout);
  };
  const startResize = (left: "editor" | "list", right: "list" | "attributes"): PointerEventHandler<HTMLDivElement> => (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startLayout = { ...columnLayout };
    const handleMove = (moveEvent: PointerEvent) => resizeColumns(left, right, startX, startLayout, moveEvent.clientX);
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };
  const questionToolTypes: ToolItem[] = questionTypes.map((item) => ({
    label: item.label,
    icon: questionTypeIcon(item.type),
    tone: "normal",
    questionType: item.type,
    onClick: () => {
      setSelectedQuestionId(null);
      setActiveEditorType(item.type);
    }
  }));
  const toolTypes: ToolItem[] = [
    ...questionToolTypes,
    {
      label: "添加",
      icon: CopyPlus,
      tone: "normal",
      form: activeFormId,
      disabled: !activeFormId
    },
    {
      label: "删除",
      icon: Trash2,
      tone: "danger",
      form: selectedQuestion ? "delete-question-form" : undefined,
      disabled: !selectedQuestion
    }
  ];

  return (
    <main className="h-screen overflow-hidden bg-[#eef3f8] text-[#071b38]">
      <header className="grid h-[38px] grid-cols-[220px_1fr_220px] items-center border-b border-[#cdd4df] bg-[#f8fafc] px-4">
        <Link className="inline-flex items-center gap-1.5 text-sm font-bold text-[#071b38] hover:text-[#006aff]" href={ownerHref}>
          <ArrowLeft size={16} />
          题库列表
        </Link>
        <h1 className="truncate text-center text-sm font-black">{paperTitle}</h1>
        <div />
      </header>
      <form ref={reorderFormRef} action={reorderQuestionBankPaperQuestions} className="hidden">
        <input type="hidden" name="paperId" value={paperId} />
        <input ref={orderInputRef} type="hidden" name="order" />
      </form>
      {selectedQuestion ? (
        <form id="delete-question-form" action={deleteQuestionBankPaperQuestion} className="hidden">
          <input type="hidden" name="paperId" value={paperId} />
          <input type="hidden" name="paperQuestionId" value={selectedQuestion.id} />
        </form>
      ) : null}

      <section
        className="grid h-[calc(100vh-38px)] min-w-[1280px]"
        style={{
          gridTemplateColumns: `90px ${columnLayout.editor}px 6px ${columnLayout.list}px 6px minmax(${columnLayout.attributes}px, 1fr)`
        }}
      >
        <aside className="border-r border-[#d7dee8] bg-white">
          <div className="grid border-b border-[#e2e7ef] py-2">
            {toolTypes.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={cn(
                    "grid min-h-[54px] place-items-center gap-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40",
                    item.tone === "danger" ? "text-[#ef3e46]" : "text-[#071b38]",
                    item.questionType && activeEditorType === item.questionType && getQuestionTypeMeta(item.questionType, questionTypes).activeChip
                  )}
                  form={item.form}
                  type={item.form ? "submit" : "button"}
                  onClick={item.onClick}
                  disabled={item.disabled}
                >
                  <Icon size={22} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="h-full overflow-y-auto border-r border-[#d7dee8] bg-[#eef3f8] px-3 pb-16 pt-0 overscroll-contain">
          {activeEditorType && isChoiceQuestionType(activeEditorType) ? (
            <ChoiceQuestionForm key={`create-${activeEditorType}`} paperId={paperId} type={activeEditorType} />
          ) : activeEditorType === "true_false" ? (
            <TrueFalseQuestionForm key="create-true_false" paperId={paperId} />
          ) : activeEditorType === "fill_blank" ? (
            <FillBlankQuestionForm key="create-fill_blank" paperId={paperId} />
          ) : activeEditorType && isRichAnswerQuestionType(activeEditorType) ? (
            <RichAnswerQuestionForm key={`create-${activeEditorType}`} paperId={paperId} type={activeEditorType} />
          ) : selectedQuestion && selectedChoiceType ? (
            <ChoiceQuestionForm key={`edit-${selectedQuestion.id}`} paperId={paperId} question={selectedQuestion} type={selectedChoiceType} />
          ) : selectedQuestion && selectedEditableType === "true_false" ? (
            <TrueFalseQuestionForm key={`edit-${selectedQuestion.id}`} paperId={paperId} question={selectedQuestion} />
          ) : selectedQuestion && selectedEditableType === "fill_blank" ? (
            <FillBlankQuestionForm key={`edit-${selectedQuestion.id}`} paperId={paperId} question={selectedQuestion} />
          ) : selectedQuestion && selectedEditableType && isRichAnswerQuestionType(selectedEditableType) ? (
            <RichAnswerQuestionForm key={`edit-${selectedQuestion.id}`} paperId={paperId} question={selectedQuestion} type={selectedEditableType} />
          ) : selectedQuestion ? (
            <ReadonlyQuestionPreview question={selectedQuestion} />
          ) : (
            <EmptyQuestionCanvas />
          )}
        </section>
        <ResizeHandle onPointerDown={startResize("editor", "list")} />

        <section className="min-w-0 border-r border-[#d7dee8] bg-[#f7fafc]">
          <div className="flex h-8 items-center justify-between border-b border-[#d7dee8] bg-[#eef3f8] px-3">
            <h2 className="text-sm font-black">题目列表</h2>
            <button
              className={cn("grid size-7 place-items-center rounded text-[#071b38] hover:bg-white", searchOpen && "bg-white text-[#1d4ed8]")}
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="搜索题目"
            >
              <Search size={17} />
            </button>
          </div>
          {searchOpen ? (
            <div className="border-b border-[#d7dee8] bg-white px-2 py-2">
              <div className="flex h-10 items-center gap-2 rounded-lg border border-[#5d80ff] bg-white px-2 shadow-sm shadow-[#5d80ff]/10">
                <Search size={15} className="shrink-0 text-slate-400" />
                <input
                  ref={searchInputRef}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索题干、选项、解析"
                />
                {searchQuery ? (
                  <button className="grid size-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100" type="button" onClick={() => setSearchQuery("")} aria-label="清空搜索">
                    <X size={14} />
                  </button>
                ) : null}
                <button className="grid size-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100" type="button" onClick={closeSearch} aria-label="关闭搜索">
                  <X size={15} />
                </button>
              </div>
              <div className="mt-2 flex h-7 items-center justify-between text-xs text-[#071b38]">
                <button className="inline-flex items-center gap-1 font-semibold hover:text-[#1d4ed8]" type="button" onClick={closeSearch}>
                  <X size={14} />
                  取消
                </button>
                <span className="text-slate-600">{normalizedSearchQuery ? `找到 ${listedQuestions.length} 个结果` : "输入关键词搜索"}</span>
              </div>
            </div>
          ) : null}
          <div className={cn("overflow-auto px-2 py-1", searchOpen ? "h-[calc(100vh-149px)]" : "h-[calc(100vh-70px)]")}>
            {orderedQuestions.length === 0 ? (
              <div className="grid h-40 place-items-center text-sm text-slate-400">暂无题目</div>
            ) : listedQuestions.length === 0 ? (
              <div className="grid h-40 place-items-center text-sm text-slate-400">没有匹配的题目</div>
            ) : (
              listedQuestions.map((question) => {
                const selected = selectedQuestionId === question.id && !activeEditorType;
                const meta = getQuestionTypeMeta(question.type, questionTypes);
                const displayIndex = orderedQuestions.findIndex((item) => item.id === question.id) + 1;
                return (
                  <div
                    key={question.id}
                    id={`paper-question-${question.id}`}
                    className="grid grid-cols-[24px_1fr] items-stretch gap-1"
                    draggable={!searchOpen}
                    onDragStart={(event) => {
                      if (searchOpen) {
                        event.preventDefault();
                        return;
                      }
                      draggedQuestionIdRef.current = question.id;
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      draggedQuestionIdRef.current = "";
                    }}
                    onDragOver={(event) => {
                      if (searchOpen) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      if (searchOpen) {
                        return;
                      }
                      event.preventDefault();
                      moveQuestionAfter(question.id);
                    }}
                  >
                    <div className="grid place-items-center text-sm font-bold text-[#071b38]">{displayIndex}</div>
                    <button
                      className={cn(
                        "mb-1 flex min-h-[48px] min-w-0 items-center rounded-md border px-3 text-left text-xs font-medium leading-5 transition hover:brightness-[0.98]",
                        searchOpen ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                        selected ? meta.selectedRow : meta.row
                      )}
                      type="button"
                      onClick={() => {
                        setActiveEditorType(null);
                        setSelectedQuestionId(question.id);
                      }}
                    >
                      <span className={cn("min-w-0 truncate", selected && "font-black")}>{stripHtml(question.title) || questionTypeText(question.type, questionTypes)}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
        <ResizeHandle onPointerDown={startResize("list", "attributes")} />

        <aside className="flex min-w-0 min-h-0 flex-col overflow-hidden bg-white">
          <section className="shrink-0 border-b border-[#d7dee8]">
            <div className="flex h-8 items-center border-b border-[#d7dee8] bg-[#eef3f8] px-3">
              <h2 className="text-sm font-black">属性标签</h2>
            </div>
            <div className="grid gap-4 p-4">
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-sm font-bold">难度</span>
                <div className="flex flex-wrap gap-2">
                  {["1星", "2星", "3星", "4星", "5星"].map((item) => (
                    <AttributeChip key={item} label={item} active={item === activeDifficulty} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-sm font-bold">题型</span>
                <div className="flex flex-wrap gap-2">
                  {visibleTypeOrder.map((item) => (
                    <QuestionTypeChip
                      key={item.type}
                      type={item.type}
                      active={item.type === activeType}
                      count={typeCounts[item.type] || 0}
                      onClick={() => jumpToQuestionType(item.type)}
                      questionTypes={questionTypes}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-sm font-bold">知识点标签</span>
                <div className="h-9 rounded border border-[#d7dee8] bg-[#fbfcfe] px-3 py-2 text-sm text-slate-400">请输入...</div>
              </div>
            </div>
          </section>

          <section className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center border-y border-[#d7dee8] bg-[#eef3f8] px-3">
              <h2 className="text-sm font-black">知识点</h2>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <KnowledgeTreeView courses={knowledgeTree} />
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
