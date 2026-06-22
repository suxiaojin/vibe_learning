"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Flag, Loader2, Send, Share2, Star, X } from "lucide-react";
import { getQuestionBankTypeLabel } from "@/lib/question-bank-types";

type PracticeQuestion = {
  id: string;
  type: string;
  stem: string;
  options: unknown;
  answer: unknown;
  analysis: string;
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
  initialIndex,
  questions,
  sectionId,
  sectionTitle
}: {
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
  const [aiLoadingQuestionId, setAiLoadingQuestionId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const question = questions[currentIndex];
  const selected = answers[question.id] || [];
  const revealed = Boolean(revealedQuestionIds[question.id]);
  const judgedState = answerStates[question.id];
  const aiMessages = aiMessagesByQuestionId[question.id] || [];
  const aiLoading = aiLoadingQuestionId === question.id;
  const options = useMemo(() => normalizeOptions(question.options), [question.options]);
  const correctAnswer = normalizeAnswer(question.answer);
  const previousEnabled = currentIndex > 0;
  const isLastQuestion = currentIndex === questions.length - 1;
  const questionIds = useMemo(() => questions.map((item) => item.id), [questions]);
  const questionIdsSignature = useMemo(() => questionIds.join("|"), [questionIds]);
  const storageKey = useMemo(() => `vibe-special-practice:${sectionId}`, [sectionId]);

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
    if (aiMessages.length === 0 && !aiLoading) {
      void requestAiDoubt(question.id);
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
    const assistantMessageId = createClientId();
    setAiLoadingQuestionId(questionId);
    setAiMessagesByQuestionId((current) => {
      const existing = current[questionId] || [];
      const nextMessages = prompt
        ? [...existing, { id: createClientId(), role: "user" as const, content: prompt }, { id: assistantMessageId, role: "assistant" as const, content: "" }]
        : [...existing, { id: assistantMessageId, role: "assistant" as const, content: "" }];
      return { ...current, [questionId]: nextMessages };
    });

    try {
      const response = await fetch("/api/ai/question-doubt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, prompt })
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
          <header className="border-b border-slate-100 bg-white px-7 py-5">
            <p className="text-sm font-medium text-teal">专项练习</p>
            <h1 className="mt-1 text-2xl font-semibold leading-8 text-ink">{sectionTitle}</h1>
          </header>

          <article className="min-h-0 flex-1 overflow-y-auto bg-white px-7 py-8">
            <span className="inline-flex rounded-lg bg-teal/10 px-2.5 py-1.5 text-sm font-semibold text-teal">
              {formatQuestionType(question.type)}
            </span>
            <h2 className="mt-6 max-w-4xl text-lg font-semibold leading-8 text-ink">
              {currentIndex + 1}、{question.stem}
            </h2>

            {options.length > 0 ? (
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

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-teal/25 bg-teal/10 px-4 text-sm font-semibold text-teal transition hover:border-teal/40 hover:bg-teal/15" type="button" onClick={openAiDoubt}>
                <Bot size={19} />
                AI答疑
              </button>
              <div className="hidden h-px flex-1 border-t border-dashed border-slate-200 md:block" />
              <IconTextButton icon={<Share2 size={24} />} label="分享" />
              <IconTextButton icon={<Flag size={24} />} label="纠错" />
              <IconTextButton icon={<Star size={25} />} label="收藏" />
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

      <div className="mt-6 grid grid-cols-5 gap-3">
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
          <div className="mx-auto max-w-4xl space-y-6 text-base leading-8 text-ink">
            {messages.length === 0 ? (
              <p className="flex items-center gap-2 text-slate-500">
                <Loader2 className="animate-spin" size={20} />
                AI正在组织答案...
              </p>
            ) : (
              messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <p className="max-w-[78%] rounded-2xl bg-teal/10 px-5 py-3 text-base leading-7 text-ink">{message.content}</p>
                  </div>
                ) : (
                  <div key={message.id} className="rounded-2xl bg-white text-ink">
                    {message.content ? <AiAnswerText content={message.content} /> : <StreamingPlaceholder />}
                  </div>
                )
              )
            )}
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

function IconTextButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-medium text-slate-500 transition hover:text-teal" type="button">
      {icon}
      {label}
    </button>
  );
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
  const base = "grid size-10 place-items-center rounded-full text-sm font-semibold transition";
  const activeRing = active ? " ring-2 ring-offset-2 ring-teal" : "";
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
