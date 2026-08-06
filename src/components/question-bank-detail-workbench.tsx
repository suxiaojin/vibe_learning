"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChangeEvent, FormEventHandler, PointerEventHandler, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CheckSquare,
  CircleDot,
  CopyPlus,
  Eye,
  FileText,
  Image,
  ListChecks,
  Loader2,
  Plus,
  Save,
  Search,
  Settings2,
  Sigma,
  Sparkles,
  Trash2,
  X,
  type LucideIcon
} from "lucide-react";
import {
  createQuestionBankTypedQuestion,
  deleteQuestionBankPaperQuestion,
  reorderQuestionBankPaperQuestions,
  updateQuestionBankQuestion,
  updateQuestionBankQuestionType,
  updateQuestionBankQuestionTypeConfig
} from "@/app/admin/actions";
import {
  getQuestionBankTypeLabel,
  isQuestionBankChoiceQuestionType,
  isQuestionBankEditableQuestionType,
  isQuestionBankRichAnswerQuestionType,
  questionBankQuestionTypeCatalog,
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
  questionId: string;
  title: string;
  type: string;
  status: string;
  difficulty: string;
  options: QuestionOption[];
  answer: string[];
  analysis: string;
  aiDoubtAnswer: string;
  knowledgePointTitle: string;
  chapterTitle: string;
  knowledgeTagIds: string[];
  knowledgeTagLabels: Array<{
    id: string;
    path: string;
  }>;
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
  courseId: string;
  courseName: string;
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
type QuestionUpdateHandler = (formData: FormData) => void;

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

type QuestionTypeControl = {
  value: EditableQuestionType;
  options: QuestionBankQuestionTypeConfig[];
  disabled?: boolean;
  onChange: (type: EditableQuestionType) => void;
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
const questionStemImageMaxBytes = 2 * 1024 * 1024;
const questionStemHtmlMaxChars = 5 * 1024 * 1024;
const questionStemImageTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

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
  poetry_appreciation: "proof",
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
    question.aiDoubtAnswer,
    question.options.map((option) => `${option.key} ${option.text}`).join(" ")
  ].join(" ").toLowerCase();
}

function formatQuestionTaggingIssues(questionNumbers: number[], suffix: string) {
  return questionNumbers.map((number) => `第${number}题${suffix}`).join("，");
}

function buildQuestionTaggingStatus(questionNumbers: number[], total: number) {
  if (total === 0) {
    return "当前题库还没有题目。";
  }
  if (questionNumbers.length === 0) {
    return "已全部打标成功";
  }
  return formatQuestionTaggingIssues(questionNumbers, "未打标");
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

function ToolbarButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <button
      className="inline-flex h-7 items-center gap-1.5 px-3 text-xs font-medium text-[#1f2b3d] hover:bg-white"
      type="button"
      onClick={onClick}
      onMouseDown={(event) => onClick && event.preventDefault()}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function QuestionTypeSelect({ value, options, disabled = false, onChange }: QuestionTypeControl) {
  const selectOptions = options.some((option) => option.type === value)
    ? options
    : [{ type: value, label: getQuestionBankTypeLabel(value, options) }, ...options];

  return (
    <label className="flex h-8 items-center border-l border-[#d4dae4] bg-[#f8fafc] pl-2 text-xs font-semibold text-[#475467]">
      <span className="shrink-0">题型</span>
      <select
        className="h-8 min-w-[108px] cursor-pointer bg-transparent px-2 text-sm font-bold text-[#071b38] outline-none transition focus:bg-white focus:ring-2 focus:ring-inset focus:ring-[#3b82f6]/50 disabled:cursor-wait disabled:opacity-60"
        value={value}
        disabled={disabled}
        aria-label="更改题目题型"
        onChange={(event) => onChange(event.target.value as EditableQuestionType)}
      >
        {selectOptions.map((option) => (
          <option key={option.type} value={option.type}>
            {option.label}
          </option>
        ))}
      </select>
      {disabled ? <Loader2 className="mr-2 shrink-0 animate-spin text-[#3b82f6]" size={14} aria-hidden="true" /> : null}
    </label>
  );
}

function EditorShell({
  title,
  children,
  questionTypeControl,
  onInsertImage
}: {
  title: string;
  children: ReactNode;
  questionTypeControl?: QuestionTypeControl;
  onInsertImage?: () => void;
}) {
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
            <ToolbarButton icon={Image} label="插入图表" onClick={onInsertImage} />
            <ToolbarButton icon={Sigma} label="插入公式" />
          </div>
          {questionTypeControl ? (
            <QuestionTypeSelect {...questionTypeControl} />
          ) : (
            <button className="grid h-8 w-9 place-items-center bg-[#ef3e46] text-white" type="button" aria-label="删除内容">
              <Trash2 size={14} />
            </button>
          )}
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

function KnowledgeCheckMark({
  checked,
  partial = false,
  disabled = false,
  onClick,
  label
}: {
  checked: boolean;
  partial?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const content = checked ? "✓" : partial ? "-" : "";
  const className = cn(
    "grid size-5 shrink-0 place-items-center rounded border text-xs font-black",
    checked && "border-[#1d4ed8] bg-[#1d4ed8] text-white",
    partial && !checked && "border-[#93c5fd] bg-[#dbeafe] text-[#1d4ed8]",
    !checked && !partial && "border-[#d4dbe6] bg-white text-transparent",
    onClick && "transition hover:border-[#1d4ed8] hover:text-[#1d4ed8] disabled:cursor-wait disabled:opacity-60"
  );

  if (onClick) {
    return (
      <button
        className={className}
        type="button"
        disabled={disabled}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={className} aria-hidden="true">
      {content}
    </span>
  );
}

function KnowledgeTreeView({
  courses,
  selectedIds,
  updatingId,
  onToggleSection
}: {
  courses: KnowledgeTreeCourse[];
  selectedIds: string[];
  updatingId?: string;
  onToggleSection?: (sectionId: string, checked: boolean) => void;
}) {
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(() => new Set());
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(() => new Set());
  const selectedSet = new Set(selectedIds);

  function chapterHasSelection(chapter: KnowledgeTreeChapter) {
    return selectedSet.has(chapter.id) || chapter.sections.some((section) => selectedSet.has(section.id));
  }

  function courseHasSelection(course: KnowledgeTreeCourse) {
    return course.chapters.some(chapterHasSelection);
  }

  useEffect(() => {
    if (selectedIds.length === 0) {
      return;
    }

    setExpandedCourseIds((current) => {
      const next = new Set(current);
      courses.forEach((course) => {
        if (courseHasSelection(course)) {
          next.add(course.id);
        }
      });
      return next;
    });
    setExpandedChapterIds((current) => {
      const next = new Set(current);
      courses.forEach((course) => {
        course.chapters.forEach((chapter) => {
          if (chapterHasSelection(chapter)) {
            next.add(chapter.id);
          }
        });
      });
      return next;
    });

    window.setTimeout(() => {
      document.getElementById(`knowledge-tree-node-${selectedIds[0]}`)?.scrollIntoView({ block: "center", inline: "nearest" });
    }, 0);
  }, [courses, selectedIds]);

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
          const coursePartial = courseHasSelection(course);
          return (
          <div key={course.id}>
            <button
              className="flex min-h-8 w-full items-center gap-2 text-left text-sm font-black text-[#071b38] hover:text-[#1d4ed8]"
              type="button"
              aria-expanded={courseExpanded}
              onClick={() => toggleCourse(course.id)}
            >
              <span className="grid size-4 shrink-0 place-items-center rounded border border-[#9aa9bc] bg-white text-xs leading-none text-[#071b38]">{courseExpanded ? "-" : "+"}</span>
              <KnowledgeCheckMark checked={false} partial={coursePartial} />
              <span className="min-w-0 truncate" title={course.title}>{course.title}</span>
            </button>

            {courseExpanded && course.chapters.length > 0 ? (
              <div className="ml-[26px] mt-1 space-y-1 border-l border-[#d6dbe4] pl-5">
                {course.chapters.map((chapter) => {
                  const chapterExpanded = expandedChapterIds.has(chapter.id);
                  const chapterChecked = selectedSet.has(chapter.id);
                  const chapterPartial = !chapterChecked && chapter.sections.some((section) => selectedSet.has(section.id));
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
                      <KnowledgeCheckMark checked={chapterChecked} partial={chapterPartial} />
                      <span className="min-w-0 truncate" title={chapter.title}>{chapter.title}</span>
                    </button>

                    {chapterExpanded && chapter.sections.length > 0 ? (
                      <div className="ml-[10px] space-y-1 border-l border-[#e0e5ec] pl-5">
                        {chapter.sections.map((section) => {
                          const sectionChecked = selectedSet.has(section.id);
                          return (
                          <div
                            key={section.id}
                            id={`knowledge-tree-node-${section.id}`}
                            className={cn("relative flex min-h-8 items-center gap-2 rounded-sm text-sm text-[#071b38]", sectionChecked && "bg-[#eff6ff]")}
                          >
                            <span className="absolute -left-5 top-4 h-px w-3 bg-[#e0e5ec]" />
                            <KnowledgeCheckMark
                              checked={sectionChecked}
                              disabled={updatingId === section.id}
                              label={sectionChecked ? `取消${section.title}` : `选择${section.title}`}
                              onClick={onToggleSection ? () => onToggleSection(section.id, sectionChecked) : undefined}
                            />
                            <span className="min-w-0 truncate" title={section.title}>{section.title}</span>
                          </div>
                          );
                        })}
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

function RichTextEditor({
  name,
  defaultValue = "",
  imageInputRef,
  minHeightClassName = "min-h-[240px]"
}: {
  name: string;
  defaultValue?: string;
  imageInputRef?: RefObject<HTMLInputElement | null>;
  minHeightClassName?: string;
}) {
  const initialHtml = toRichTextHtml(defaultValue);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const selectedResizableElementRef = useRef<HTMLElement | null>(null);
  const [imageError, setImageError] = useState("");
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
  const [tableRows, setTableRows] = useState("2");
  const [tableColumns, setTableColumns] = useState("2");
  const [resizeBox, setResizeBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    kind: "image" | "table";
  } | null>(null);
  const rememberSelection = () => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection || !editor || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      return;
    }
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!selection || !range) {
      return;
    }
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const syncValue = () => {
    if (inputRef.current) {
      inputRef.current.value = editorRef.current?.innerHTML || "";
    }
    rememberSelection();
  };
  const applyCommand = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    syncValue();
  };
  const updateResizeBox = () => {
    const container = containerRef.current;
    const element = selectedResizableElementRef.current;
    if (!container || !element || !element.isConnected) {
      setResizeBox(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    setResizeBox({
      left: elementRect.left - containerRect.left,
      top: elementRect.top - containerRect.top,
      width: elementRect.width,
      height: elementRect.height,
      kind: element.tagName === "IMG" ? "image" : "table"
    });
  };
  const selectResizableElement = (target: EventTarget | null) => {
    const editor = editorRef.current;
    const element = target instanceof Element ? target.closest("img, table") as HTMLElement | null : null;
    if (!editor || !element || !editor.contains(element)) {
      selectedResizableElementRef.current = null;
      setResizeBox(null);
      return;
    }
    selectedResizableElementRef.current = element;
    window.requestAnimationFrame(updateResizeBox);
  };
  const startResize: PointerEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const element = selectedResizableElementRef.current;
    const editor = editorRef.current;
    if (!element || !editor) {
      return;
    }

    const startRect = element.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const aspectRatio = startRect.width / Math.max(1, startRect.height);
    const isImage = element.tagName === "IMG";
    const maxWidth = Math.max(120, editor.clientWidth - 32);

    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = clamp(startRect.width + moveEvent.clientX - startX, 80, maxWidth);
      element.style.width = `${Math.round(nextWidth)}px`;
      element.style.maxWidth = "100%";
      if (isImage) {
        element.style.height = `${Math.round(nextWidth / aspectRatio)}px`;
      } else {
        const nextHeight = Math.max(48, startRect.height + moveEvent.clientY - startY);
        element.style.height = `${Math.round(nextHeight)}px`;
        element.style.tableLayout = "fixed";
      }
      updateResizeBox();
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      syncValue();
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };
  const insertTable = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const rowCount = clamp(Math.floor(Number(tableRows) || 2), 1, 50);
    const columnCount = clamp(Math.floor(Number(tableColumns) || 2), 1, 50);
    const table = document.createElement("table");
    const body = document.createElement("tbody");
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = document.createElement("tr");
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const cell = document.createElement("td");
        cell.append(document.createElement("br"));
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    table.style.width = "100%";
    table.style.maxWidth = "100%";
    table.style.tableLayout = "fixed";
    const trailingParagraph = document.createElement("p");
    trailingParagraph.append(document.createElement("br"));

    editor.focus();
    restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = document.createDocumentFragment();
      fragment.append(table, trailingParagraph);
      range.insertNode(fragment);
      range.setStart(trailingParagraph, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      editor.append(table, trailingParagraph);
    }
    selectedResizableElementRef.current = table;
    setTableRows(String(rowCount));
    setTableColumns(String(columnCount));
    setTableConfigOpen(false);
    syncValue();
    window.requestAnimationFrame(updateResizeBox);
  };
  const insertImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!questionStemImageTypes.has(file.type)) {
      setImageError("仅支持 PNG、JPG、WEBP 或 GIF 图片。");
      return;
    }
    if (file.size > questionStemImageMaxBytes) {
      setImageError("单张图片不能超过 2MB。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      const editor = editorRef.current;
      if (!editor || editor.innerHTML.length + src.length > questionStemHtmlMaxChars) {
        setImageError("题干内容过大，请删除部分图片后再插入。");
        return;
      }

      editor.focus();
      restoreSelection();
      const image = document.createElement("img");
      image.alt = file.name;
      image.src = src;
      image.style.height = "auto";
      image.style.maxWidth = "100%";

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(image);
        range.setStartAfter(image);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        editor.append(image);
      }
      selectedResizableElementRef.current = image;
      setImageError("");
      syncValue();
      window.requestAnimationFrame(updateResizeBox);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div ref={containerRef} className="relative bg-[#d9e5fb]">
      <input ref={inputRef} type="hidden" name={name} defaultValue={initialHtml} />
      {imageInputRef ? (
        <input
          ref={imageInputRef}
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          type="file"
          onChange={insertImage}
        />
      ) : null}
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
        <div className="relative">
          <button
            className="grid h-6 min-w-10 place-items-center rounded border border-[#d4dae4] bg-[#f8fafc] px-2 text-xs font-black text-[#1f2b3d] hover:border-[#94a3b8]"
            type="button"
            aria-expanded={tableConfigOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              rememberSelection();
              setTableConfigOpen((current) => !current);
            }}
          >
            表格
          </button>
          {tableConfigOpen ? (
            <div
              className="absolute left-0 top-8 z-30 w-56 border border-[#cbd5e1] bg-white p-3 shadow-xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs font-bold text-[#475467]">
                  行数
                  <input
                    className="h-9 w-full border border-[#cbd5e1] px-2 text-sm text-[#071b38] outline-none focus:border-[#3b82f6]"
                    min={1}
                    max={50}
                    type="number"
                    value={tableRows}
                    onChange={(event) => setTableRows(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold text-[#475467]">
                  列数
                  <input
                    className="h-9 w-full border border-[#cbd5e1] px-2 text-sm text-[#071b38] outline-none focus:border-[#3b82f6]"
                    min={1}
                    max={50}
                    type="number"
                    value={tableColumns}
                    onChange={(event) => setTableColumns(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  className="h-8 border border-[#cbd5e1] px-3 text-xs font-bold text-[#64748b] hover:bg-[#f1f5f9]"
                  type="button"
                  onClick={() => setTableConfigOpen(false)}
                >
                  取消
                </button>
                <button
                  className="h-8 bg-[#1d4ed8] px-3 text-xs font-bold text-white hover:bg-[#1e40af]"
                  type="button"
                  onClick={insertTable}
                >
                  插入表格
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div
        ref={editorRef}
        className={`${minHeightClassName} w-full bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38] outline-none focus:ring-2 focus:ring-inset focus:ring-[#3b82f6]/40 [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_td]:min-w-0 [&_td]:border [&_td]:border-[#8ea3c2] [&_td]:bg-white/35 [&_td]:px-2 [&_td]:py-1 [&_table]:my-2 [&_table]:max-w-full [&_table]:border-collapse`}
        contentEditable
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        role="textbox"
        tabIndex={0}
        onInput={(event) => {
          if (inputRef.current) {
            inputRef.current.value = event.currentTarget.innerHTML;
          }
          if (selectedResizableElementRef.current) {
            window.requestAnimationFrame(updateResizeBox);
          }
        }}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onPointerDown={(event) => selectResizableElement(event.target)}
        suppressContentEditableWarning
      />
      {resizeBox ? (
        <div
          className="pointer-events-none absolute z-20 border-2 border-[#3b82f6]"
          style={{
            left: resizeBox.left,
            top: resizeBox.top,
            width: resizeBox.width,
            height: resizeBox.height
          }}
        >
          <span className="absolute -top-6 right-0 bg-[#3b82f6] px-1.5 py-0.5 text-[10px] font-bold text-white">
            {resizeBox.kind === "image" ? "图片" : "表格"}
          </span>
          <button
            aria-label={`调整${resizeBox.kind === "image" ? "图片" : "表格"}大小`}
            className="pointer-events-auto absolute -bottom-2 -right-2 size-4 cursor-nwse-resize border-2 border-white bg-[#2563eb] shadow"
            onPointerDown={startResize}
            title="拖动调整大小"
            type="button"
          />
        </div>
      ) : null}
      {imageError ? <p className="border-t border-[#f4b4b8] bg-[#fff1f2] px-3 py-2 text-xs font-semibold text-[#c2414c]">{imageError}</p> : null}
    </div>
  );
}

function RichTextDisplay({ value }: { value: string }) {
  return <div className="min-h-[150px] bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38] [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_td]:min-w-0 [&_td]:border [&_td]:border-[#8ea3c2] [&_td]:bg-white/35 [&_td]:px-2 [&_td]:py-1 [&_table]:my-2 [&_table]:max-w-full [&_table]:border-collapse" dangerouslySetInnerHTML={{ __html: toRichTextHtml(value) }} />;
}

function QuestionStemEditor({
  defaultValue = "",
  questionTypeControl
}: {
  defaultValue?: string;
  questionTypeControl?: QuestionTypeControl;
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <EditorShell
      title="题干"
      questionTypeControl={questionTypeControl}
      onInsertImage={() => imageInputRef.current?.click()}
    >
      <RichTextEditor
        name="stem"
        defaultValue={defaultValue}
        imageInputRef={imageInputRef}
        minHeightClassName="min-h-[150px]"
      />
    </EditorShell>
  );
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
  type,
  questionTypeControl,
  onUpdate
}: {
  paperId: string;
  question?: QuestionRow;
  type: ChoiceQuestionType;
  questionTypeControl?: QuestionTypeControl;
  onUpdate?: QuestionUpdateHandler;
}) {
  const editing = Boolean(question);
  const formId = editing && question ? editQuestionFormId(question.id) : createQuestionFormId(type);
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
    <form
      id={formId}
      action={editing ? undefined : createQuestionBankTypedQuestion}
      key={question?.id || type}
      onSubmit={editing && onUpdate ? ((event) => {
        event.preventDefault();
        onUpdate(new FormData(event.currentTarget));
      }) as FormEventHandler<HTMLFormElement> : undefined}
    >
      <input type="hidden" name="paperId" value={paperId} />
      <input type="hidden" name="questionType" value={type} />
      {question ? <input type="hidden" name="paperQuestionId" value={question.id} /> : null}
      <QuestionStemEditor defaultValue={question?.title || ""} questionTypeControl={questionTypeControl} />
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
      {question ? <AiDoubtReviewPanel paperId={paperId} question={question} /> : null}
    </form>
  );
}

function TrueFalseQuestionForm({
  paperId,
  question,
  questionTypeControl,
  onUpdate
}: {
  paperId: string;
  question?: QuestionRow;
  questionTypeControl?: QuestionTypeControl;
  onUpdate?: QuestionUpdateHandler;
}) {
  const editing = Boolean(question);
  const formId = editing && question ? editQuestionFormId(question.id) : createQuestionFormId("true_false");
  const answer = question?.answer[0] || "";

  return (
    <form
      id={formId}
      action={editing ? undefined : createQuestionBankTypedQuestion}
      key={question?.id || "true_false"}
      onSubmit={editing && onUpdate ? ((event) => {
        event.preventDefault();
        onUpdate(new FormData(event.currentTarget));
      }) as FormEventHandler<HTMLFormElement> : undefined}
    >
      <input type="hidden" name="paperId" value={paperId} />
      <input type="hidden" name="questionType" value="true_false" />
      {question ? <input type="hidden" name="paperQuestionId" value={question.id} /> : null}
      <QuestionStemEditor defaultValue={question?.title || ""} questionTypeControl={questionTypeControl} />
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
      {question ? <AiDoubtReviewPanel paperId={paperId} question={question} /> : null}
    </form>
  );
}

function FillBlankQuestionForm({
  paperId,
  question,
  questionTypeControl,
  onUpdate
}: {
  paperId: string;
  question?: QuestionRow;
  questionTypeControl?: QuestionTypeControl;
  onUpdate?: QuestionUpdateHandler;
}) {
  const editing = Boolean(question);
  const formId = editing && question ? editQuestionFormId(question.id) : createQuestionFormId("fill_blank");

  return (
    <form
      id={formId}
      action={editing ? undefined : createQuestionBankTypedQuestion}
      key={question?.id || "fill_blank"}
      onSubmit={editing && onUpdate ? ((event) => {
        event.preventDefault();
        onUpdate(new FormData(event.currentTarget));
      }) as FormEventHandler<HTMLFormElement> : undefined}
    >
      <input type="hidden" name="paperId" value={paperId} />
      <input type="hidden" name="questionType" value="fill_blank" />
      {question ? <input type="hidden" name="paperQuestionId" value={question.id} /> : null}
      <QuestionStemEditor defaultValue={question?.title || ""} questionTypeControl={questionTypeControl} />
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
      {question ? <AiDoubtReviewPanel paperId={paperId} question={question} /> : null}
    </form>
  );
}

function RichAnswerQuestionForm({
  paperId,
  question,
  type,
  questionTypeControl,
  onUpdate
}: {
  paperId: string;
  question?: QuestionRow;
  type: RichAnswerQuestionType;
  questionTypeControl?: QuestionTypeControl;
  onUpdate?: QuestionUpdateHandler;
}) {
  const editing = Boolean(question);
  const formId = editing && question ? editQuestionFormId(question.id) : createQuestionFormId(type);

  return (
    <form
      id={formId}
      action={editing ? undefined : createQuestionBankTypedQuestion}
      key={question?.id || type}
      onSubmit={editing && onUpdate ? ((event) => {
        event.preventDefault();
        onUpdate(new FormData(event.currentTarget));
      }) as FormEventHandler<HTMLFormElement> : undefined}
    >
      <input type="hidden" name="paperId" value={paperId} />
      <input type="hidden" name="questionType" value={type} />
      {question ? <input type="hidden" name="paperQuestionId" value={question.id} /> : null}
      <QuestionStemEditor defaultValue={question?.title || ""} questionTypeControl={questionTypeControl} />
      <EditorShell title="答案">
        <RichTextEditor name="answer" defaultValue={question?.answer[0] || ""} />
      </EditorShell>
      <EditorShell title="解答详情">
        <RichTextEditor name="analysis" defaultValue={question?.analysis || ""} />
      </EditorShell>
      {question ? <AiDoubtReviewPanel paperId={paperId} question={question} /> : null}
    </form>
  );
}

function ReadonlyQuestionPreview({ paperId, question }: { paperId: string; question: QuestionRow }) {
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
      <AiDoubtReviewPanel paperId={paperId} question={question} />
    </>
  );
}

function AiDoubtReviewPanel({ paperId, question }: { paperId: string; question: QuestionRow }) {
  const router = useRouter();
  const [answer, setAnswer] = useState(question.aiDoubtAnswer || "");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `/api/admin/question-banks/${encodeURIComponent(paperId)}/questions/${encodeURIComponent(question.questionId)}/ai-doubt`;

  useEffect(() => {
    setAnswer(question.aiDoubtAnswer || "");
    setMessage("");
  }, [question.aiDoubtAnswer, question.questionId]);

  async function generateAiDoubt() {
    if (generating || saving) {
      return;
    }
    if (answer.trim()) {
      const confirmed = window.confirm("重新生成会覆盖当前文本框内容，但不会自动保存到数据库。是否继续？");
      if (!confirmed) {
        return;
      }
    }

    setGenerating(true);
    setMessage("正在调用 AI 生成答疑草稿...");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = (await response.json().catch(() => null)) as { answer?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "AI 答疑生成失败。");
      }

      setAnswer(payload?.answer || "");
      setMessage("AI 答疑草稿已生成，请审核后保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 答疑生成失败。");
    } finally {
      setGenerating(false);
    }
  }

  async function saveAiDoubt() {
    if (generating || saving) {
      return;
    }

    setSaving(true);
    setMessage("正在保存 AI 答疑...");

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer })
      });
      const payload = (await response.json().catch(() => null)) as { answer?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "AI 答疑保存失败。");
      }

      setAnswer(payload?.answer || "");
      setMessage(payload?.answer ? "AI 答疑已保存，学生端将优先使用该内容。" : "AI 答疑已清空，学生端会实时生成兜底。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 答疑保存失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="flex h-10 items-center justify-between border-b border-[#d4dae4] bg-[#eef3f9] px-3">
        <h2 className="text-sm font-black text-[#111827]">AI答疑</h2>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-7 items-center gap-1 rounded border border-[#c4b5fd] bg-[#f5f3ff] px-2.5 text-xs font-bold text-[#6d28d9] hover:border-[#8b5cf6] disabled:cursor-wait disabled:opacity-60"
            disabled={generating || saving}
            type="button"
            onClick={generateAiDoubt}
          >
            {generating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
            {generating ? "生成中" : "AI答疑"}
          </button>
          <button
            className="inline-flex h-7 items-center gap-1 rounded border border-[#86efac] bg-[#f0fdf4] px-2.5 text-xs font-bold text-[#15803d] hover:border-[#22c55e] disabled:cursor-wait disabled:opacity-60"
            disabled={generating || saving}
            type="button"
            onClick={saveAiDoubt}
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            {saving ? "保存中" : "保存AI答疑"}
          </button>
        </div>
      </div>
      <div className="bg-[#eef3f8] p-4">
        <textarea
          className="min-h-[220px] w-full resize-y border border-[#c6d3e6] bg-[#d9e5fb] px-4 py-3 text-sm leading-7 text-[#071b38] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
          placeholder="点击 AI答疑 生成草稿，审核修改后保存。保存后学生端默认 AI 答疑会优先使用这里的内容。"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
          <p className="font-medium text-[#64748b]">{message || "未保存时不会影响学生端；保存为空表示清空后台审核答疑。"}</p>
          <span className="shrink-0 text-[#94a3b8]">{answer.trim().length} 字</span>
        </div>
      </div>
    </section>
  );
}

function QuestionTypeConfigDialog({
  courseId,
  courseName,
  paperId,
  questionTypes,
  onClose,
  onSaved
}: {
  courseId: string;
  courseName: string;
  paperId: string;
  questionTypes: QuestionBankQuestionTypeConfig[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedTypes, setSelectedTypes] = useState<QuestionBankQuestionTypeConfig[]>(questionTypes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const availableTypes = questionBankQuestionTypeCatalog.filter((item) => !selectedTypes.some((selected) => selected.type === item.type));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  function moveType(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedTypes.length) {
      return;
    }
    setSelectedTypes((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function addType(item: QuestionBankQuestionTypeConfig) {
    setSelectedTypes((current) => current.some((selected) => selected.type === item.type) ? current : [...current, item]);
    setMessage("");
  }

  function removeType(type: EditableQuestionType) {
    if (selectedTypes.length <= 1) {
      setMessage("至少需要保留一种题型。");
      return;
    }
    setSelectedTypes((current) => current.filter((item) => item.type !== type));
    setMessage("");
  }

  async function saveConfig() {
    if (saving || selectedTypes.length === 0) {
      return;
    }
    setSaving(true);
    setMessage("");
    const formData = new FormData();
    formData.set("paperId", paperId);
    formData.set("courseId", courseId);
    formData.set("config", JSON.stringify(selectedTypes));

    try {
      await updateQuestionBankQuestionTypeConfig(formData);
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "题型配置保存失败，请重试。");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#0f172a]/40 p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="question-type-config-title"
        aria-modal="true"
        className="flex max-h-[82vh] w-full max-w-[760px] flex-col overflow-hidden border border-[#cbd5e1] bg-white shadow-2xl"
        role="dialog"
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#d7dee8] bg-[#f8fafc] px-5">
          <div className="min-w-0">
            <h2 id="question-type-config-title" className="text-base font-black text-[#071b38]">题型配置</h2>
            <p className="truncate text-xs font-medium text-[#64748b]">{courseName}</p>
          </div>
          <button
            aria-label="关闭题型配置"
            className="grid size-9 place-items-center text-[#64748b] hover:bg-[#eef2f7] hover:text-[#071b38] disabled:opacity-40"
            disabled={saving}
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[#d7dee8]">
          <section className="min-h-0 overflow-y-auto">
            <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-[#e2e8f0] bg-white px-4">
              <h3 className="text-sm font-black text-[#071b38]">已启用题型</h3>
              <span className="text-xs font-bold text-[#64748b]">{selectedTypes.length}</span>
            </div>
            <div className="divide-y divide-[#e8edf3]">
              {selectedTypes.map((item, index) => (
                <div key={item.type} className="grid min-h-12 grid-cols-[1fr_auto] items-center gap-2 px-4 py-2">
                  <span className="truncate text-sm font-semibold text-[#1f2b3d]">{item.label}</span>
                  <div className="flex items-center">
                    <button
                      aria-label={`上移${item.label}`}
                      className="grid size-8 place-items-center text-[#64748b] hover:bg-[#eef2f7] hover:text-[#1d4ed8] disabled:opacity-25"
                      disabled={index === 0 || saving}
                      onClick={() => moveType(index, -1)}
                      title="上移"
                      type="button"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      aria-label={`下移${item.label}`}
                      className="grid size-8 place-items-center text-[#64748b] hover:bg-[#eef2f7] hover:text-[#1d4ed8] disabled:opacity-25"
                      disabled={index === selectedTypes.length - 1 || saving}
                      onClick={() => moveType(index, 1)}
                      title="下移"
                      type="button"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      aria-label={`移除${item.label}`}
                      className="grid size-8 place-items-center text-[#ef4444] hover:bg-[#fff1f2] disabled:opacity-25"
                      disabled={selectedTypes.length <= 1 || saving}
                      onClick={() => removeType(item.type)}
                      title="移除"
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto">
            <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-[#e2e8f0] bg-white px-4">
              <h3 className="text-sm font-black text-[#071b38]">可添加题型</h3>
              <span className="text-xs font-bold text-[#64748b]">{availableTypes.length}</span>
            </div>
            {availableTypes.length > 0 ? (
              <div className="divide-y divide-[#e8edf3]">
                {availableTypes.map((item) => (
                  <div key={item.type} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
                    <span className="truncate text-sm font-semibold text-[#1f2b3d]">{item.label}</span>
                    <button
                      aria-label={`添加${item.label}`}
                      className="grid size-8 shrink-0 place-items-center text-[#1d4ed8] hover:bg-[#eff6ff] disabled:opacity-40"
                      disabled={saving}
                      onClick={() => addType(item)}
                      title="添加"
                      type="button"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center text-sm font-medium text-[#94a3b8]">暂无可添加题型</div>
            )}
          </section>
        </div>

        <footer className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-t border-[#d7dee8] bg-[#f8fafc] px-5 py-3">
          <p className="min-w-0 text-xs font-semibold text-[#c2414c]">{message}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="h-9 border border-[#cbd5e1] bg-white px-5 text-sm font-bold text-[#475467] hover:bg-[#f1f5f9] disabled:opacity-40"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="inline-flex h-9 min-w-24 items-center justify-center gap-2 bg-[#1f9d8b] px-5 text-sm font-bold text-white hover:bg-[#178271] disabled:cursor-wait disabled:opacity-50"
              disabled={saving || selectedTypes.length === 0}
              onClick={saveConfig}
              type="button"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
              {saving ? "保存中" : "保存配置"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function QuestionBankDetailWorkbench({ courseId, courseName, paperId, paperTitle, ownerHref, questionTypes, knowledgeTree, questions }: QuestionBankDetailWorkbenchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedQuestionId = searchParams.get("question");
  const [activeEditorType, setActiveEditorType] = useState<ActiveEditorType>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [orderedQuestions, setOrderedQuestions] = useState(questions);
  const [columnLayout, setColumnLayout] = useState(readColumnLayout);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [aiTagging, setAiTagging] = useState(false);
  const [aiTagMessage, setAiTagMessage] = useState("");
  const [knowledgeTagUpdatingId, setKnowledgeTagUpdatingId] = useState("");
  const [knowledgeTagMessage, setKnowledgeTagMessage] = useState("");
  const [questionTypeUpdatingId, setQuestionTypeUpdatingId] = useState("");
  const [questionTypeConfigOpen, setQuestionTypeConfigOpen] = useState(false);
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionSaveNotice, setQuestionSaveNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const draggedQuestionIdRef = useRef("");
  const focusedQuestionIdRef = useRef("");
  const orderInputRef = useRef<HTMLInputElement | null>(null);
  const reorderFormRef = useRef<HTMLFormElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedQuestion = orderedQuestions.find((question) => question.id === selectedQuestionId) || null;
  const selectedKnowledgeTagIds = selectedQuestion?.knowledgeTagIds || [];
  const selectedKnowledgeLabels = selectedQuestion?.knowledgeTagLabels || [];
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
  const untaggedQuestionNumbers = orderedQuestions.reduce<number[]>((numbers, question, index) => {
    if (question.knowledgeTagLabels.length === 0) {
      numbers.push(index + 1);
    }
    return numbers;
  }, []);
  const tagCoverageMessage = aiTagMessage || buildQuestionTaggingStatus(untaggedQuestionNumbers, orderedQuestions.length);
  const tagCoverageTone = aiTagging ? "progress" : tagCoverageMessage === "已全部打标成功" ? "success" : "warning";

  useEffect(() => {
    setOrderedQuestions(questions);
  }, [questions]);

  useEffect(() => {
    const hashQuestionId = typeof window === "undefined" ? "" : window.location.hash.replace(/^#paper-question-/, "");
    const targetQuestionId = focusedQuestionId || hashQuestionId;
    if (!targetQuestionId || focusedQuestionIdRef.current === targetQuestionId) {
      return;
    }
    if (!orderedQuestions.some((question) => question.id === targetQuestionId)) {
      return;
    }

    focusedQuestionIdRef.current = targetQuestionId;
    setActiveEditorType(null);
    setSelectedQuestionId(targetQuestionId);
    window.requestAnimationFrame(() => {
      document.getElementById(`paper-question-${targetQuestionId}`)?.scrollIntoView({ block: "center" });
    });
  }, [focusedQuestionId, orderedQuestions]);

  useEffect(() => {
    if (searchOpen) {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  useEffect(() => {
    setKnowledgeTagMessage("");
    setQuestionSaveNotice(null);
  }, [selectedQuestionId]);

  async function saveSelectedQuestion(formData: FormData) {
    if (questionSaving) {
      return;
    }
    setQuestionSaving(true);
    setQuestionSaveNotice(null);

    try {
      const savedQuestion = await updateQuestionBankQuestion(formData);
      setOrderedQuestions((current) => current.map((question) => (
        question.id === savedQuestion.paperQuestionId
          ? {
              ...question,
              type: savedQuestion.type,
              title: savedQuestion.stem,
              options: savedQuestion.options,
              answer: savedQuestion.answer,
              analysis: savedQuestion.analysis
            }
          : question
      )));
      setQuestionSaveNotice({ tone: "success", message: "已保存" });
    } catch (error) {
      setQuestionSaveNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "保存失败，请重试"
      });
    } finally {
      setQuestionSaving(false);
    }
  }

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

  async function changeEditorQuestionType(nextType: EditableQuestionType) {
    if (!questionTypes.some((option) => option.type === nextType)) {
      return;
    }

    if (activeEditorType) {
      setActiveEditorType(nextType);
      return;
    }

    if (!selectedQuestion || selectedQuestion.type === nextType || questionTypeUpdatingId) {
      return;
    }

    const confirmed = window.confirm("更改题型后将切换编辑器，当前尚未保存的修改会丢失。是否继续？");
    if (!confirmed) {
      return;
    }

    const paperQuestionId = selectedQuestion.id;
    const previousType = selectedQuestion.type;
    setQuestionTypeUpdatingId(paperQuestionId);
    setOrderedQuestions((current) => current.map((question) => (question.id === paperQuestionId ? { ...question, type: nextType } : question)));

    const formData = new FormData();
    formData.set("paperId", paperId);
    formData.set("paperQuestionId", paperQuestionId);
    formData.set("questionType", nextType);

    try {
      await updateQuestionBankQuestionType(formData);
      router.refresh();
    } catch (error) {
      setOrderedQuestions((current) => current.map((question) => (question.id === paperQuestionId ? { ...question, type: previousType } : question)));
      window.alert(error instanceof Error ? error.message : "题型修改失败，请重试。");
    } finally {
      setQuestionTypeUpdatingId("");
    }
  }

  async function runAiTagging() {
    if (aiTagging) {
      return;
    }
    if (orderedQuestions.length === 0) {
      setAiTagMessage("当前题库还没有题目。");
      return;
    }

    const confirmed = window.confirm("AI 将为当前题库的全部题目重新生成 AI 标签，已有人工标签不会被删除。是否继续？");
    if (!confirmed) {
      return;
    }

    setAiTagging(true);
    setAiTagMessage("AI 正在判断知识点归属，请稍等...");

    try {
      const response = await fetch(`/api/admin/question-banks/${paperId}/ai-tag`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        total?: number;
        tagged?: number;
        failed?: number;
        results?: Array<{
          paperQuestionId?: string;
          ok?: boolean;
        }>;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "AI 打标失败。");
      }

      const total = payload?.total ?? orderedQuestions.length;
      const tagged = payload?.tagged ?? 0;
      const failed = payload?.failed ?? Math.max(0, total - tagged);
      const failedPaperQuestionIds = new Set(
        (payload?.results || [])
          .filter((item) => !item.ok && item.paperQuestionId)
          .map((item) => item.paperQuestionId as string)
      );
      const failedQuestionNumbers = orderedQuestions.reduce<number[]>((numbers, question, index) => {
        if (failedPaperQuestionIds.has(question.id)) {
          numbers.push(index + 1);
        }
        return numbers;
      }, []);
      if (failedQuestionNumbers.length > 0) {
        setAiTagMessage(formatQuestionTaggingIssues(failedQuestionNumbers, "打标失败"));
      } else if (failed > 0) {
        setAiTagMessage(`AI 打标完成：${tagged}/${total} 道题已归属，${failed} 道失败。`);
      } else {
        setAiTagMessage("已全部打标成功");
      }
      router.refresh();
    } catch (error) {
      setAiTagMessage(error instanceof Error ? error.message : "AI 打标失败。");
    } finally {
      setAiTagging(false);
    }
  }

  async function updateKnowledgeTag(action: "add" | "delete", syllabusItemId: string) {
    if (!selectedQuestion || knowledgeTagUpdatingId) {
      return;
    }

    setKnowledgeTagUpdatingId(syllabusItemId);
    setKnowledgeTagMessage(action === "delete" ? "正在删除知识点标签..." : "正在添加知识点标签...");

    try {
      const response = await fetch("/api/admin/question-knowledge-tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          paperId,
          questionId: selectedQuestion.questionId,
          syllabusItemId,
          action
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "知识点标签更新失败。");
      }

      setAiTagMessage("");
      setKnowledgeTagMessage(action === "delete" ? "已删除知识点标签。" : "已添加知识点标签。");
      router.refresh();
    } catch (error) {
      setKnowledgeTagMessage(error instanceof Error ? error.message : "知识点标签更新失败。");
    } finally {
      setKnowledgeTagUpdatingId("");
    }
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
      label: questionSaving ? "保存中" : "添加",
      icon: CopyPlus,
      tone: "normal",
      form: activeFormId,
      disabled: !activeFormId || questionSaving
    },
    {
      label: "删除",
      icon: Trash2,
      tone: "danger",
      form: selectedQuestion ? "delete-question-form" : undefined,
      disabled: !selectedQuestion
    },
    {
      label: aiTagging ? "打标中" : "AI打标",
      icon: Sparkles,
      tone: "normal",
      onClick: runAiTagging,
      disabled: aiTagging || orderedQuestions.length === 0 || knowledgeTree.length === 0
    },
    {
      label: "题型配置",
      icon: Settings2,
      tone: "normal",
      onClick: () => setQuestionTypeConfigOpen(true)
    }
  ];
  const editorQuestionType = activeEditorType || selectedEditableType;
  const editorQuestionTypeControl: QuestionTypeControl | undefined = editorQuestionType
    ? {
        value: editorQuestionType,
        options: questionTypes,
        disabled: Boolean(selectedQuestion && questionTypeUpdatingId === selectedQuestion.id),
        onChange: changeEditorQuestionType
      }
    : undefined;

  return (
    <main className="h-screen overflow-hidden bg-[#eef3f8] text-[#071b38]">
      <header className="grid h-[38px] grid-cols-[220px_1fr_220px] items-center border-b border-[#cdd4df] bg-[#f8fafc] px-4">
        <Link className="inline-flex items-center gap-1.5 text-sm font-bold text-[#071b38] hover:text-[#006aff]" href={ownerHref}>
          <ArrowLeft size={16} />
          题库列表
        </Link>
        <h1 className="truncate text-center text-sm font-black">{paperTitle}</h1>
        <div className="justify-self-end text-xs font-bold">
          {questionSaving ? (
            <span className="inline-flex items-center gap-1.5 text-[#1d4ed8]"><Loader2 className="animate-spin" size={14} />正在保存</span>
          ) : questionSaveNotice ? (
            <span className={questionSaveNotice.tone === "success" ? "text-[#15803d]" : "text-[#dc2626]"}>{questionSaveNotice.message}</span>
          ) : null}
        </div>
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
        <aside className="overflow-y-auto border-r border-[#d7dee8] bg-white">
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
            <ChoiceQuestionForm key={`create-${activeEditorType}`} paperId={paperId} type={activeEditorType} questionTypeControl={editorQuestionTypeControl} />
          ) : activeEditorType === "true_false" ? (
            <TrueFalseQuestionForm key="create-true_false" paperId={paperId} questionTypeControl={editorQuestionTypeControl} />
          ) : activeEditorType === "fill_blank" ? (
            <FillBlankQuestionForm key="create-fill_blank" paperId={paperId} questionTypeControl={editorQuestionTypeControl} />
          ) : activeEditorType && isRichAnswerQuestionType(activeEditorType) ? (
            <RichAnswerQuestionForm key={`create-${activeEditorType}`} paperId={paperId} type={activeEditorType} questionTypeControl={editorQuestionTypeControl} />
          ) : selectedQuestion && selectedChoiceType ? (
            <ChoiceQuestionForm
              key={`edit-${selectedQuestion.id}-${selectedChoiceType}`}
              paperId={paperId}
              question={selectedQuestion}
              type={selectedChoiceType}
              questionTypeControl={editorQuestionTypeControl}
              onUpdate={saveSelectedQuestion}
            />
          ) : selectedQuestion && selectedEditableType === "true_false" ? (
            <TrueFalseQuestionForm
              key={`edit-${selectedQuestion.id}-true_false`}
              paperId={paperId}
              question={selectedQuestion}
              questionTypeControl={editorQuestionTypeControl}
              onUpdate={saveSelectedQuestion}
            />
          ) : selectedQuestion && selectedEditableType === "fill_blank" ? (
            <FillBlankQuestionForm
              key={`edit-${selectedQuestion.id}-fill_blank`}
              paperId={paperId}
              question={selectedQuestion}
              questionTypeControl={editorQuestionTypeControl}
              onUpdate={saveSelectedQuestion}
            />
          ) : selectedQuestion && selectedEditableType && isRichAnswerQuestionType(selectedEditableType) ? (
            <RichAnswerQuestionForm
              key={`edit-${selectedQuestion.id}-${selectedEditableType}`}
              paperId={paperId}
              question={selectedQuestion}
              type={selectedEditableType}
              questionTypeControl={editorQuestionTypeControl}
              onUpdate={saveSelectedQuestion}
            />
          ) : selectedQuestion ? (
            <ReadonlyQuestionPreview paperId={paperId} question={selectedQuestion} />
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
              <div className="grid grid-cols-[80px_1fr] items-start gap-2">
                <span className="pt-1.5 text-sm font-bold">题型</span>
                <div className="flex flex-wrap items-center gap-2">
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
                <div className="min-h-9 rounded border border-[#d7dee8] bg-[#fbfcfe] px-3 py-2 text-sm">
                  {selectedKnowledgeLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedKnowledgeLabels.map((item) => (
                        <span
                          key={item.id}
                          className="group/tag relative inline-block max-w-full break-words rounded border border-[#93c5fd] bg-[#eff6ff] px-2 py-0.5 text-xs font-bold leading-5 text-[#1d4ed8]"
                          title={item.path}
                        >
                          <button
                            className="absolute -right-2 -top-2 hidden size-4 place-items-center rounded-full bg-[#ef4444] text-[11px] font-black leading-none text-white shadow-sm hover:bg-[#dc2626] disabled:cursor-wait disabled:bg-[#fca5a5] group-hover/tag:grid"
                            type="button"
                            disabled={knowledgeTagUpdatingId === item.id}
                            aria-label={`删除${item.path}`}
                            onClick={() => updateKnowledgeTag("delete", item.id)}
                          >
                            ×
                          </button>
                          {item.path}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">{selectedQuestion ? "暂无知识点标签" : "请选择题目"}</span>
                  )}
                  {knowledgeTagMessage ? <p className="mt-1 text-xs font-medium text-[#64748b]">{knowledgeTagMessage}</p> : null}
                </div>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-start gap-2">
                <span />
                <p
                  className={cn(
                    "rounded border px-3 py-2 text-xs font-medium leading-5",
                    tagCoverageTone === "success" ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" : null,
                    tagCoverageTone === "warning" ? "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]" : null,
                    tagCoverageTone === "progress" ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]" : null
                  )}
                >
                  {tagCoverageMessage}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center border-y border-[#d7dee8] bg-[#eef3f8] px-3">
              <h2 className="text-sm font-black">知识点</h2>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <KnowledgeTreeView
                courses={knowledgeTree}
                selectedIds={selectedKnowledgeTagIds}
                updatingId={knowledgeTagUpdatingId}
                onToggleSection={selectedQuestion ? (sectionId, checked) => updateKnowledgeTag(checked ? "delete" : "add", sectionId) : undefined}
              />
            </div>
          </section>
        </aside>
      </section>
      {questionTypeConfigOpen ? (
        <QuestionTypeConfigDialog
          courseId={courseId}
          courseName={courseName}
          paperId={paperId}
          questionTypes={questionTypes}
          onClose={() => setQuestionTypeConfigOpen(false)}
          onSaved={() => {
            setQuestionTypeConfigOpen(false);
            setActiveEditorType(null);
            router.refresh();
          }}
        />
      ) : null}
    </main>
  );
}
