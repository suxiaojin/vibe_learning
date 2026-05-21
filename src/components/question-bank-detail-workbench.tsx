"use client";

import Link from "next/link";
import type { PointerEventHandler, ReactNode } from "react";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  CheckSquare,
  ChevronDown,
  CircleDot,
  CopyPlus,
  Eye,
  FileText,
  Image,
  ListChecks,
  Search,
  Sigma,
  Trash2,
  Zap,
  type LucideIcon
} from "lucide-react";
import {
  createQuestionBankFillBlankQuestion,
  createQuestionBankMultipleChoiceQuestion,
  createQuestionBankSingleChoiceQuestion,
  createQuestionBankTrueFalseQuestion,
  deleteQuestionBankPaperQuestion,
  updateQuestionBankQuestion
} from "@/app/admin/actions";
import { cn } from "@/lib/utils";

type QuestionOption = {
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

type QuestionBankDetailWorkbenchProps = {
  paperId: string;
  paperTitle: string;
  ownerHref: string;
  isComputerMajor: boolean;
  questions: QuestionRow[];
};

type ActiveEditorType = "single_choice" | "multiple_choice" | "true_false" | "fill_blank" | null;
type EditableQuestionType = Exclude<ActiveEditorType, null>;
type ChoiceQuestionType = "single_choice" | "multiple_choice";

type ToolItem = {
  label: string;
  icon: LucideIcon;
  tone: "normal" | "danger";
  onClick?: () => void;
  form?: string;
  disabled?: boolean;
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

const questionTypeOrder = ["single_choice", "multiple_choice", "true_false", "fill_blank", "comprehensive"] as const;

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
  comprehensive: {
    label: "综合题",
    row: "border-[#fda4af] bg-[#ffe4e6] text-[#be123c]",
    selectedRow: "border-[#f43f5e] bg-[#fecdd3] text-[#881337] ring-2 ring-[#f43f5e]/30",
    chip: "border-[#fda4af] bg-[#ffe4e6] text-[#be123c]",
    activeChip: "border-[#f43f5e] bg-[#f43f5e] text-white shadow-sm shadow-[#f43f5e]/30"
  }
};

const defaultQuestionTypeStyle: QuestionTypeMeta = {
  label: "题目",
  row: "border-[#d5e9f4] bg-[#d8edf7] text-[#071b38]",
  selectedRow: "border-[#9bb5cc] bg-[#dbe7f1] text-[#071b38] ring-2 ring-[#9bb5cc]/30",
  chip: "border-[#d7dee8] bg-[#eef2f7] text-[#344054]",
  activeChip: "border-[#667085] bg-[#667085] text-white"
};

function getQuestionTypeMeta(type?: string) {
  if (!type) {
    return defaultQuestionTypeStyle;
  }
  return questionTypeStyles[type] || defaultQuestionTypeStyle;
}

function questionTypeText(type?: string) {
  return type ? getQuestionTypeMeta(type).label : "";
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

function initialChoiceOptionKeys(question?: QuestionRow) {
  if (!question?.options.length) {
    return [...optionKeys];
  }

  const keys = question.options
    .map((option) => option.key.toUpperCase())
    .filter((key, index, array) => alphabetOptionKeys.includes(key) && array.indexOf(key) === index)
    .sort((left, right) => alphabetOptionKeys.indexOf(left) - alphabetOptionKeys.indexOf(right));

  return keys.length > 0 ? keys : [...optionKeys];
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

function RichTextEditor({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  const initialHtml = toRichTextHtml(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const applyCommand = (command: string) => {
    document.execCommand(command, false);
    if (inputRef.current) {
      inputRef.current.value = editorRef.current?.innerHTML || "";
    }
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
      </div>
      <div
        ref={editorRef}
        className="min-h-[240px] w-full bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38] outline-none focus:ring-2 focus:ring-inset focus:ring-[#3b82f6]/40"
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
  return <div className="min-h-[150px] bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38]" dangerouslySetInnerHTML={{ __html: toRichTextHtml(value) }} />;
}

function QuestionTypeChip({ type, active }: { type: string; active: boolean }) {
  const meta = getQuestionTypeMeta(type);

  return (
    <span
      className={cn(
        "inline-flex h-8 min-w-16 items-center justify-center rounded border px-3 text-sm font-semibold transition",
        meta.chip,
        active ? meta.activeChip : "opacity-70"
      )}
    >
      {meta.label}
    </span>
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
  return type === "single_choice" || type === "multiple_choice";
}

function isEditableQuestionType(type?: string): type is EditableQuestionType {
  return type === "single_choice" || type === "multiple_choice" || type === "true_false" || type === "fill_blank";
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
  const action = editing
    ? updateQuestionBankQuestion
    : type === "single_choice"
      ? createQuestionBankSingleChoiceQuestion
      : createQuestionBankMultipleChoiceQuestion;
  const inputType = type === "single_choice" ? "radio" : "checkbox";
  const focusColor = type === "single_choice" ? "focus:border-[#22c55e]" : "focus:border-[#3b82f6]";
  const accentColor = type === "single_choice" ? "accent-[#22c55e]" : "accent-[#3b82f6]";
  const [choiceOptionKeys, setChoiceOptionKeys] = useState(() => initialChoiceOptionKeys(question));
  const addOption = () => {
    const nextKey = nextOptionKey(choiceOptionKeys);
    if (nextKey) {
      setChoiceOptionKeys([...choiceOptionKeys, nextKey]);
    }
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
          {type === "multiple_choice" ? (
            <button className="text-xs font-bold text-[#1d4ed8] hover:text-[#0f3aa8]" type="button" onClick={addOption}>
              增加选项
            </button>
          ) : (
            <span className="text-xs font-medium text-[#60718a]">勾选正确选项</span>
          )}
        </div>
        <div className="grid gap-3 bg-[#eef3f8] p-4">
          {choiceOptionKeys.map((key) => {
            const option = question?.options.find((item) => item.key === key);
            const checked = question?.answer.includes(key) || false;
            return (
              <label key={key} className="grid min-h-[64px] grid-cols-[40px_1fr_52px] items-center gap-2">
                <input type="hidden" name="optionKey" value={key} />
                <span className="text-center text-sm font-black">({key})</span>
                <input
                  className={cn("h-12 border border-[#c6d3e6] bg-[#d9e5fb] px-3 text-sm outline-none", focusColor)}
                  name={`option${key}`}
                  defaultValue={option?.text || ""}
                  required
                />
                <span className="grid place-items-center">
                  <input
                    className={cn("size-4", accentColor)}
                    name="answer"
                    type={inputType}
                    value={key}
                    defaultChecked={checked}
                    required={type === "single_choice"}
                    aria-label={`${key}选项为正确答案`}
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
    <form id={formId} action={editing ? updateQuestionBankQuestion : createQuestionBankTrueFalseQuestion} key={question?.id || "true_false"}>
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
    <form id={formId} action={editing ? updateQuestionBankQuestion : createQuestionBankFillBlankQuestion} key={question?.id || "fill_blank"}>
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

function ReadonlyQuestionPreview({ question }: { question: QuestionRow }) {
  return (
    <>
      <EditorShell title="题干">
        <div className="min-h-[150px] bg-[#d9e5fb] px-4 py-4 text-base leading-8 text-[#071b38]">{question.title}</div>
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

export function QuestionBankDetailWorkbench({ paperId, paperTitle, ownerHref, isComputerMajor, questions }: QuestionBankDetailWorkbenchProps) {
  const [activeEditorType, setActiveEditorType] = useState<ActiveEditorType>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [columnLayout, setColumnLayout] = useState(readColumnLayout);
  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) || null;
  const selectedChoiceType = isChoiceQuestionType(selectedQuestion?.type) ? selectedQuestion.type : null;
  const selectedEditableType = isEditableQuestionType(selectedQuestion?.type) ? selectedQuestion.type : null;
  const activeType = activeEditorType || selectedQuestion?.type || "";
  const activeTypeText = questionTypeText(activeType);
  const activeDifficulty = activeEditorType ? "3星" : difficultyText(selectedQuestion?.difficulty);
  const activeFormId = activeEditorType
    ? createQuestionFormId(activeEditorType)
    : selectedQuestion && selectedEditableType
      ? editQuestionFormId(selectedQuestion.id)
      : undefined;
  const visibleTypeOrder = questionTypeOrder.filter((type) => isComputerMajor || !["true_false", "fill_blank", "comprehensive"].includes(type));
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
  const toolTypes: ToolItem[] = [
    {
      label: "单选",
      icon: CircleDot,
      tone: "normal",
      onClick: () => {
        setSelectedQuestionId(null);
        setActiveEditorType("single_choice");
      }
    },
    {
      label: "多选",
      icon: CheckSquare,
      tone: "normal",
      onClick: () => {
        setSelectedQuestionId(null);
        setActiveEditorType("multiple_choice");
      }
    },
    ...(isComputerMajor
      ? [
          {
            label: "判断",
            icon: ListChecks,
            tone: "normal" as const,
            onClick: () => {
              setSelectedQuestionId(null);
              setActiveEditorType("true_false");
            }
          },
          {
            label: "填空",
            icon: FileText,
            tone: "normal" as const,
            onClick: () => {
              setSelectedQuestionId(null);
              setActiveEditorType("fill_blank");
            }
          },
          { label: "综合", icon: Sigma, tone: "normal" as const }
        ]
      : []),
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
                    activeEditorType === "single_choice" && item.label === "单选" && "bg-[#eaf7ef] text-[#15803d]",
                    activeEditorType === "multiple_choice" && item.label === "多选" && "bg-[#eaf2ff] text-[#1d4ed8]",
                    activeEditorType === "true_false" && item.label === "判断" && "bg-[#fff7e6] text-[#b45309]",
                    activeEditorType === "fill_blank" && item.label === "填空" && "bg-[#e9fbff] text-[#0e7490]"
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
          ) : selectedQuestion && selectedChoiceType ? (
            <ChoiceQuestionForm key={`edit-${selectedQuestion.id}`} paperId={paperId} question={selectedQuestion} type={selectedChoiceType} />
          ) : selectedQuestion && selectedEditableType === "true_false" ? (
            <TrueFalseQuestionForm key={`edit-${selectedQuestion.id}`} paperId={paperId} question={selectedQuestion} />
          ) : selectedQuestion && selectedEditableType === "fill_blank" ? (
            <FillBlankQuestionForm key={`edit-${selectedQuestion.id}`} paperId={paperId} question={selectedQuestion} />
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
            <Search size={17} className="text-[#071b38]" />
          </div>
          <div className="h-[calc(100vh-70px)] overflow-auto px-2 py-1">
            {questions.length === 0 ? (
              <div className="grid h-40 place-items-center text-sm text-slate-400">暂无题目</div>
            ) : (
              questions.map((question, index) => {
                const selected = selectedQuestionId === question.id && !activeEditorType;
                const meta = getQuestionTypeMeta(question.type);
                return (
                  <div key={question.id} className="grid grid-cols-[24px_1fr] items-stretch gap-1">
                    <div className="grid place-items-center text-sm font-bold text-[#071b38]">{index + 1}</div>
                    <button
                      className={cn(
                        "mb-1 flex min-h-[48px] min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-left text-xs font-medium leading-5 transition hover:brightness-[0.98]",
                        selected ? meta.selectedRow : meta.row
                      )}
                      type="button"
                      onClick={() => {
                        setActiveEditorType(null);
                        setSelectedQuestionId(question.id);
                      }}
                    >
                      <span className={cn("min-w-0 truncate", selected && "font-black")}>{question.title}</span>
                      <span className="shrink-0 rounded border border-current bg-white/55 px-1.5 py-0.5 text-[10px] font-black">{meta.label}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
        <ResizeHandle onPointerDown={startResize("list", "attributes")} />

        <aside className="min-w-0 overflow-auto bg-white">
          <section className="border-b border-[#d7dee8]">
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
                  {visibleTypeOrder.map((type) => (
                    <QuestionTypeChip key={type} type={type} active={questionTypeText(type) === activeTypeText} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-sm font-bold">错误原因</span>
                <div className="h-9 rounded border border-[#d7dee8] bg-[#fbfcfe] px-3 py-2 text-sm text-slate-400">请输入...</div>
              </div>
            </div>
          </section>

          <section className="mt-4">
            <div className="flex h-9 items-center justify-between border-y border-[#d7dee8] bg-[#eef3f8] px-3">
              <h2 className="text-sm font-black">知识点</h2>
              <div className="flex items-center gap-3 text-sm text-[#3a74ff]">
                <span className="inline-flex items-center gap-1"><Zap size={14} />自动打标</span>
                <ChevronDown size={15} className="text-[#344054]" />
                <span className="text-[#071b38]">选择</span>
              </div>
            </div>
            <div className="p-4">
              <div className="mb-3 min-h-10 rounded border border-[#d7dee8] bg-[#fbfcfe] px-3 py-2">
                {selectedQuestion ? (
                  <span className="inline-flex items-center rounded border border-[#94c8ff] bg-[#eaf5ff] px-2 py-1 text-xs text-[#2d7de0]">
                    {selectedQuestion.knowledgePointTitle} ×
                  </span>
                ) : null}
              </div>
              <div className="rounded border border-[#d7dee8] bg-[#fbfcfe] p-4">
                {selectedQuestion ? (
                  <>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                      <ListChecks size={16} className="text-[#667085]" />
                      {selectedQuestion.chapterTitle}
                    </div>
                    <div className="ml-6 space-y-3 border-l border-[#d6dbe4] pl-4 text-sm">
                      <label className="flex items-center gap-2">
                        <span className="grid size-4 place-items-center rounded border border-[#5d80ff] bg-[#5d80ff] text-white" />
                        <span>{selectedQuestion.knowledgePointTitle}</span>
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="grid h-36 place-items-center text-sm text-slate-400">暂无知识点</div>
                )}
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
