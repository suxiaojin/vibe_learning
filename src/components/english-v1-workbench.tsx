"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowLeft, BookOpen, ClipboardCheck, FileText, Languages, ListChecks, PencilLine, SpellCheck, WholeWord } from "lucide-react";

const questionTypes = [
  { label: "阅读理解", icon: BookOpen },
  { label: "完形填空", icon: ListChecks },
  { label: "阅读理解（判断）", icon: ClipboardCheck },
  { label: "翻译选择", icon: Languages },
  { label: "选词填空", icon: WholeWord },
  { label: "英汉互译", icon: Languages },
  { label: "短文改错", icon: SpellCheck },
  { label: "写作", icon: PencilLine }
];
const minimumWidths = [120, 140, 240, 220];
const headings = ["题型", "题号", "题干", "答案"];
const optionKeys = ["A", "B", "C", "D"] as const;
const translationOptionKeys = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

type CorrectionQuestion = {
  number: number;
  answer: typeof optionKeys[number] | null;
  correction: string;
  explanation: string;
  answerIssue: string | null;
};
type CorrectionPassage = {
  number: number;
  stem: string;
  sourcePage: number | null;
  labelPage: number | null;
  stemIssue: string | null;
  questions: CorrectionQuestion[];
};
type WritingPassage = {
  number: number;
  stem: string;
  questions: { number: number; answer: string }[];
};

export type EnglishV1Sample = {
  title: string;
  revision: string;
  passages: {
    number: number;
    stem: string;
    questions: { number: number; prompt: string; options: Record<string, string>; answer?: typeof optionKeys[number] | null }[];
  }[];
  clozePassages?: {
    number: number;
    stem: string;
    questions: { number: number; options: Record<string, string>; answer?: typeof optionKeys[number] | null }[];
  }[];
  judgmentPassages?: {
    number: number;
    stem: string;
    questions: { number: number; prompt: string; options: Record<string, string>; answer?: "A" | "B" | null }[];
  }[];
  translationSections?: {
    number: number;
    title: string;
    stem: string;
    questions: { number: number; options: Record<string, string>; answer?: string | null }[];
  }[];
  correctionPassages?: CorrectionPassage[];
  writingPassages?: WritingPassage[];
};
type ReadingPassage = EnglishV1Sample["passages"][number];
type ClozePassage = NonNullable<EnglishV1Sample["clozePassages"]>[number];
type JudgmentPassage = NonNullable<EnglishV1Sample["judgmentPassages"]>[number];
type TranslationSection = NonNullable<EnglishV1Sample["translationSections"]>[number];
type EditablePassage = ReadingPassage | ClozePassage | JudgmentPassage | TranslationSection | CorrectionPassage | WritingPassage;
type EditableQuestion = EditablePassage["questions"][number];
type PassageKey = "passages" | "clozePassages" | "judgmentPassages" | "translationSections" | "correctionPassages" | "writingPassages";

function serializeStemEditor(root: HTMLElement): string {
  function visit(node: Node, underline: boolean): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = (node.textContent || "").replace(/\u00a0/g, " ").replace(/[\uE000\uE001]/g, "");
      return underline ? value.split("\n").map((part) => part ? `\uE000${part}\uE001` : "").join("\n") : value;
    }
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return "\n";
    const marked = underline || node.tagName === "U" || node.style.textDecorationLine.includes("underline");
    const children = Array.from(node.childNodes).map((child) => visit(child, marked)).join("");
    return (node.tagName === "DIV" || node.tagName === "P") ? `\n${children}` : children;
  }
  return Array.from(root.childNodes).map((node) => visit(node, false)).join("");
}

function renderStemEditor(root: HTMLElement, value: string) {
  root.replaceChildren();
  let underlined = false;
  let target: HTMLElement = root;
  for (const part of value.split(/([\uE000\uE001])/)) {
    if (part === "\uE000") {
      underlined = true;
      target = document.createElement("u");
      root.appendChild(target);
    } else if (part === "\uE001") {
      underlined = false;
      target = root;
    } else if (part) {
      (underlined ? target : root).appendChild(document.createTextNode(part));
    }
  }
}

function StemEditor({ value, onChange, disabled, editorRef, storageKey }: {
  value: string; onChange: (value: string) => void; disabled: boolean;
  editorRef: React.RefObject<HTMLDivElement | null>; storageKey: string;
}) {
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && serializeStemEditor(editor) !== value) renderStemEditor(editor, value);
  }, [value, editorRef]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const key = `english-v1-textarea-height:${storageKey}`;
    try {
      const height = Number(window.localStorage.getItem(key));
      if (Number.isFinite(height) && height > 0 && height <= 10000) editor.style.height = `${height}px`;
    } catch { /* Browser storage may be unavailable. */ }
    const observer = new ResizeObserver(() => {
      const height = Number.parseFloat(editor.style.height);
      if (!Number.isFinite(height) || height <= 0 || height > 10000) return;
      try { window.localStorage.setItem(key, String(height)); } catch { /* Ignore storage failures. */ }
    });
    observer.observe(editor);
    return () => observer.disconnect();
  }, [editorRef, storageKey]);

  return <div ref={editorRef} contentEditable={!disabled} role="textbox" aria-label="题干" aria-multiline="true"
    suppressContentEditableWarning onInput={(event) => onChange(serializeStemEditor(event.currentTarget))}
    onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); }}
    className="h-[480px] min-h-32 w-full resize-y overflow-auto whitespace-pre-wrap break-words rounded-none border border-[#c6d3e6] bg-[#d9e5fb] p-3 leading-7 outline-none focus:border-blue-500" />;
}

function ResizableTextarea({ storageKey, ...props }: ComponentProps<"textarea"> & { storageKey: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const key = `english-v1-textarea-height:${storageKey}`;
    textarea.style.height = "";
    try {
      const height = Number(window.localStorage.getItem(key));
      if (Number.isFinite(height) && height > 0 && height <= 10000) textarea.style.height = `${height}px`;
    } catch {
      // The editor remains usable if browser storage is unavailable.
    }
    const observer = new ResizeObserver(() => {
      const height = Number.parseFloat(textarea.style.height);
      if (!Number.isFinite(height) || height <= 0 || height > 10000) return;
      try {
        window.localStorage.setItem(key, String(height));
      } catch {
        // Resizing still works for the current session.
      }
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [storageKey]);

  return <textarea {...props} ref={textareaRef} />;
}

function CorrectionStemPreview({ stem }: { stem: string }) {
  const marks = [...stem.matchAll(/\[([A-D]):\s*([^\[\]\r\n]+)\]/g)];
  if (!marks.length) return null;
  return (
    <p className="mb-3 whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3" aria-label="改错题原句预览">
      {marks.map((match, index) => {
        const previous = marks[index - 1];
        const start = previous ? previous.index + previous[0].length : 0;
        return <Fragment key={match.index}>
          {stem.slice(start, match.index)}
          <span className="inline-flex items-baseline gap-1">
            <span className="rounded bg-blue-100 px-1 text-xs font-bold text-blue-800">{match[1]}</span>
            <u className="underline-offset-4">{match[2]}</u>
          </span>
        </Fragment>;
      })}
      {stem.slice(marks[marks.length - 1].index + marks[marks.length - 1][0].length)}
    </p>
  );
}

export function EnglishV1Workbench({ sample, paperId, returnHref = "/admin/question-banks", loadError }: {
  sample: EnglishV1Sample | null;
  paperId?: string;
  returnHref?: string;
  loadError?: string;
}) {
  const [draft, setDraft] = useState(sample);
  const [saved, setSaved] = useState(sample);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedType, setSelectedType] = useState(questionTypes[0].label);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const activeKey: PassageKey | null = selectedType === questionTypes[0].label ? "passages"
    : selectedType === questionTypes[1].label ? "clozePassages"
    : selectedType === questionTypes[2].label ? "judgmentPassages"
    : selectedType === questionTypes[6].label ? "correctionPassages"
    : selectedType === questionTypes[7].label ? "writingPassages"
    : [questionTypes[3].label, questionTypes[4].label, questionTypes[5].label].includes(selectedType) ? "translationSections" : null;
  const translationNumber = selectedType === questionTypes[3].label ? 1
    : selectedType === questionTypes[4].label ? 2
    : selectedType === questionTypes[5].label ? 3 : null;
  const passages: EditablePassage[] = activeKey === "translationSections"
    ? (draft?.translationSections || []).filter((section) => section.number === translationNumber)
    : activeKey ? draft?.[activeKey] || [] : [];
  const selectedPassage = passages.find((passage) => passage.number === selectedNumber);
  const savedPassage = activeKey ? saved?.[activeKey]?.find((passage) => passage.number === selectedNumber) : undefined;
  const stemDirty = Boolean(selectedPassage && savedPassage && selectedPassage.stem !== savedPassage.stem);
  const answersDirty = Boolean(selectedPassage && savedPassage &&
    JSON.stringify(selectedPassage.questions) !== JSON.stringify(savedPassage.questions));
  const anyDirty = Boolean(draft && saved && (
    JSON.stringify(draft.passages) !== JSON.stringify(saved.passages) ||
    JSON.stringify(draft.clozePassages || []) !== JSON.stringify(saved.clozePassages || []) ||
    JSON.stringify(draft.judgmentPassages || []) !== JSON.stringify(saved.judgmentPassages || []) ||
    JSON.stringify(draft.translationSections || []) !== JSON.stringify(saved.translationSections || []) ||
    JSON.stringify(draft.correctionPassages || []) !== JSON.stringify(saved.correctionPassages || []) ||
    JSON.stringify(draft.writingPassages || []) !== JSON.stringify(saved.writingPassages || [])
  ));
  const [widths, setWidths] = useState<number[] | null>(null);
  const columns = useRef<Array<HTMLElement | null>>([]);
  const stemEditorRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ index: number; startX: number; widths: number[] } | null>(null);

  function editPassage(number: number, update: (passage: EditablePassage) => EditablePassage) {
    if (!activeKey) return;
    setDraft((current) => {
      if (!current) return current;
      if (activeKey === "passages") {
        return { ...current, passages: current.passages.map((passage) =>
          passage.number === number ? update(passage) as ReadingPassage : passage) };
      }
      if (activeKey === "clozePassages") {
        return { ...current, clozePassages: (current.clozePassages || []).map((passage) =>
          passage.number === number ? update(passage) as ClozePassage : passage) };
      }
      if (activeKey === "judgmentPassages") {
        return { ...current, judgmentPassages: (current.judgmentPassages || []).map((passage) =>
          passage.number === number ? update(passage) as JudgmentPassage : passage) };
      }
      if (activeKey === "correctionPassages") {
        return { ...current, correctionPassages: (current.correctionPassages || []).map((passage) =>
          passage.number === number ? update(passage) as CorrectionPassage : passage) };
      }
      if (activeKey === "writingPassages") {
        return { ...current, writingPassages: (current.writingPassages || []).map((passage) =>
          passage.number === number ? update(passage) as WritingPassage : passage) };
      }
      return { ...current, translationSections: (current.translationSections || []).map((passage) =>
        passage.number === number ? update(passage) as TranslationSection : passage) };
    });
    setNotice("");
  }

  function editQuestion(passageNumber: number, number: number, update: (question: EditableQuestion) => EditableQuestion) {
    editPassage(passageNumber, (passage) => ({
      ...passage,
      questions: passage.questions.map((question) => question.number === number ? update(question) : question)
    }) as EditablePassage);
  }

  async function saveDraft(section: "stem" | "answers") {
    if (!draft || !saved || !selectedPassage || !savedPassage || !activeKey || saving) return;
    if (section === "stem" ? !stemDirty : !answersDirty) return;
    const targetNumber = selectedPassage.number;
    const passagesToSave = (saved[activeKey] || []).map((passage) => {
      if (passage.number !== targetNumber) return passage;
      return section === "stem"
        ? { ...passage, stem: selectedPassage.stem }
        : { ...passage, questions: selectedPassage.questions };
    });
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(paperId ? "/api/admin/question-banks/english-v1/paper" : "/api/admin/question-banks/english-v1/sample", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paperId ? {
          paperId, revision: saved.revision, group: activeKey, number: targetNumber,
          change: section === "stem"
            ? { kind: "stem", stem: selectedPassage.stem }
            : { kind: "answers", questions: selectedPassage.questions }
        } : {
          revision: saved.revision,
          passages: activeKey === "passages" ? passagesToSave : saved.passages,
          clozePassages: activeKey === "clozePassages" ? passagesToSave : saved.clozePassages,
          judgmentPassages: activeKey === "judgmentPassages" ? passagesToSave : saved.judgmentPassages,
          translationSections: activeKey === "translationSections" ? passagesToSave : saved.translationSections,
          correctionPassages: activeKey === "correctionPassages" ? passagesToSave : undefined,
          writingPassages: activeKey === "writingPassages" ? passagesToSave : undefined
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败，请重试。");
      const updated = result as EnglishV1Sample;
      if (!paperId && activeKey === "writingPassages") {
        const savedWriting = updated.writingPassages?.find((passage) => passage.number === targetNumber);
        if (!savedWriting || (section === "stem" ? savedWriting.stem !== selectedPassage.stem
          : savedWriting.questions[0]?.answer !== selectedPassage.questions[0]?.answer)) {
          throw new Error("写作保存未生效，请确认英语解析服务已更新。");
        }
      }
      const savedCorrection = updated.correctionPassages?.find((passage) => passage.number === targetNumber);
      if (!paperId && activeKey === "correctionPassages" && (!savedCorrection || (section === "stem"
        ? savedCorrection.stem !== selectedPassage.stem
        : !savedCorrection.questions.every((question, index) => {
            const draftQuestion = selectedPassage.questions[index];
            return "correction" in draftQuestion && question.answer === draftQuestion.answer &&
              question.correction === draftQuestion.correction && question.explanation === draftQuestion.explanation;
          })))) throw new Error("短文改错的保存未生效，请刷新后重试。");
      setSaved(updated);
      setDraft((current) => {
        if (!current) return current;
        const next = { ...current, revision: updated.revision };
        if (paperId) {
          const savedGroup = updated[activeKey]?.find((passage) => passage.number === targetNumber);
          const currentGroups = current[activeKey];
          if (savedGroup && currentGroups) {
            return {
              ...next,
              [activeKey]: currentGroups.map((passage) => passage.number !== targetNumber ? passage : {
                ...passage,
                ...(section === "stem"
                  ? { stem: savedGroup.stem, ...("stemIssue" in savedGroup ? { stemIssue: savedGroup.stemIssue } : {}) }
                  : { questions: savedGroup.questions })
              })
            };
          }
        }
        if (activeKey === "correctionPassages" && savedCorrection) {
          next.correctionPassages = current.correctionPassages?.map((passage) => {
            if (passage.number !== targetNumber) return passage;
            return section === "stem" ? { ...passage, stemIssue: savedCorrection.stemIssue }
              : { ...passage, questions: savedCorrection.questions };
          });
        }
        return next;
      });
      setNotice(section === "stem" ? "题干已保存" : "答案已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  function currentWidths() {
    return columns.current.map((column) => column?.getBoundingClientRect().width || 0);
  }
  function resize(index: number, delta: number, original: number[]) {
    const amount = Math.max(minimumWidths[index] - original[index], Math.min(delta, original[index + 1] - minimumWidths[index + 1]));
    const next = [...original];
    next[index] += amount;
    next[index + 1] -= amount;
    setWidths(next);
  }
  function startResize(event: PointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    drag.current = { index, startX: event.clientX, widths: currentWidths() };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveResize(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current) resize(drag.current.index, event.clientX - drag.current.startX, drag.current.widths);
  }
  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resize(index, event.key === "ArrowLeft" ? -10 : 10, currentWidths());
  }

  return (
    <main className="h-screen overflow-hidden bg-[#eef3f8] text-[#071b38]">
      <header className="flex h-12 items-center gap-4 border-b border-[#d7dee8] bg-white px-4">
        <Link href={returnHref} className="inline-flex items-center gap-1 text-sm text-[#0872b9] hover:underline">
          <ArrowLeft size={16} /> 返回题库
        </Link>
        <h1 className="text-sm font-bold">{paperId ? "英语 V1 题库详情页" : "英语 V1 题库详情页 · 设计预览"}</h1>
        {loadError ? <span className="text-sm text-red-700" role="alert">{loadError}</span> : null}
        {sample ? <span className="truncate text-xs text-slate-600">{sample.title}</span> : null}
        {draft ? (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="text-xs text-slate-600" role="status">{notice || (anyDirty ? "有未保存的修改" : "")}</span>
          </div>
        ) : null}
      </header>
      <div className="h-[calc(100vh-48px)] overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-[900px]">
          {headings.map((heading, index) => (
            <div className="contents" key={heading}>
              <section
                ref={(element) => { columns.current[index] = element; }}
                className="h-full min-w-0 overflow-y-auto overscroll-contain border-r border-[#d7dee8] bg-white"
                style={{ flex: widths ? `0 0 ${widths[index]}px` : ["0 0 150px", "0 0 190px", "1 0 280px", "1 0 260px"][index] }}
                aria-label={heading}
              >
                <h2 className="sticky top-0 z-10 flex h-9 items-center justify-between border-b border-[#d7dee8] bg-[#eef3f8] px-3 text-sm font-bold">
                  {heading}
                  {index === 2 && <button type="button" title="下划线" aria-label="下划线"
                    className="ml-auto mr-3 rounded px-2 py-1 font-bold underline hover:bg-white disabled:opacity-50"
                    disabled={!selectedPassage || saving}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const editor = stemEditorRef.current;
                      const selection = window.getSelection();
                      if (!editor || !selection || selection.isCollapsed || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode) || !selectedPassage) return;
                      document.execCommand("underline");
                      const stem = serializeStemEditor(editor);
                      editPassage(selectedPassage.number, (passage) => ({ ...passage, stem }));
                    }}>U</button>}
                  {(index === 2 || index === 3) && (
                    <button
                      className="rounded bg-[#1f9d8b] px-3 py-1 text-xs font-bold text-white hover:bg-[#178271] disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      disabled={!selectedPassage || saving || (index === 2 ? !stemDirty : !answersDirty)}
                      onClick={() => void saveDraft(index === 2 ? "stem" : "answers")}
                    >
                      {saving ? "保存中" : "保存"}
                    </button>
                  )}
                </h2>
                {index === 0 ? (
                  <div className="grid py-2">
                    {questionTypes.map(({ label, icon: Icon }) => (
                      <button key={label} type="button" onClick={() => { setSelectedType(label); setSelectedNumber(null); }} aria-pressed={selectedType === label}
                        className={`grid min-h-[65px] place-items-center gap-1 px-2 py-2 text-center text-xs font-medium ${selectedType === label ? "bg-[#e6efff] text-[#1d4ed8]" : "text-[#071b38] hover:bg-[#f3f7fc]"}`}>
                        <Icon size={21} />{label}
                      </button>
                    ))}
                  </div>
                ) : index === 1 && passages.length ? (
                  <div className="grid gap-1 p-2">
                    {passages.map((passage) => (
                      <button key={passage.number} type="button" onClick={() => setSelectedNumber(passage.number)}
                        aria-pressed={selectedNumber === passage.number}
                        className="min-h-10 rounded px-3 text-left text-sm font-semibold hover:bg-slate-50 aria-pressed:bg-blue-50 aria-pressed:text-blue-700">
                        {activeKey === "writingPassages" ? "Part VI" : "title" in passage ? passage.title : passage.number}
                        {"stemIssue" in passage && (passage.stemIssue || passage.questions[0]?.answerIssue) &&
                          <span className="ml-2 text-xs font-normal text-amber-800">待核对</span>}
                      </button>
                    ))}
                  </div>
                ) : index === 2 && selectedPassage ? (
                  <div className="p-4 text-sm leading-7">
                    {activeKey === "passages" && <h3 className="mb-3 font-bold">Passage {selectedPassage.number}</h3>}
                    {"stemIssue" in selectedPassage && <>
                      {selectedPassage.sourcePage && <p className="mb-2 text-xs text-slate-600">
                        真题 PDF 第 {selectedPassage.sourcePage} 页
                        {selectedPassage.labelPage && selectedPassage.labelPage !== selectedPassage.sourcePage &&
                          `，A–D 位于第 ${selectedPassage.labelPage} 页`}
                      </p>}
                      {selectedPassage.stemIssue && <p className="mb-2 text-amber-800">{selectedPassage.stemIssue}</p>}
                      <CorrectionStemPreview stem={selectedPassage.stem} />
                      <p className="mb-2 text-xs text-slate-600">用 [A: 原文] 至 [D: 原文] 标出四处下划线。</p>
                    </>}
                    <StemEditor key={`${activeKey}-${selectedPassage.number}`} editorRef={stemEditorRef} storageKey={JSON.stringify([sample?.title, activeKey, selectedPassage.number, "stem"])}
                      value={selectedPassage.stem} disabled={saving}
                      onChange={(stem) => {
                        editPassage(selectedPassage.number, (passage) => ({ ...passage, stem }));
                      }} />
                  </div>
                ) : index === 3 && selectedPassage ? (
                  <div className="divide-y divide-slate-200 px-4 text-sm leading-6">
                    {selectedPassage.questions.map((question) => (
                      <fieldset key={question.number} className="my-3 min-w-0 py-3" disabled={saving}>
                        <legend className="font-bold">{activeKey === "writingPassages" ? "参考范文" : `第 ${question.number} 题`}</legend>
                        {"prompt" in question && <ResizableTextarea storageKey={JSON.stringify([sample?.title, activeKey, selectedPassage.number, question.number, "prompt"])} aria-label={`第 ${question.number} 题题干`}
                          className="mb-2 min-h-16 w-full resize-y rounded-none border border-[#c6d3e6] bg-[#d9e5fb] p-3 outline-none focus:border-blue-500"
                          value={question.prompt} onChange={(event) => {
                            const prompt = event.target.value;
                            editQuestion(selectedPassage.number, question.number, (item) => ({ ...item, prompt }));
                          }} />}
                        {"correction" in question ? (
                          <div className="grid gap-3">
                            {question.answerIssue && <p className="text-amber-800">{question.answerIssue}</p>}
                            <fieldset className="flex flex-wrap gap-3">
                              <legend className="font-semibold">错误位置</legend>
                              {optionKeys.map((letter) => <label key={letter} className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-200 px-3 py-2">
                                <input type="radio" name={`correction-${question.number}`} className="size-4 accent-[#16a34a]"
                                  checked={question.answer === letter}
                                  onChange={() => editQuestion(selectedPassage.number, question.number, (item) => ({ ...item, answer: letter }))} />
                                {letter}
                              </label>)}
                            </fieldset>
                            <label className="grid gap-1 font-semibold">改正内容
                              <input type="text" className="rounded border border-[#c6d3e6] bg-[#d9e5fb] px-3 py-2 font-normal"
                                value={question.correction} onChange={(event) => {
                                  const correction = event.target.value;
                                  editQuestion(selectedPassage.number, question.number, (item) => ({ ...item, correction }));
                                }} />
                            </label>
                            <label className="grid gap-1 font-semibold">解析
                              <ResizableTextarea storageKey={JSON.stringify([sample?.title, activeKey, selectedPassage.number, question.number, "explanation"])} className="min-h-24 resize-y rounded border border-[#c6d3e6] bg-[#d9e5fb] p-3 font-normal"
                                value={question.explanation} onChange={(event) => {
                                  const explanation = event.target.value;
                                  editQuestion(selectedPassage.number, question.number, (item) => ({ ...item, explanation }));
                                }} />
                            </label>
                          </div>
                        ) : !("options" in question) || (activeKey === "translationSections" && selectedPassage.number === 3) ? (
                          <ResizableTextarea storageKey={JSON.stringify([sample?.title, activeKey, selectedPassage.number, question.number, "answer"])} aria-label={activeKey === "writingPassages" ? "写作参考答案" : `第 ${question.number} 题参考答案`}
                            className={`${activeKey === "writingPassages" ? "min-h-80" : "min-h-24"} w-full resize-y border border-[#c6d3e6] bg-[#d9e5fb] p-3 outline-none focus:border-blue-500`}
                            value={question.answer || ""} onChange={(event) => {
                              const answer = event.target.value;
                              editQuestion(selectedPassage.number, question.number, (item) => "correction" in item ? item : { ...item, answer });
                            }} />
                        ) : <>
                        <div className="flex h-10 items-center border-b border-[#d4dae4] bg-[#eef3f9] px-3 font-bold">{activeKey === "judgmentPassages" ? "判断选项" : "选择题选项"}</div>
                        <div className="grid gap-3 bg-[#eef3f8] p-3">
                          {(activeKey === "judgmentPassages" ? optionKeys.slice(0, 2) : activeKey === "translationSections" && selectedPassage.number === 2 ? translationOptionKeys : optionKeys).map((letter) => (
                            <div key={letter} className="grid min-h-12 grid-cols-[40px_minmax(0,1fr)_32px] items-center gap-2">
                              <span className="grid h-10 place-items-center border border-[#c6d3e6] bg-white font-black">{letter}</span>
                              <ResizableTextarea storageKey={JSON.stringify([sample?.title, activeKey, selectedPassage.number, question.number, "option", letter])} aria-label={`第 ${question.number} 题选项 ${letter}`}
                                className="h-12 min-h-10 w-full resize-y rounded-none border border-[#c6d3e6] bg-[#d9e5fb] p-2 outline-none focus:border-blue-500"
                                value={activeKey === "judgmentPassages" && question.options[letter] === "正确" ? "True" : activeKey === "judgmentPassages" && question.options[letter] === "错误" ? "False" : question.options[letter]} onChange={(event) => {
                                  const text = event.target.value;
                                  editQuestion(selectedPassage.number, question.number, (item) => "options" in item ? {
                                    ...item,
                                    options: { ...item.options, [letter]: text }
                                  } : item);
                                }} />
                              <label className="grid h-10 cursor-pointer place-items-center">
                                <input type="radio" name={`reading-${selectedPassage.number}-${question.number}`}
                                  className="size-4 accent-[#16a34a]" checked={question.answer === letter}
                                  aria-label={`第 ${question.number} 题选择 ${letter} 为正确答案`}
                                  onChange={() => editQuestion(selectedPassage.number, question.number, (item) => "options" in item ? { ...item, answer: letter } : item)} />
                              </label>
                            </div>
                          ))}
                        </div>
                        </>}
                      </fieldset>
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-48 place-items-center px-4 text-center text-sm text-[#94a3b8]">
                    {index === 1 ? <span>暂无{selectedType}题目</span> : <span className="grid justify-items-center gap-2"><FileText size={22} />选择题目后查看{heading}</span>}
                  </div>
                )}
              </section>
              {index < headings.length - 1 && (
                <button type="button" aria-label={`调整${heading}和${headings[index + 1]}栏宽度`} title="拖动或使用左右方向键调整宽度"
                  className="w-1.5 shrink-0 cursor-col-resize touch-none bg-[#d7dee8] hover:bg-[#93a8c5] focus-visible:bg-[#5d80ff]"
                  onPointerDown={(event) => startResize(event, index)} onPointerMove={moveResize}
                  onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
                  onKeyDown={(event) => resizeWithKeyboard(event, index)} />
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
