"use client";

import Link from "next/link";
import { ArrowUpToLine, BookOpenCheck, ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";
import { PastExamQuestionActions } from "./past-exam-question-actions";
import { RichTextContent } from "@/components/rich-text-content";
import { pastExamStorageKey } from "@/app/mock-tests/special/past-exam-list";
import { getQuestionBankTypeLabel, type QuestionBankQuestionTypeConfig } from "@/lib/question-bank-types";

type Question = { id: string; type: string; stem: string; options: unknown; answer: unknown; analysis: string; showAnalysis: boolean; showAiExplanation: boolean; score: number | null; section?: string; number?: number; material?: string; wordBank?: "start" | "continuation" };
type Status = "correct" | "wrong" | "submitted";
type Answers = Record<string, string[]>;
type Results = Record<string, Status>;
type References = Record<string, { answer: string; analysis: string }>;

function readCorrectionAnswer(values: string[] = []): [position: string, correction: string] {
  return values.length === 2 ? [values[0], values[1]] : ["", values[0] ?? ""];
}

function groupByMaterial(indices: number[], questions: Question[]) {
  const groups: Array<{ material?: string; indices: number[] }> = [];
  for (const index of indices) {
    const material = questions[index].material;
    if (!groups.length || material) groups.push({ material, indices: [] });
    groups[groups.length - 1].indices.push(index);
  }
  return groups;
}

function newRunId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function PastExamRunner({ userId, courseKey, paperId, title, questions, questionTypes, englishExam }: { userId: string; courseKey: string; paperId: string; title: string; questions: Question[]; questionTypes: QuestionBankQuestionTypeConfig[]; englishExam?: { backHref: string; sections: Array<{ key: string; label: string }> } }) {
  const key = pastExamStorageKey(userId, paperId, Boolean(englishExam));
  const signature = useMemo(() => questions.map((q) => q.id).join("|"), [questions]);
  const [answers, setAnswers] = useState<Answers>({});
  const [results, setResults] = useState<Results>({});
  const [references, setReferences] = useState<References>({});
  const [pendingAnswers, setPendingAnswers] = useState<Answers | null>(null);
  const [runId, setRunId] = useState("");
  const [ready, setReady] = useState(false);
  const [answerCardOpen, setAnswerCardOpen] = useState(true);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [answerView, setAnswerView] = useState(false);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    if (englishExam) {
      return englishExam.sections.map(({ key, label }) => ({
        label,
        indices: questions.flatMap((question, index) => question.section === key ? [index] : [])
      }));
    }
    const groups: Array<{ type: string; label: string; indices: number[] }> = [];
    questions.forEach((question, index) => {
      const previous = groups.at(-1);
      if (previous?.type === question.type) previous.indices.push(index);
      else groups.push({ type: question.type, label: getQuestionBankTypeLabel(question.type, questionTypes), indices: [index] });
    });
    return groups;
  }, [englishExam, questions, questionTypes]);
  const count = questions.filter((q) => (answers[q.id] || []).some((v) => v.trim())).length;
  const submitted = Object.keys(results).length > 0;
  const showResult = submitted && !answerView;
  useEffect(() => {
    const syncView = () => setAnswerView(new URLSearchParams(window.location.search).get("view") === "answer");
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);
  function jumpToQuestion(event: MouseEvent<HTMLAnchorElement>, index: number) {
    setSelectedQuestionIndex(index);
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const question = document.getElementById(`question-${index}`);
    const panel = question?.closest<HTMLElement>("[data-material-questions]");
    const group = panel?.parentElement;
    if (!question || !panel || !group) return;

    event.preventDefault();
    panel.scrollTop += question.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    if (group.offsetHeight + 80 <= window.innerHeight) {
      group.scrollIntoView({ block: "start" });
    } else {
      panel.scrollIntoView({ block: "end" });
    }
    if (window.location.hash !== event.currentTarget.hash) {
      window.history.pushState(null, "", event.currentTarget.hash);
    }
  }

  function changeView(view: "answer" | "result") {
    setAnswerView(view === "answer");
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.hash = "";
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    function updateActiveGroup() {
      let current = 0;
      for (let index = 0; index < groups.length; index++) {
        const section = document.getElementById(`group-${index}`);
        if (section && section.getBoundingClientRect().top <= 96) current = index;
      }
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = Math.max(0, groups.length - 1);
      }
      setActiveGroupIndex(current);
    }
    updateActiveGroup();
    window.addEventListener("scroll", updateActiveGroup, { passive: true });
    return () => window.removeEventListener("scroll", updateActiveGroup);
  }, [groups]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved?.signature === signature && saved.answers && typeof saved.answers === "object" && /^[a-f0-9]{32}$/i.test(saved.runId)) {
        setAnswers(saved.answers);
        setResults(saved.results || {});
        setPendingAnswers(saved.pendingAnswers || null);
        setReferences(saved.references || {});
        setRunId(saved.runId);
      } else setRunId(newRunId());
    } catch { setRunId(newRunId()); }
    setReady(true);
  }, [key, signature]);
  useEffect(() => {
    if (!ready || !runId) return;
    try { localStorage.setItem(key, JSON.stringify({ signature, answers, results, pendingAnswers, references, runId })); } catch { /* Continue even when storage is disabled. */ }
  }, [ready, key, signature, answers, results, pendingAnswers, references, runId]);
  const isEnglishExam = Boolean(englishExam);
  useEffect(() => {
    if (!isEnglishExam || !submitted || !runId) return;
    const controller = new AbortController();
    async function refreshCorrectionAnalyses() {
      try {
        const response = await fetch(`/api/course-center/english-past-exams/${encodeURIComponent(paperId)}/attempts?runId=${encodeURIComponent(runId)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (!payload.ok || !payload.data?.analyses || typeof payload.data.analyses !== "object") return;
        setReferences((current) => {
          const next = { ...current };
          for (const [id, analysis] of Object.entries(payload.data.analyses)) {
            if (typeof analysis === "string" && current[id]) next[id] = { ...current[id], analysis };
          }
          return next;
        });
      } catch {
        // Keep the saved result available when the analysis refresh fails.
      }
    }
    void refreshCorrectionAnalyses();
    return () => controller.abort();
  }, [isEnglishExam, submitted, runId, paperId]);
  function updateCorrectionAnswer(questionId: string, field: 0 | 1, value: string) {
    setAnswers((old) => {
      const next = readCorrectionAnswer(old[questionId]);
      next[field] = value;
      return { ...old, [questionId]: next };
    });
  }

  async function submitExam() {
    const frozen = pendingAnswers || answers;
    if (!questions.some((q) => (frozen[q.id] || []).some((value) => value.trim()))) {
      setSubmitError("请至少回答一道题后再提交。");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    setPendingAnswers(frozen);
    try {
      localStorage.setItem(key, JSON.stringify({ signature, answers: frozen, results, pendingAnswers: frozen, runId }));
    } catch { /* The current page still retains the submission for retry. */ }
    try {
      const endpoint = englishExam ? "/api/course-center/english-past-exams" : "/api/mock-tests/past";
      const response = await fetch(`${endpoint}/${encodeURIComponent(paperId)}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseKey, runId, answers: frozen })
      });
      const payload = await response.json();
      if (englishExam && [400, 404, 422].includes(response.status)) {
        setPendingAnswers(null);
        setSubmitError(payload.error?.message || "答卷未提交，请检查后重试。");
        return;
      }
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "提交失败，请重试。");
      setAnswers(payload.data.answers);
      setResults(payload.data.results);
      const submittedReferences = payload.data.references ?? {};
      setReferences(submittedReferences);
      setPendingAnswers(null);
      try { localStorage.setItem(key, JSON.stringify({ signature, answers: payload.data.answers, results: payload.data.results, pendingAnswers: null, references: submittedReferences, runId })); } catch { /* Results remain available on this page. */ }
      changeView("result");
    } catch {
      setSubmitError("提交状态暂未确认，请点击重试。系统会保留本次答案。");
    } finally { setSubmitting(false); }
  }
  return <main className="min-h-screen bg-slate-100 px-6 py-6 text-ink">
    <div className="mx-auto max-w-[1440px]">
      <header className="rounded-2xl bg-white px-8 pt-6">
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-teal" href={englishExam?.backHref ?? `/mock-tests/special?course=${courseKey}&tab=past`}><ChevronLeft size={20} aria-hidden="true" />返回</Link>
        <h1 className="pb-6 pt-3 text-center text-2xl font-bold">{showResult ? "【历年真题-试题解析】" : ""}{title}</h1>
      </header>
      <nav aria-label="题型导航" className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-7 overflow-x-auto rounded-b-2xl border-b border-slate-100 bg-white px-8">{groups.map((group, i) => <a key={i} href={`#group-${i}`} aria-current={activeGroupIndex === i ? "location" : undefined} onClick={() => setActiveGroupIndex(i)} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25 ${activeGroupIndex === i ? "border-teal text-teal" : "border-transparent text-slate-600 hover:border-teal hover:text-teal"}`}>{group.label}</a>)}</nav>
      <div className={`mt-6 grid items-start gap-6 ${englishExam ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-[minmax(0,1fr)_300px]"}`}>
        <div className="min-w-0 space-y-5">{groups.map((group, groupIndex) => {
          const section = questions[group.indices[0]]?.section;
          const separateMaterials = Boolean(englishExam && section && ["reading", "cloze", "judgment"].includes(section));
          const materialGroups = separateMaterials ? groupByMaterial(group.indices, questions) : [{ indices: group.indices, material: undefined }];
          return <section id={`group-${groupIndex}`} key={groupIndex} className={`scroll-mt-20 overflow-hidden rounded-2xl bg-white ${group.indices.some((index) => questions[index].wordBank) ? "grid grid-cols-5" : ""}`}>
          <h2 className="col-span-full rounded-t-2xl bg-orange-50 px-6 py-4 font-semibold">{group.label}{!englishExam && <> <span className="ml-2 text-sm font-normal text-slate-500">共 {group.indices.length} 题</span></>}</h2>
          {materialGroups.map((materialGroup, materialIndex) => <div key={materialIndex} className={materialGroup.material ? "scroll-mt-20" : "contents"}>
          {materialGroup.material && <div className="border-t border-slate-100 px-6 py-4">
            <RichTextContent className="rounded-xl bg-slate-50 px-4 py-4 leading-7 text-slate-700" value={materialGroup.material} zoomable />
          </div>}
          <div
            data-material-questions={materialGroup.material ? "" : undefined}
            role={materialGroup.material ? "region" : undefined}
            aria-label={materialGroup.material ? `${group.label}题目` : undefined}
            tabIndex={materialGroup.material ? 0 : undefined}
            className={materialGroup.material ? "max-h-[min(45vh,26rem)] overflow-y-auto overscroll-y-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal" : "contents"}
          >
          {materialGroup.indices.map((index) => {
            const q = questions[index];
            const selected = answers[q.id] || [];
            const options = Array.isArray(q.options) ? q.options.filter((v): v is { key: string; text: string } => Boolean(v && typeof v === "object" && typeof v.key === "string" && typeof v.text === "string")) : [];
            const status = results[q.id];
            const isCorrection = englishExam && q.section === "correction";
            const [errorPosition, correction] = isCorrection ? readCorrectionAnswer(selected) : ["", ""];
            const reference = references[q.id];
            const answerColor = status === "correct" ? "text-teal" : status === "wrong" ? "text-red-500" : "text-slate-500";
            const selectedText = isCorrection ? [errorPosition, correction].filter(Boolean).join(". ") : selected.join("、");
            const resultDetails = showResult && <div className="mt-5 text-sm leading-7">
              {englishExam ? <>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div>参考答案：<span className="whitespace-pre-wrap break-words text-teal">{reference?.answer || "暂无"}</span></div>
                  {q.section !== "translation" && q.section !== "writing" && (
                    <div>你的回答：<span className={`whitespace-pre-wrap break-words ${answerColor}`}>{selectedText || "未作答"}</span></div>
                  )}
                </div>
                {reference?.analysis && <div className="mt-2 whitespace-pre-wrap break-words">解析：{reference.analysis}</div>}
              </> : <>
                <PastExamQuestionActions
                  question={q} options={options} selected={selected} status={status}
                  index={index} total={questions.length} title={title} paperId={paperId} courseKey={courseKey} typeLabel={group.label}
                />
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2"><div>参考答案：<RichTextContent className="text-teal" inline value={(Array.isArray(q.answer) ? q.answer : q.answer == null ? [] : [q.answer]).map(String).join("、") || "暂无"} zoomable /></div><div>你的回答：<RichTextContent className={answerColor} inline value={selectedText || "未作答"} zoomable /></div></div>
                {q.showAnalysis && q.analysis && <div className="mt-2">解析：<RichTextContent value={q.analysis} zoomable /></div>}
              </>}
            </div>;

            if (q.wordBank) {
              const number = q.number ?? index + 1;
              const selectId = `word-selection-${index}`;
              return <Fragment key={q.id}>
                {q.wordBank === "start" && <div className="col-span-full border-t border-slate-100 px-6 pt-6">
                  {q.material && <RichTextContent className="mb-4 rounded-xl bg-slate-50 px-4 py-4 leading-7 text-slate-700" value={q.material} zoomable />}
                  <div className="mb-3 rounded-xl border border-slate-200 px-4 py-3">
                    <p className="mb-2 text-sm font-semibold">词库</p>
                    <ul aria-label="共享词库" className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm leading-6 xl:grid-cols-4">
                      {options.map(({ key, text }) => <li key={key} className="flex gap-2">
                        <span className="shrink-0 font-semibold">{key}.</span>
                        <span className="min-w-0 break-words">{text}</span>
                      </li>)}
                    </ul>
                  </div>
                </div>}
                <div id={`question-${index}`} className={`min-w-0 scroll-mt-20 ${showResult ? "col-span-full px-6 pb-5 pt-1" : "px-1 pb-5 pt-1 sm:px-2"}`}>
                  {q.stem && <RichTextContent className="mb-2 leading-7" value={q.stem} zoomable />}
                  <div className={showResult ? "flex items-center gap-2" : "flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2"}>
                    <label htmlFor={selectId} className="shrink-0">{number}.</label>
                    <select
                      id={selectId}
                      aria-label={`第 ${number} 题答案`}
                      className="min-h-11 w-16 min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-1.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
                      disabled={submitted || Boolean(pendingAnswers) || !ready}
                      value={selected[0] || ""}
                      onFocus={() => setSelectedQuestionIndex(index)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setAnswers((old) => ({ ...old, [q.id]: value ? [value] : [] }));
                      }}
                    >
                      <option value="">—</option>
                      {options.map(({ key }) => <option key={key} value={key}>{key}</option>)}
                    </select>
                  </div>
                  {resultDetails}
                </div>
              </Fragment>;
            }

            return <article id={`question-${index}`} key={q.id} onClick={() => { if (!submitted) setSelectedQuestionIndex(index); }} onFocus={() => { if (!submitted) setSelectedQuestionIndex(index); }} className={`col-span-full border-t border-slate-100 px-6 py-6 ${materialGroup.material ? "scroll-mt-2" : "scroll-mt-20"}`}>
            {!separateMaterials && q.material && <RichTextContent className="mb-5 rounded-xl bg-slate-50 px-4 py-4 leading-7 text-slate-700" value={q.material} zoomable />}
            <div className={englishExam && q.section === "cloze" ? "flex items-start gap-2" : undefined}>
            <div className={`flex gap-2 text-base font-normal leading-7 text-[#111827] ${englishExam && q.section === "cloze" ? "py-2" : ""}`}><span>{q.number ?? index + 1}.</span>{q.stem && <RichTextContent className="min-w-0 flex-1" value={q.stem} zoomable />}</div>
            {isCorrection ? (
              <fieldset className="mt-4 grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <legend className="sr-only">第 {q.number ?? index + 1} 题答案</legend>
                <label className="grid gap-1.5 text-sm font-medium">
                  错误位置
                  <select
                    className="min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
                    disabled={submitted || Boolean(pendingAnswers) || !ready}
                    value={errorPosition}
                    onChange={(event) => updateCorrectionAnswer(q.id, 0, event.target.value)}
                  >
                    <option value="">请选择</option>
                    {["A", "B", "C", "D"].map((letter) => <option key={letter} value={letter}>{letter}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  正确答案
                  <span className="grid w-fit min-w-24 max-w-full grid-cols-[minmax(0,1fr)]">
                    <span aria-hidden="true" className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre border border-transparent px-3 text-base font-normal">
                      {correction.replace(/[\r\n]/g, "")}
                    </span>
                    <input
                      type="text"
                      size={1}
                      className="col-start-1 row-start-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
                      disabled={submitted || Boolean(pendingAnswers) || !ready}
                      value={correction}
                      onChange={(event) => updateCorrectionAnswer(q.id, 1, event.target.value)}
                    />
                  </span>
                </label>
              </fieldset>
            ) : options.length && ["single_choice", "multiple_choice", "true_false"].includes(q.type) ? <div className={englishExam && q.section === "cloze" ? "flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2" : "mt-4 space-y-2"}>{options.map((option) => <label key={option.key} className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-base font-normal leading-7 text-[#111827] hover:bg-slate-50 ${englishExam && q.section === "cloze" ? "max-w-full min-w-0" : ""}`}><input className="mt-1.5 size-4 accent-teal" type={q.type === "multiple_choice" ? "checkbox" : "radio"} name={q.id} disabled={submitted || Boolean(pendingAnswers) || !ready} checked={selected.includes(option.key)} onChange={() => setAnswers((old) => ({ ...old, [q.id]: q.type === "multiple_choice" ? (selected.includes(option.key) ? selected.filter((v) => v !== option.key) : [...selected, option.key]) : [option.key] }))} /><span className="font-semibold">{option.key}.</span><RichTextContent className="min-w-0 flex-1" value={option.text} zoomable /></label>)}</div> : <textarea aria-label={`第 ${q.number ?? index + 1} 题答案`} className="mt-4 min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-teal focus:outline-none" disabled={submitted || Boolean(pendingAnswers) || !ready} placeholder="请输入答案" value={selected[0] || ""} onChange={(e) => setAnswers((old) => ({ ...old, [q.id]: [e.target.value] }))} />}
            </div>
            {!submitted && revealedAnswers[q.id] && <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-7">参考答案：<RichTextContent className="text-teal" inline value={(Array.isArray(q.answer) ? q.answer : q.answer == null ? [] : [q.answer]).map(String).join("、") || "暂无"} zoomable /></div>}
            {resultDetails}
          </article>; })}
          </div>
          </div>)}
          {englishExam && !group.indices.length && <p className="px-6 py-6 text-sm text-slate-500">本卷暂无此题型。</p>}
        </section>; })}</div>
        <aside className={`top-20 space-y-5 ${englishExam ? "lg:sticky" : "sticky"}`}><div className="rounded-2xl bg-white p-6"><div className="flex justify-between font-semibold"><span>当前所做试题</span><span>{count}/{questions.length}</span></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal" style={{ width: `${count / questions.length * 100}%` }} /></div></div>
          <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
            <div className="flex items-center justify-between bg-gradient-to-b from-emerald-50 to-white px-5 py-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpenCheck aria-hidden="true" className="text-teal" size={22} />答题卡</h2>
              <button aria-controls="past-exam-answer-card" aria-expanded={answerCardOpen} className="inline-flex items-center gap-1 rounded px-1 py-1 text-sm text-slate-500 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25" onClick={() => setAnswerCardOpen((open) => !open)} type="button">{answerCardOpen ? "收起" : "展开"}{answerCardOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
            </div>
            {answerCardOpen && <div id="past-exam-answer-card" className="px-5 pb-5">
              <div aria-label="答题卡题号" className="max-h-[min(42vh,320px)] overflow-y-auto pr-1" tabIndex={0}>
                {groups.map((group, i) => group.indices.length > 0 && <div key={i} className="mb-5 last:mb-1"><p className="text-sm text-slate-500">{group.label}</p><div className="mt-3 grid grid-cols-5 gap-2">{group.indices.map((index) => { const q = questions[index]; const state = showResult ? results[q.id] : undefined; const answered = (answers[q.id] || []).some((v) => v.trim()); return <a key={q.id} href={`#question-${index}`} onClick={(event) => jumpToQuestion(event, index)} aria-current={selectedQuestionIndex === index ? "location" : undefined} aria-label={`第 ${q.number ?? index + 1} 题${state === "correct" ? "，正确" : state === "wrong" ? "，错误" : state === "submitted" ? "，主观题，待自行对照" : answered && !showResult ? "，已答" : "，未答"}`} className={`grid size-9 place-items-center rounded-full text-sm font-semibold ${selectedQuestionIndex === index ? "ring-2 ring-teal ring-offset-2" : ""} ${state === "correct" ? "bg-teal text-white" : state === "wrong" ? "bg-red-500 text-white" : answered && !showResult ? "bg-orange-400 text-white" : "bg-slate-100 text-slate-600"}`}>{q.number ?? index + 1}</a>; })}</div></div>)}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600">{showResult ? <><span className="flex items-center gap-1"><i className="size-3 rounded-full bg-teal" />正确</span><span className="flex items-center gap-1"><i className="size-3 rounded-full bg-red-500" />错误</span></> : <span className="flex items-center gap-1"><i className="size-3 rounded-full bg-orange-400" />已答</span>}<span className="flex items-center gap-1"><i className="size-3 rounded-full bg-slate-300" />{showResult ? "未答 / 主观题" : "未答"}</span></div>
              {pendingAnswers && !submitted && <p role="status" className="mt-4 text-sm text-slate-500">上次提交状态尚未确认，请重试提交。</p>}
              {submitError && <p role="alert" className="mt-3 text-sm text-red-500">{submitError}</p>}
              {!submitted && <button className="mt-4 w-full rounded-lg bg-red-500 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={!ready || submitting} onClick={submitExam} type="button">{submitting ? "提交中…" : pendingAnswers ? "重试提交" : "提交"}</button>}
              {!englishExam && !submitted && <button className="mt-3 w-full rounded-lg bg-slate-100 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50" disabled={!ready || selectedQuestionIndex === null} onClick={() => { if (selectedQuestionIndex === null) return; const question = questions[selectedQuestionIndex]; setRevealedAnswers((current) => ({ ...current, [question.id]: true })); document.getElementById(`question-${selectedQuestionIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} type="button">答案</button>}
              {submitted && <button className="mt-3 block w-full rounded-lg bg-slate-100 px-4 py-3 text-center font-semibold text-slate-500 hover:bg-slate-200" onClick={() => changeView(showResult ? "answer" : "result")} type="button">{showResult ? "返回" : "查看解析"}</button>}
            </div>}
          </div>
        </aside>
      </div>
    </div>
    <button aria-label="回到顶部" title="回到顶部" className="fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-xl bg-white text-slate-700 shadow-lg transition hover:bg-slate-50 hover:text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button"><ArrowUpToLine size={24} aria-hidden="true" /></button>
  </main>;
}
