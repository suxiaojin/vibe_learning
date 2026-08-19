"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Loader2, Send, X } from "lucide-react";
import { ShareToBuddyButton, type ShareCopySuggestion } from "@/components/share-to-buddy-button";
import type { BuddyShareCard } from "@/lib/buddy-share-cards";
import { getQuestionBankTypeLabel, isQuestionBankRichAnswerQuestionType } from "@/lib/question-bank-types";

type PracticeQuestion = {
  id: string;
  type: string;
  stem: string;
  options: unknown;
  answer: unknown;
  analysis: string;
  source?: string;
  questionBank?: {
    id: string;
    title: string;
    year: number | null;
    paperType: string;
  } | null;
};

type PracticeOption = {
  key: string;
  text: string;
};

type AnswerState = "unanswered" | "correct" | "wrong";

type AiMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  exchangeId?: string;
};

type AiFollowUpExchange = {
  id: string;
  question: string;
  answer: string;
};

type StoredPracticeState = {
  questionIdsSignature?: string;
  currentIndex?: number;
  answers?: unknown;
  answerStates?: unknown;
  revealedQuestionIds?: unknown;
};

type HydratedPracticeState = {
  currentIndex: number;
  answers: Record<string, string[]>;
  answerStates: Record<string, AnswerState>;
  revealedQuestionIds: Record<string, boolean>;
};

export function SpecialPracticeRunner({
  courseKey,
  initialIndex,
  questions,
  sectionId,
  sectionTitle
}: {
  courseKey: "public_subject" | "major";
  initialIndex: number;
  questions: PracticeQuestion[];
  sectionId: string;
  sectionTitle: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [answerStates, setAnswerStates] = useState<Record<string, AnswerState>>({});
  const [revealedQuestionIds, setRevealedQuestionIds] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiMessagesByQuestionId, setAiMessagesByQuestionId] = useState<Record<string, AiMessage[]>>({});
  const [aiHistoryLoadedByQuestionId, setAiHistoryLoadedByQuestionId] = useState<Record<string, boolean>>({});
  const [aiLoadingQuestionId, setAiLoadingQuestionId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const question = questions[currentIndex];
  const selected = answers[question.id] || [];
  const revealed = Boolean(revealedQuestionIds[question.id]);
  const judgedState = answerStates[question.id];
  const aiMessages = aiMessagesByQuestionId[question.id] || [];
  const aiLoading = aiLoadingQuestionId === question.id;
  const options = useMemo(() => normalizeOptions(question.options), [question.options]);
  const hasTextAnswer = question.type === "fill_blank" || isQuestionBankRichAnswerQuestionType(question.type);
  const correctAnswer = normalizeAnswer(question.answer);
  const previousEnabled = currentIndex > 0;
  const isLastQuestion = currentIndex === questions.length - 1;
  const questionIds = useMemo(() => questions.map((item) => item.id), [questions]);
  const questionIdsSignature = useMemo(() => questionIds.join("|"), [questionIds]);
  const storageKey = useMemo(() => `vibe-special-practice:${sectionId}`, [sectionId]);
  const questionTypeLabel = formatQuestionType(question.type);
  const shareShowsAnswer = Boolean(judgedState || revealed);
  const shareWasCorrect = shareShowsAnswer && isAnswerCorrect(selected, correctAnswer);
  const questionShareCard = buildQuestionShareCard({
    correctAnswer: shareShowsAnswer ? correctAnswer : ["答题后显示"],
    currentIndex,
    options,
    questionTypeLabel,
    selected,
    sourceTitle: question.questionBank?.title || question.source || sectionTitle,
    stem: question.stem,
    totalQuestions: questions.length,
    wasCorrect: shareWasCorrect
  });
  const questionShareContent = shareWasCorrect ? "这道题我做对了，考点挺典型。" : "这道题我想听听大家怎么理解。";
  const questionShareSuggestions = getQuestionShareSuggestions(shareWasCorrect);

  useEffect(() => {
    try {
      const stored = readStoredPracticeState(storageKey, questionIds, questionIdsSignature, initialIndex);
      if (stored) {
        setAnswers(stored.answers);
        setAnswerStates(stored.answerStates);
        setRevealedQuestionIds(stored.revealedQuestionIds);
        setCurrentIndex(stored.currentIndex);
      } else {
        setCurrentIndex(initialIndex);
      }
    } finally {
      setHydrated(true);
    }
  }, [initialIndex, questionIds, questionIdsSignature, storageKey]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          questionIdsSignature,
          currentIndex,
          answers,
          answerStates,
          revealedQuestionIds
        })
      );
    } catch {
      // Local practice progress is a convenience cache; blocked storage should not break answering.
    }
  }, [answerStates, answers, currentIndex, hydrated, questionIdsSignature, revealedQuestionIds, storageKey]);

  function selectOption(optionKey: string) {
    if (revealed || judgedState) {
      return;
    }

    setAnswers((current) => {
      const previous = current[question.id] || [];
      if (question.type === "multiple_choice") {
        const next = previous.includes(optionKey) ? previous.filter((item) => item !== optionKey) : [...previous, optionKey];
        return { ...current, [question.id]: next };
      }
      return { ...current, [question.id]: [optionKey] };
    });
  }

  function updateTextAnswer(value: string) {
    if (revealed || judgedState) {
      return;
    }

    setAnswers((current) => ({ ...current, [question.id]: value.trim() ? [value] : [] }));
  }

  function toggleAnswer() {
    if (!revealed) {
      judgeCurrentQuestion({ markUnansweredWrong: true });
    }
    setRevealedQuestionIds((current) => ({ ...current, [question.id]: !current[question.id] }));
  }

  function judgeCurrentQuestion({ markUnansweredWrong }: { markUnansweredWrong: boolean }) {
    if (answerStates[question.id]) {
      return;
    }
    if (selected.length === 0 && !markUnansweredWrong) {
      return;
    }

    const status = isAnswerCorrect(selected, correctAnswer) ? "correct" : "wrong";
    setAnswerStates((current) => (current[question.id] ? current : { ...current, [question.id]: status }));
  }

  function goToPreviousQuestion() {
    if (!previousEnabled) {
      return;
    }
    judgeCurrentQuestion({ markUnansweredWrong: false });
    setCurrentIndex((value) => value - 1);
  }

  function goToQuestion(index: number) {
    if (index !== currentIndex) {
      judgeCurrentQuestion({ markUnansweredWrong: false });
    }
    setCurrentIndex(index);
  }

  function goToNextQuestion() {
    if (isLastQuestion) {
      judgeCurrentQuestion({ markUnansweredWrong: true });
      return;
    }
    judgeCurrentQuestion({ markUnansweredWrong: false });
    setCurrentIndex((value) => value + 1);
  }

  function openAiDoubt() {
    setAiDialogOpen(true);
    setFollowUpText("");
    if (!aiHistoryLoadedByQuestionId[question.id] && !aiLoading) {
      void loadAiDoubtHistory(question.id);
    }
  }

  async function loadAiDoubtHistory(questionId: string) {
    setAiLoadingQuestionId(questionId);
    let requestedDefaultAnswer = false;

    try {
      const response = await fetch(`/api/ai/question-doubt?questionId=${encodeURIComponent(questionId)}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as {
        answer?: unknown;
        error?: unknown;
        followUps?: Array<{ id?: unknown; question?: unknown; answer?: unknown }>;
      } | null;

      if (!response.ok) {
        throw new Error(String(payload?.error || "AI 答疑记录加载失败，请稍后重试。"));
      }

      const answer = typeof payload?.answer === "string" ? payload.answer : "";
      const followUps = (payload?.followUps || []).flatMap((exchange) => {
        return typeof exchange.id === "string" &&
          typeof exchange.question === "string" &&
          typeof exchange.answer === "string"
          ? [{ id: exchange.id, question: exchange.question, answer: exchange.answer }]
          : [];
      });
      const restoredMessages: AiMessage[] = [
        ...(answer ? [{ id: `default-${questionId}`, role: "assistant" as const, content: answer }] : []),
        ...followUps.flatMap((exchange) => [
          { id: `${exchange.id}-user`, exchangeId: exchange.id, role: "user" as const, content: exchange.question },
          { id: `${exchange.id}-assistant`, exchangeId: exchange.id, role: "assistant" as const, content: exchange.answer }
        ])
      ];

      setAiMessagesByQuestionId((current) => ({ ...current, [questionId]: restoredMessages }));
      setAiHistoryLoadedByQuestionId((current) => ({ ...current, [questionId]: true }));

      if (!answer) {
        requestedDefaultAnswer = true;
        await requestAiDoubt(questionId);
      }
    } catch (error) {
      setAiMessagesByQuestionId((current) => ({
        ...current,
        [questionId]: [
          {
            id: `history-error-${questionId}`,
            role: "assistant",
            content: error instanceof Error ? error.message : "AI 答疑记录加载失败，请稍后重试。"
          }
        ]
      }));
    } finally {
      if (!requestedDefaultAnswer) {
        setAiLoadingQuestionId((current) => (current === questionId ? null : current));
      }
    }
  }

  async function submitFollowUp() {
    const prompt = followUpText.trim();
    if (!prompt || aiLoading) {
      return;
    }
    setFollowUpText("");
    await requestAiDoubt(question.id, prompt);
  }

  async function requestAiDoubt(questionId: string, prompt?: string) {
    const exchangeId = prompt ? createClientId() : undefined;
    const assistantMessageId = createClientId();
    setAiLoadingQuestionId(questionId);
    setAiMessagesByQuestionId((current) => {
      const existing = current[questionId] || [];
      const nextMessages = prompt
        ? [
            ...existing,
            { id: `${exchangeId}-user`, exchangeId, role: "user" as const, content: prompt },
            { id: assistantMessageId, exchangeId, role: "assistant" as const, content: "" }
          ]
        : [...existing, { id: assistantMessageId, role: "assistant" as const, content: "" }];
      return { ...current, [questionId]: nextMessages };
    });

    try {
      const response = await fetch("/api/ai/question-doubt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, prompt, requestId: exchangeId })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.error || "AI 服务暂时不可用，请稍后重试。"));
      }

      if (response.headers.get("content-type")?.includes("application/json")) {
        const payload = (await response.json()) as { answer?: string };
        replaceAiMessage(questionId, assistantMessageId, payload.answer || "暂时没有生成解释，请稍后重试。");
        return;
      }

      if (!response.body) {
        throw new Error("AI 服务暂时没有返回内容。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedAnswer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        streamedAnswer += chunk;
        replaceAiMessage(questionId, assistantMessageId, streamedAnswer);
      }
    } catch (error) {
      replaceAiMessage(questionId, assistantMessageId, error instanceof Error ? error.message : "AI 服务暂时不可用，请稍后重试。");
      if (!prompt) {
        setAiHistoryLoadedByQuestionId((current) => ({ ...current, [questionId]: false }));
      }
    } finally {
      setAiLoadingQuestionId((current) => (current === questionId ? null : current));
    }
  }

  function replaceAiMessage(questionId: string, messageId: string, content: string) {
    setAiMessagesByQuestionId((current) => ({
      ...current,
      [questionId]: (current[questionId] || []).map((message) => (message.id === messageId ? { ...message, content } : message))
    }));
  }

  return (
    <main className="min-h-dvh bg-mist">
      <div className="grid min-h-dvh gap-6 px-5 py-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-[calc(100dvh-48px)] flex-col overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <header className="relative border-b border-orange-100 bg-[#fff4e3] px-7 py-7 text-center">
            <Link className="absolute left-5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-semibold text-slate-500 transition hover:bg-white/70 hover:text-teal" href={`/mock-tests/special?course=${courseKey}`}>
              <ChevronLeft size={22} />
              <span className="hidden sm:inline">返回</span>
            </Link>
            <h1 className="px-12 text-2xl font-black leading-8 text-ink">【专项练习】 {sectionTitle}</h1>
          </header>

          <article className="min-h-0 flex-1 overflow-y-auto bg-white px-7 py-8">
            <span className="inline-flex rounded-lg bg-teal/10 px-2.5 py-1.5 text-sm font-semibold text-teal">
              {questionTypeLabel}
            </span>
            <h2 className="mt-6 max-w-4xl text-lg font-semibold leading-8 text-ink">
              {currentIndex + 1}、{question.stem}
            </h2>

            {hasTextAnswer ? (
              <div className="mt-6 max-w-3xl">
                {question.type === "fill_blank" ? (
                  <input
                    aria-label="请输入答案"
                    autoComplete="off"
                    className="min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-base font-medium text-ink outline-none transition placeholder:text-slate-400 hover:border-teal/30 focus:border-teal/50 focus:bg-white focus:ring-4 focus:ring-teal/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    disabled={revealed || Boolean(judgedState)}
                    placeholder="请输入答案"
                    type="text"
                    value={selected[0] || ""}
                    onChange={(event) => updateTextAnswer(event.target.value)}
                  />
                ) : (
                  <textarea
                    aria-label="请输入你的作答"
                    className="min-h-36 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-base font-medium leading-7 text-ink outline-none transition placeholder:text-slate-400 hover:border-teal/30 focus:border-teal/50 focus:bg-white focus:ring-4 focus:ring-teal/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    disabled={revealed || Boolean(judgedState)}
                    placeholder="请输入你的作答"
                    rows={6}
                    value={selected[0] || ""}
                    onChange={(event) => updateTextAnswer(event.target.value)}
                  />
                )}
              </div>
            ) : options.length > 0 ? (
              <div className="mt-6 grid max-w-3xl gap-3">
                {options.map((option) => {
                  const selectedOption = selected.includes(option.key);
                  const correctOption =
                    (revealed && correctAnswer.includes(option.key)) ||
                    (Boolean(judgedState) && selectedOption && correctAnswer.includes(option.key));
                  const wrongOption = (revealed || Boolean(judgedState)) && selectedOption && !correctAnswer.includes(option.key);

                  return (
                    <button
                      key={`${question.id}-${option.key || option.text}`}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-left text-base font-medium leading-7 text-slate-700 transition hover:border-teal/30 hover:bg-teal/5"
                      type="button"
                      onClick={() => selectOption(option.key)}
                    >
                      <span className={optionBadgeClassName({ correctOption, selectedOption, wrongOption })}>{option.key}</span>
                      <span className="min-w-0 flex-1">{option.text}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-500">
                这道题暂无可展示选项，后续答题功能会按题型处理。
              </div>
            )}

            <div className="mt-8 flex max-w-3xl flex-wrap items-center justify-end gap-5">
              <div className="hidden h-px flex-1 border-t border-dashed border-slate-200 md:block" />
              <button className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-medium text-violet-600 transition hover:text-violet-700" type="button" onClick={openAiDoubt}>
                <Bot size={22} />
                AI答疑
              </button>
              <ShareToBuddyButton
                buttonClassName="!min-h-10 !rounded-lg !border-0 !bg-transparent !px-1 !py-0 !font-medium !text-slate-500 hover:!border-transparent hover:!bg-transparent hover:!text-teal disabled:!border-0"
                buttonIconSize={24}
                buttonLabel="分享"
                contentSuggestions={questionShareSuggestions}
                copyContext={shareWasCorrect ? "question_correct" : "question_wrong"}
                defaultContent={questionShareContent}
                shareCard={questionShareCard}
                sourceLabel={`题 ${currentIndex + 1} / ${questions.length}`}
              />
            </div>

            {revealed ? (
              <section className="mt-5 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 text-sm leading-7 text-ink">
                <p>
                  <span className="font-semibold">参考答案：</span>
                  <span className="ml-2 font-semibold text-teal">{answerText(correctAnswer) || "暂无"}</span>
                </p>
                <p className="mt-3">
                  <span className="font-semibold">文字解析：</span>
                  <span className="text-slate-600">{question.analysis || "暂无解析。"}</span>
                </p>
              </section>
            ) : null}
          </article>

          <footer className="grid min-h-16 grid-cols-3 items-center border-t border-slate-200 bg-white px-7 text-[15px] font-semibold">
            <button
              className={previousEnabled ? "inline-flex items-center gap-1 text-slate-600 transition hover:text-teal" : "inline-flex cursor-not-allowed items-center gap-1 text-slate-300"}
              disabled={!previousEnabled}
              type="button"
              onClick={goToPreviousQuestion}
            >
              <ChevronLeft size={22} />
              上一题
            </button>
            <button className="inline-flex items-center gap-1 justify-self-center text-ink transition hover:text-teal" type="button" onClick={toggleAnswer}>
              {revealed ? "收起答案/解析" : "查看答案/解析"}
              <ChevronDown className={revealed ? "rotate-180 transition" : "transition"} size={20} />
            </button>
            <button
              className="inline-flex items-center gap-1 justify-self-end text-ink transition hover:text-teal"
              type="button"
              onClick={goToNextQuestion}
            >
              {isLastQuestion ? "完成" : "下一题"}
              {isLastQuestion ? null : <ChevronRight size={22} />}
            </button>
          </footer>
        </section>

        <AnswerCard
          answerStates={answerStates}
          currentIndex={currentIndex}
          questions={questions}
          setCurrentIndex={goToQuestion}
        />
      </div>
      {aiDialogOpen ? (
        <AiDoubtDialog
          followUpText={followUpText}
          loading={aiLoading}
          messages={aiMessages}
          onChangeFollowUp={setFollowUpText}
          onClose={() => setAiDialogOpen(false)}
          onSubmitFollowUp={submitFollowUp}
        />
      ) : null}
    </main>
  );
}

function AnswerCard({
  answerStates,
  currentIndex,
  questions,
  setCurrentIndex
}: {
  answerStates: Record<string, AnswerState>;
  currentIndex: number;
  questions: PracticeQuestion[];
  setCurrentIndex: (index: number) => void;
}) {
  const visibleQuestions = questions.slice(0, 50);

  return (
    <aside className="self-start rounded-[22px] border border-slate-200/80 bg-white px-5 py-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-teal" size={28} />
          <h2 className="text-xl font-semibold text-ink">答题卡</h2>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-5 gap-2.5">
        {visibleQuestions.map((question, index) => {
          const state = answerStates[question.id] || "unanswered";
          return (
            <button
              key={question.id}
              className={answerCardButtonClassName({ active: index === currentIndex, state })}
              type="button"
              onClick={() => setCurrentIndex(index)}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-slate-600">
        <LegendDot className="bg-emerald-500" label="正确" />
        <LegendDot className="bg-red-500" label="错误" />
        <LegendDot className="bg-[#d1d5db]" label="未答" />
      </div>
    </aside>
  );
}

function AiDoubtDialog({
  followUpText,
  loading,
  messages,
  onChangeFollowUp,
  onClose,
  onSubmitFollowUp
}: {
  followUpText: string;
  loading: boolean;
  messages: AiMessage[];
  onChangeFollowUp: (value: string) => void;
  onClose: () => void;
  onSubmitFollowUp: () => void;
}) {
  const initialAnswer = messages.find((message) => message.role === "assistant" && !message.exchangeId)?.content || "";
  const followUps = useMemo(() => buildAiFollowUpExchanges(messages), [messages]);
  const [expandedFollowUpIds, setExpandedFollowUpIds] = useState<string[]>([]);
  const latestMessage = messages.at(-1);
  const activeFollowUpId = loading && latestMessage?.role === "assistant"
    ? latestMessage.exchangeId || null
    : null;

  useEffect(() => {
    if (!activeFollowUpId) {
      return;
    }
    setExpandedFollowUpIds((current) => current.includes(activeFollowUpId) ? current : [...current, activeFollowUpId]);
  }, [activeFollowUpId]);

  function toggleFollowUp(exchangeId: string) {
    setExpandedFollowUpIds((current) => {
      return current.includes(exchangeId)
        ? current.filter((id) => id !== exchangeId)
        : [...current, exchangeId];
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-5 py-6">
      <section className="flex h-[min(900px,calc(100dvh-48px))] w-full max-w-5xl flex-col overflow-hidden rounded-[22px] bg-white shadow-2xl">
        <header className="relative bg-teal/5 px-16 py-5 text-center">
          <h2 className="text-2xl font-semibold text-ink">AI答疑</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">内容由AI生成</p>
          <button
            aria-label="关闭"
            className="absolute right-7 top-6 grid size-9 place-items-center rounded-full text-slate-600 transition hover:bg-white"
            type="button"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-10 py-8">
          <div className="mx-auto max-w-4xl text-base leading-8 text-ink">
            {!initialAnswer && followUps.length === 0 ? (
              <p className="flex items-center gap-2 text-slate-500">
                {loading ? <Loader2 className="animate-spin" size={20} /> : null}
                {loading ? "AI正在组织答案..." : "暂时没有可展示的答疑内容。"}
              </p>
            ) : null}

            {initialAnswer ? (
              <section aria-label="AI答疑">
                <div className="rounded-2xl bg-white text-ink">
                  <AiAnswerText content={initialAnswer} />
                </div>
              </section>
            ) : null}

            {followUps.length > 0 ? (
              <div className={`${initialAnswer ? "mt-6 border-t border-slate-200 pt-6" : ""} space-y-3`}>
                {followUps.map((exchange) => {
                  const expanded = expandedFollowUpIds.includes(exchange.id);
                  const answerId = `special-follow-up-answer-${exchange.id}`;
                  const title = exchange.question;

                  return (
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" key={exchange.id}>
                      <button
                        aria-controls={answerId}
                        aria-expanded={expanded}
                        className="flex min-h-11 w-full cursor-pointer items-center gap-3 bg-sky-50 px-4 py-2 text-left transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-inset"
                        title={title}
                        type="button"
                        onClick={() => toggleFollowUp(exchange.id)}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{title}</span>
                        <ChevronRight
                          aria-hidden="true"
                          className={`shrink-0 text-slate-500 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
                          size={18}
                        />
                      </button>
                      {expanded ? (
                        <div className="border-t border-slate-200 p-4" id={answerId}>
                          {exchange.answer ? <AiAnswerText content={exchange.answer} /> : null}
                          {loading && exchange.id === activeFollowUpId ? (
                            <p className={`${exchange.answer ? "mt-3 " : ""}flex items-center gap-2 text-sm text-slate-600`} role="status">
                              <Loader2 className="animate-spin" size={16} />
                              {exchange.answer ? "正在继续输出..." : "正在回答这个追问..."}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="border-t border-slate-100 bg-white px-8 py-6">
          <div className="mx-auto flex min-h-16 max-w-4xl items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)]">
            <input
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-slate-400"
              disabled={loading}
              maxLength={500}
              placeholder="有问题尽管问"
              value={followUpText}
              onChange={(event) => onChangeFollowUp(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmitFollowUp();
                }
              }}
            />
            <button
              aria-label="发送"
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:bg-slate-200"
              disabled={loading || !followUpText.trim()}
              type="button"
              onClick={onSubmitFollowUp}
            >
              {loading ? <Loader2 className="animate-spin" size={22} /> : <Send size={22} />}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function buildAiFollowUpExchanges(messages: AiMessage[]) {
  const exchanges = new Map<string, AiFollowUpExchange>();

  for (const message of messages) {
    if (!message.exchangeId) {
      continue;
    }
    const current = exchanges.get(message.exchangeId) || {
      id: message.exchangeId,
      question: "",
      answer: ""
    };
    if (message.role === "user") {
      current.question = message.content;
    } else {
      current.answer = message.content;
    }
    exchanges.set(message.exchangeId, current);
  }

  return [...exchanges.values()].filter((exchange) => exchange.question);
}

function StreamingPlaceholder() {
  return (
    <p className="flex items-center gap-2 text-slate-500">
      <Loader2 className="animate-spin" size={20} />
      AI正在组织答案...
    </p>
  );
}

function AiAnswerText({ content }: { content: string }) {
  const blocks = parseAiAnswerBlocks(content);

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3 key={index} className="text-lg font-semibold leading-8 text-ink">
              {renderAiInline(block.text)}
            </h3>
          );
        }
        if (block.type === "ordered") {
          return (
            <ol key={index} className="list-decimal space-y-2 pl-6">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1">
                  {renderAiInline(item)}
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === "unordered") {
          return (
            <ul key={index} className="list-disc space-y-2 pl-6">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1">
                  {renderAiInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {renderAiInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

type AiAnswerBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ordered"; items: string[] }
  | { type: "unordered"; items: string[] };

function parseAiAnswerBlocks(content: string): AiAnswerBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: AiAnswerBlock[] = [];
  let paragraph: string[] = [];
  let ordered: string[] = [];
  let unordered: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  }

  function flushLists() {
    if (ordered.length > 0) {
      blocks.push({ type: "ordered", items: ordered });
      ordered = [];
    }
    if (unordered.length > 0) {
      blocks.push({ type: "unordered", items: unordered });
      unordered = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushLists();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/) || line.match(/^(解析|解题步骤|答案|结论|具体来说)[:：]?$/);
    if (heading) {
      flushParagraph();
      flushLists();
      blocks.push({ type: "heading", text: normalizeAiMarkdownText(heading[1] || line) });
      continue;
    }

    const orderedItem = line.match(/^\d+[.)、]\s*(.+)$/);
    if (orderedItem) {
      flushParagraph();
      unordered = [];
      ordered.push(normalizeAiMarkdownText(orderedItem[1]));
      continue;
    }

    const unorderedItem = line.match(/^[-*]\s+(.+)$/);
    if (unorderedItem) {
      flushParagraph();
      ordered = [];
      unordered.push(normalizeAiMarkdownText(unorderedItem[1]));
      continue;
    }

    flushLists();
    paragraph.push(normalizeAiMarkdownText(line));
  }

  flushParagraph();
  flushLists();
  return blocks.length > 0 ? blocks : [{ type: "paragraph", text: normalizeAiMarkdownText(content) }];
}

function normalizeAiMarkdownText(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*>\s?/, "")
    .trim();
}

function renderAiInline(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }
    nodes.push(
      <strong key={`${match.index}-${match[1]}`} className="font-semibold text-ink">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [value];
}

function readStoredPracticeState(
  storageKey: string,
  questionIds: string[],
  questionIdsSignature: string,
  fallbackIndex: number
): HydratedPracticeState | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const stored = JSON.parse(raw) as StoredPracticeState;
    if (stored.questionIdsSignature !== questionIdsSignature) {
      return null;
    }

    const answers = sanitizeStoredAnswers(stored.answers, questionIds);
    const answerStates = sanitizeStoredAnswerStates(stored.answerStates, questionIds);
    const revealedQuestionIds = sanitizeStoredRevealState(stored.revealedQuestionIds, questionIds);

    return {
      currentIndex: resolveResumeIndex({
        answers,
        answerStates,
        fallbackIndex,
        questionIds,
        storedIndex: stored.currentIndex
      }),
      answers,
      answerStates,
      revealedQuestionIds
    };
  } catch {
    return null;
  }
}

function sanitizeStoredAnswers(value: unknown, questionIds: string[]) {
  const allowedIds = new Set(questionIds);
  const result: Record<string, string[]> = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }

  for (const [questionId, answer] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedIds.has(questionId) || !Array.isArray(answer)) {
      continue;
    }

    const normalizedAnswer = answer.map((item) => String(item).trim()).filter(Boolean);
    if (normalizedAnswer.length > 0) {
      result[questionId] = normalizedAnswer;
    }
  }

  return result;
}

function sanitizeStoredAnswerStates(value: unknown, questionIds: string[]) {
  const allowedIds = new Set(questionIds);
  const result: Record<string, AnswerState> = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }

  for (const [questionId, state] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedIds.has(questionId)) {
      continue;
    }
    if (state === "correct" || state === "wrong") {
      result[questionId] = state;
    }
  }

  return result;
}

function sanitizeStoredRevealState(value: unknown, questionIds: string[]) {
  const allowedIds = new Set(questionIds);
  const result: Record<string, boolean> = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }

  for (const [questionId, revealed] of Object.entries(value as Record<string, unknown>)) {
    if (allowedIds.has(questionId) && revealed === true) {
      result[questionId] = true;
    }
  }

  return result;
}

function resolveResumeIndex({
  answers,
  answerStates,
  fallbackIndex,
  questionIds,
  storedIndex
}: {
  answers: Record<string, string[]>;
  answerStates: Record<string, AnswerState>;
  fallbackIndex: number;
  questionIds: string[];
  storedIndex: number | undefined;
}) {
  const clampedStoredIndex = clampQuestionIndex(storedIndex, questionIds.length, fallbackIndex);
  const storedQuestionId = questionIds[clampedStoredIndex];
  if (storedQuestionId && !hasAttemptedQuestion(storedQuestionId, answers, answerStates)) {
    return clampedStoredIndex;
  }

  const firstUnansweredIndex = questionIds.findIndex((questionId) => !hasAttemptedQuestion(questionId, answers, answerStates));
  return firstUnansweredIndex >= 0 ? firstUnansweredIndex : clampedStoredIndex;
}

function hasAttemptedQuestion(questionId: string, answers: Record<string, string[]>, answerStates: Record<string, AnswerState>) {
  return Boolean(answerStates[questionId]) || (answers[questionId]?.length || 0) > 0;
}

function clampQuestionIndex(value: number | undefined, total: number, fallbackIndex: number) {
  const fallback = Number.isFinite(fallbackIndex) ? fallbackIndex : 0;
  const parsed = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(Math.max(Math.trunc(parsed), 0), Math.max(total - 1, 0));
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-4 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function normalizeOptions(options: unknown): PracticeOption[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => {
      if (!option || typeof option !== "object") {
        return null;
      }
      const value = option as { key?: unknown; text?: unknown };
      return {
        key: String(value.key || "").trim(),
        text: String(value.text || "").trim()
      };
    })
    .filter((option): option is PracticeOption => Boolean(option?.key || option?.text));
}

function normalizeAnswer(value: unknown) {
  const array = Array.isArray(value) ? value : [value];
  return array
    .map((item) => String(item).trim())
    .filter(Boolean)
    .sort();
}

function answerText(answer: string[]) {
  return answer.join("、");
}

function isAnswerCorrect(selected: string[], correctAnswer: string[]) {
  if (selected.length === 0) {
    return false;
  }
  return JSON.stringify([...selected].sort()) === JSON.stringify(correctAnswer);
}

function buildQuestionShareCard({
  correctAnswer,
  currentIndex,
  options,
  questionTypeLabel,
  selected,
  sourceTitle,
  stem,
  totalQuestions,
  wasCorrect
}: {
  correctAnswer: string[];
  currentIndex: number;
  options: PracticeOption[];
  questionTypeLabel: string;
  selected: string[];
  sourceTitle: string;
  stem: string;
  totalQuestions: number;
  wasCorrect: boolean;
}): BuddyShareCard {
  return {
    type: "question_card",
    correctAnswer: answerDetailText(correctAnswer, options) || "未记录",
    indexLabel: `题 ${currentIndex + 1}/${totalQuestions}`,
    questionTypeLabel,
    selectedAnswer: selected.length > 0 ? answerDetailText(selected, options) : "未答",
    sourceTitle: sourceTitle ? clipShareText(sourceTitle, 42) : undefined,
    title: clipShareText(stem, 92),
    wasCorrect
  };
}

function answerDetailText(answer: string[], options: PracticeOption[]) {
  const optionTextByKey = new Map(options.map((option) => [option.key, option.text]));
  return normalizeAnswer(answer)
    .map((item) => optionTextByKey.get(item) || item)
    .join("；");
}

function getQuestionShareSuggestions(wasCorrect: boolean): ShareCopySuggestion[] {
  if (wasCorrect) {
    return [
      { label: "考点典型", content: "这道题我做对了，考点挺典型。" },
      { label: "高频收藏", content: "刷到一道高频感很强的题，分享给大家一起记。" },
      { label: "复习提醒", content: "这个知识点容易混，顺手做个复习标记。" }
    ];
  }
  return [
    { label: "求助讨论", content: "这道题我想听听大家怎么理解。" },
    { label: "错题复盘", content: "这题踩坑了，先发出来做个错题复盘。" },
    { label: "想听思路", content: "我的思路可能偏了，有没有同学讲讲这题怎么想？" }
  ];
}

function clipShareText(value: string, maxLength: number) {
  const textValue = value.replace(/\s+/g, " ").trim();
  return textValue.length > maxLength ? `${textValue.slice(0, maxLength)}...` : textValue;
}

function optionBadgeClassName({
  correctOption,
  selectedOption,
  wrongOption
}: {
  correctOption: boolean;
  selectedOption: boolean;
  wrongOption: boolean;
}) {
  if (correctOption) {
    return "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm font-semibold text-white";
  }
  if (wrongOption) {
    return "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-red-500 text-sm font-semibold text-white";
  }
  if (selectedOption) {
    return "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-teal text-sm font-semibold text-white";
  }
  return "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500";
}

function answerCardButtonClassName({ active, state }: { active: boolean; state: AnswerState }) {
  const base = "grid size-9 place-items-center rounded-full text-xs font-semibold transition";
  const activeRing = active ? " ring-2 ring-offset-2 ring-teal/70" : "";
  if (state === "correct") {
    return `${base} bg-emerald-500 text-white${activeRing}`;
  }
  if (state === "wrong") {
    return `${base} bg-red-500 text-white${activeRing}`;
  }
  return `${base} bg-slate-100 text-slate-500 hover:bg-teal/10 hover:text-teal${activeRing}`;
}

function formatQuestionType(type: string) {
  const label = getQuestionBankTypeLabel(type);
  return label.endsWith("题") ? label : `${label}题`;
}
