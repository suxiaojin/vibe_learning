"use client";

import Link from "next/link";
import { ArrowUpToLine, BookOpenCheck, ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PastExamQuestionActions } from "./past-exam-question-actions";
import { RichTextContent } from "@/components/rich-text-content";
import { pastExamStorageKey } from "@/app/mock-tests/special/past-exam-list";
import { getQuestionBankTypeLabel, type QuestionBankQuestionTypeConfig } from "@/lib/question-bank-types";

type Question = { id: string; type: string; stem: string; options: unknown; answer: unknown; analysis: string; showAnalysis: boolean; showAiExplanation: boolean; score: number | null };
type Status = "correct" | "wrong" | "submitted";
type Answers = Record<string, string[]>;
type Results = Record<string, Status>;
function newRunId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function PastExamRunner({ userId, courseKey, paperId, title, questions, questionTypes }: { userId: string; courseKey: string; paperId: string; title: string; questions: Question[]; questionTypes: QuestionBankQuestionTypeConfig[] }) {
  const key = pastExamStorageKey(userId, paperId);
  const signature = useMemo(() => questions.map((q) => q.id).join("|"), [questions]);
  const [answers, setAnswers] = useState<Answers>({});
  const [results, setResults] = useState<Results>({});
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
  const groups = useMemo(() => questions.reduce<Array<{ type: string; indices: number[] }>>((all, q, i) => {
    const previous = all[all.length - 1];
    if (!previous || previous.type !== q.type) all.push({ type: q.type, indices: [i] });
    else previous.indices.push(i);
    return all;
  }, []), [questions]);
  const count = questions.filter((q) => (answers[q.id] || []).some((v) => v.trim())).length;
  const submitted = Object.keys(results).length > 0;
  const showResult = submitted && !answerView;
  useEffect(() => {
    const syncView = () => setAnswerView(new URLSearchParams(window.location.search).get("view") === "answer");
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);
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
        setAnswers(saved.answers); setResults(saved.results || {}); setPendingAnswers(saved.pendingAnswers || null); setRunId(saved.runId);
      } else setRunId(newRunId());
    } catch { setRunId(newRunId()); }
    setReady(true);
  }, [key, signature]);
  useEffect(() => {
    if (!ready || !runId) return;
    try { localStorage.setItem(key, JSON.stringify({ signature, answers, results, pendingAnswers, runId })); } catch { /* Continue even when storage is disabled. */ }
  }, [ready, key, signature, answers, results, pendingAnswers, runId]);
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
      const response = await fetch(`/api/mock-tests/past/${encodeURIComponent(paperId)}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseKey, runId, answers: frozen })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "提交失败，请重试。");
      setAnswers(payload.data.answers);
      setResults(payload.data.results);
      setPendingAnswers(null);
      try { localStorage.setItem(key, JSON.stringify({ signature, answers: payload.data.answers, results: payload.data.results, pendingAnswers: null, runId })); } catch { /* Results remain available on this page. */ }
      changeView("result");
    } catch {
      setSubmitError("提交状态暂未确认，请点击重试。系统会保留本次答案。");
    } finally { setSubmitting(false); }
  }
  return <main className="min-h-screen bg-slate-100 px-6 py-6 text-ink">
    <div className="mx-auto max-w-[1440px]">
      <header className="rounded-2xl bg-white px-8 pt-6">
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-teal" href={`/mock-tests/special?course=${courseKey}&tab=past`}><ChevronLeft size={20} aria-hidden="true" />返回</Link>
        <h1 className="pb-6 pt-3 text-center text-2xl font-bold">{showResult ? "【历年真题-试题解析】" : ""}{title}</h1>
      </header>
      <nav aria-label="题型导航" className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-7 overflow-x-auto rounded-b-2xl border-b border-slate-100 bg-white px-8">{groups.map((group, i) => <a key={i} href={`#group-${i}`} aria-current={activeGroupIndex === i ? "location" : undefined} onClick={() => setActiveGroupIndex(i)} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25 ${activeGroupIndex === i ? "border-teal text-teal" : "border-transparent text-slate-600 hover:border-teal hover:text-teal"}`}>{getQuestionBankTypeLabel(group.type, questionTypes)}</a>)}</nav>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6">
        <div className="space-y-5">{groups.map((group, groupIndex) => <section id={`group-${groupIndex}`} key={groupIndex} className="scroll-mt-20 overflow-hidden rounded-2xl bg-white">
          <h2 className="bg-orange-50 px-6 py-4 font-semibold">{getQuestionBankTypeLabel(group.type, questionTypes)} <span className="ml-2 text-sm font-normal text-slate-500">共 {group.indices.length} 题</span></h2>
          {group.indices.map((index) => { const q = questions[index]; const selected = answers[q.id] || []; const options = Array.isArray(q.options) ? q.options.filter((v): v is { key: string; text: string } => Boolean(v && typeof v === "object" && typeof v.key === "string" && typeof v.text === "string")) : []; const status = results[q.id]; return <article id={`question-${index}`} key={q.id} onClick={() => { if (!submitted) setSelectedQuestionIndex(index); }} onFocus={() => { if (!submitted) setSelectedQuestionIndex(index); }} className="scroll-mt-20 border-t border-slate-100 px-6 py-6">
            <div className="flex gap-2 text-base font-normal leading-7 text-[#111827]"><span>{index + 1}.</span><RichTextContent className="min-w-0 flex-1" value={q.stem} zoomable /></div>
            {options.length && ["single_choice", "multiple_choice", "true_false"].includes(q.type) ? <div className="mt-4 space-y-2">{options.map((option) => <label key={option.key} className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-base font-normal leading-7 text-[#111827] hover:bg-slate-50"><input className="mt-1.5 size-4 accent-teal" type={q.type === "multiple_choice" ? "checkbox" : "radio"} name={q.id} disabled={submitted || Boolean(pendingAnswers) || !ready} checked={selected.includes(option.key)} onChange={() => setAnswers((old) => ({ ...old, [q.id]: q.type === "multiple_choice" ? (selected.includes(option.key) ? selected.filter((v) => v !== option.key) : [...selected, option.key]) : [option.key] }))} /><span className="font-semibold">{option.key}.</span><RichTextContent className="min-w-0 flex-1" value={option.text} zoomable /></label>)}</div> : <textarea aria-label={`第 ${index + 1} 题答案`} className="mt-4 min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-teal focus:outline-none" disabled={submitted || Boolean(pendingAnswers) || !ready} placeholder="请输入答案" value={selected[0] || ""} onChange={(e) => setAnswers((old) => ({ ...old, [q.id]: [e.target.value] }))} />}
            {!submitted && revealedAnswers[q.id] && <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-7">参考答案：<RichTextContent className="text-teal" inline value={(Array.isArray(q.answer) ? q.answer : q.answer == null ? [] : [q.answer]).map(String).join("、") || "暂无"} zoomable /></div>}
            {showResult && <div className="mt-5 text-sm leading-7">
              <PastExamQuestionActions question={q} options={options} selected={selected} status={status} index={index} total={questions.length} title={title} paperId={paperId} courseKey={courseKey} typeLabel={getQuestionBankTypeLabel(q.type, questionTypes)} />
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2"><div>参考答案：<RichTextContent className="text-teal" inline value={(Array.isArray(q.answer) ? q.answer : q.answer == null ? [] : [q.answer]).map(String).join("、") || "暂无"} zoomable /></div><div>你的回答：<RichTextContent className={status === "correct" ? "text-teal" : status === "wrong" ? "text-red-500" : "text-slate-500"} inline value={selected.join("、") || "未作答"} zoomable /></div></div>
              {q.showAnalysis && q.analysis && <div className="mt-2">解析：<RichTextContent value={q.analysis} zoomable /></div>}
            </div>}
          </article>; })}
        </section>)}</div>
        <aside className="sticky top-20 space-y-5"><div className="rounded-2xl bg-white p-6"><div className="flex justify-between font-semibold"><span>当前所做试题</span><span>{count}/{questions.length}</span></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal" style={{ width: `${count / questions.length * 100}%` }} /></div></div>
          <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
            <div className="flex items-center justify-between bg-gradient-to-b from-emerald-50 to-white px-5 py-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpenCheck aria-hidden="true" className="text-teal" size={22} />答题卡</h2>
              <button aria-controls="past-exam-answer-card" aria-expanded={answerCardOpen} className="inline-flex items-center gap-1 rounded px-1 py-1 text-sm text-slate-500 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25" onClick={() => setAnswerCardOpen((open) => !open)} type="button">{answerCardOpen ? "收起" : "展开"}{answerCardOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
            </div>
            {answerCardOpen && <div id="past-exam-answer-card" className="px-5 pb-5">
              <div aria-label="答题卡题号" className="max-h-[min(42vh,320px)] overflow-y-auto pr-1" tabIndex={0}>
                {groups.map((group, i) => <div key={i} className="mb-5 last:mb-1"><p className="text-sm text-slate-500">{getQuestionBankTypeLabel(group.type, questionTypes)}</p><div className="mt-3 grid grid-cols-5 gap-2">{group.indices.map((index) => { const q = questions[index]; const state = showResult ? results[q.id] : undefined; const answered = (answers[q.id] || []).some((v) => v.trim()); return <a key={q.id} href={`#question-${index}`} onClick={() => setSelectedQuestionIndex(index)} aria-current={selectedQuestionIndex === index ? "location" : undefined} aria-label={`第 ${index + 1} 题${state === "correct" ? "，正确" : state === "wrong" ? "，错误" : state === "submitted" ? "，主观题，待自行对照" : answered && !showResult ? "，已答" : "，未答"}`} className={`grid size-9 place-items-center rounded-full text-sm font-semibold ${selectedQuestionIndex === index ? "ring-2 ring-teal ring-offset-2" : ""} ${state === "correct" ? "bg-teal text-white" : state === "wrong" ? "bg-red-500 text-white" : answered && !showResult ? "bg-orange-400 text-white" : "bg-slate-100 text-slate-600"}`}>{index + 1}</a>; })}</div></div>)}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600">{showResult ? <><span className="flex items-center gap-1"><i className="size-3 rounded-full bg-teal" />正确</span><span className="flex items-center gap-1"><i className="size-3 rounded-full bg-red-500" />错误</span></> : <span className="flex items-center gap-1"><i className="size-3 rounded-full bg-orange-400" />已答</span>}<span className="flex items-center gap-1"><i className="size-3 rounded-full bg-slate-300" />{showResult ? "未答 / 主观题" : "未答"}</span></div>
              {pendingAnswers && !submitted && <p role="status" className="mt-4 text-sm text-slate-500">上次提交状态尚未确认，请重试提交。</p>}
              {submitError && <p role="alert" className="mt-3 text-sm text-red-500">{submitError}</p>}
              {!submitted && <button className="mt-4 w-full rounded-lg bg-red-500 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={!ready || submitting} onClick={submitExam} type="button">{submitting ? "提交中…" : pendingAnswers ? "重试提交" : "提交"}</button>}
              {!submitted && <button className="mt-3 w-full rounded-lg bg-slate-100 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50" disabled={!ready || selectedQuestionIndex === null} onClick={() => { if (selectedQuestionIndex === null) return; const question = questions[selectedQuestionIndex]; setRevealedAnswers((current) => ({ ...current, [question.id]: true })); document.getElementById(`question-${selectedQuestionIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} type="button">答案</button>}
              {submitted && <button className="mt-3 block w-full rounded-lg bg-slate-100 px-4 py-3 text-center font-semibold text-slate-500 hover:bg-slate-200" onClick={() => changeView(showResult ? "answer" : "result")} type="button">{showResult ? "返回" : "查看解析"}</button>}
            </div>}
          </div>
        </aside>
      </div>
    </div>
    <button aria-label="回到顶部" title="回到顶部" className="fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-xl bg-white text-slate-700 shadow-lg transition hover:bg-slate-50 hover:text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button"><ArrowUpToLine size={24} aria-hidden="true" /></button>
  </main>;
}
