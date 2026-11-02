"use client";
import { useMemo, useState, useEffect } from "react";
import { Bot, ChevronRight, Loader2, Send, X } from "lucide-react";
import type { Components } from "react-markdown";
import { ShareToBuddyButton, type ShareCopySuggestion } from "@/components/share-to-buddy-button";
import { DiamondInsufficientMessage } from "@/components/diamond-insufficient-message";
import { MathMarkdownText } from "@/components/math-markdown-text";
import { RichTextContent } from "@/components/rich-text-content";
import type { BuddyShareCard } from "@/lib/buddy-share-cards";
import { isDiamondInsufficientMessage } from "@/lib/diamond-insufficient";
type PracticeOption = {
  key: string;
  text: string;
};

type AiMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  exchangeId?: string;
  format?: "markdown" | "rich_html";
};

type AiFollowUpExchange = {
  id: string;
  question: string;
  answer: string;
};


export function PastExamQuestionActions({ question, options, selected, status, index, total, title, paperId, courseKey, typeLabel }: {
  question: { id: string; stem: string; answer: unknown; showAiExplanation: boolean };
  options: PracticeOption[]; selected: string[]; status?: string; index: number; total: number;
  title: string; paperId: string; courseKey: string; typeLabel: string;
}) {
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiMessagesByQuestionId, setAiMessagesByQuestionId] = useState<Record<string, AiMessage[]>>({});
  const [aiHistoryLoadedByQuestionId, setAiHistoryLoadedByQuestionId] = useState<Record<string, boolean>>({});
  const [aiLoadingQuestionId, setAiLoadingQuestionId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const aiMessages = aiMessagesByQuestionId[question.id] || [];
  const aiLoading = aiLoadingQuestionId === question.id;
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
      const response = await fetch(`/api/mock-tests/past/ai-doubt?questionId=${encodeURIComponent(questionId)}&paperId=${encodeURIComponent(paperId)}&courseKey=${encodeURIComponent(courseKey)}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as {
        answer?: unknown;
        answerFormat?: unknown;
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
        ...(answer ? [{
          id: `default-${questionId}`,
          role: "assistant" as const,
          content: answer,
          format: payload?.answerFormat === "rich_html" ? "rich_html" as const : "markdown" as const
        }] : []),
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
      const response = await fetch("/api/mock-tests/past/ai-doubt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, prompt, requestId: exchangeId, paperId, courseKey })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.error || "AI 服务暂时不可用，请稍后重试。"));
      }

      if (response.headers.get("content-type")?.includes("application/json")) {
        const payload = (await response.json()) as { answer?: string };
        replaceAiMessage(questionId, assistantMessageId, payload.answer || "暂时没有生成解释，请稍后重试。", "markdown");
        return;
      }

      if (!response.body) {
        throw new Error("AI 服务暂时没有返回内容。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const answerFormat = !prompt && response.headers.get("X-AI-Answer-Source") === "question_cache" ? "rich_html" : "markdown";
      let streamedAnswer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        streamedAnswer += chunk;
        replaceAiMessage(questionId, assistantMessageId, streamedAnswer, answerFormat);
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

  function replaceAiMessage(questionId: string, messageId: string, content: string, format?: "markdown" | "rich_html") {
    setAiMessagesByQuestionId((current) => ({
      ...current,
      [questionId]: (current[questionId] || []).map((message) => (
        message.id === messageId ? { ...message, content, ...(format ? { format } : {}) } : message
      ))
    }));
  }

  const wasCorrect = status === "correct";
  const correctAnswer = normalizeAnswer(question.answer);
  const shareCard = buildQuestionShareCard({ correctAnswer, currentIndex: index, options, questionTypeLabel: typeLabel, selected, sourceTitle: title, stem: question.stem, totalQuestions: total, wasCorrect });
  return <><div className="flex flex-wrap items-center justify-end gap-5"><div className="h-px flex-1 border-t border-dashed border-slate-200" />
    {question.showAiExplanation && <button className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-medium text-violet-600 hover:text-violet-700" type="button" onClick={openAiDoubt}><Bot size={22} />AI答疑</button>}
    <ShareToBuddyButton buttonClassName="!min-h-10 !rounded-lg !border-0 !bg-transparent !px-1 !py-0 !font-medium !text-slate-500 hover:!border-transparent hover:!bg-transparent hover:!text-teal disabled:!border-0" buttonIconSize={24} buttonLabel="分享" contentSuggestions={getQuestionShareSuggestions(wasCorrect)} copyContext={wasCorrect ? "question_correct" : "question_wrong"} defaultContent={wasCorrect ? "这道题我做对了，考点挺典型。" : "这道题我想听听大家怎么理解。"} shareCard={shareCard} sourceLabel={`题 ${index + 1} / ${total}`} />
  </div>{aiDialogOpen && <AiDoubtDialog followUpText={followUpText} loading={aiLoading} messages={aiMessages} onChangeFollowUp={setFollowUpText} onClose={() => setAiDialogOpen(false)} onSubmitFollowUp={submitFollowUp} />}</>;
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
  const initialMessage = messages.find((message) => message.role === "assistant" && !message.exchangeId);
  const initialAnswer = initialMessage?.content || "";
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
                  <AiAnswerText content={initialAnswer} format={initialMessage?.format} />
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

function AiAnswerText({ content, format = "markdown" }: { content: string; format?: "markdown" | "rich_html" }) {
  if (isDiamondInsufficientMessage(content)) {
    return <DiamondInsufficientMessage className="text-base leading-8" />;
  }

  if (format === "rich_html") {
    return <RichTextContent className="text-base leading-8 text-ink" value={content} zoomable />;
  }

  return (
    <div className="space-y-4">
      <MathMarkdownText components={aiAnswerMarkdownComponents}>
        {content}
      </MathMarkdownText>
    </div>
  );
}

const aiAnswerMarkdownComponents: Components = {
  h1: ({ children }) => <h3 className="text-lg font-semibold leading-8 text-ink">{children}</h3>,
  h2: ({ children }) => <h3 className="text-lg font-semibold leading-8 text-ink">{children}</h3>,
  h3: ({ children }) => <h3 className="text-lg font-semibold leading-8 text-ink">{children}</h3>,
  h4: ({ children }) => <h4 className="font-semibold leading-8 text-ink">{children}</h4>,
  p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
  ol: ({ children }) => <ol className="list-decimal space-y-2 pl-6">{children}</ol>,
  ul: ({ children }) => <ul className="list-disc space-y-2 pl-6">{children}</ul>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-teal/30 pl-4 text-slate-600">{children}</blockquote>
  ),
  hr: () => <hr className="border-slate-200" />,
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-max border-collapse text-left text-sm leading-6">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
  th: ({ children }) => <th className="border-b border-r border-slate-200 px-3 py-2 font-semibold last:border-r-0">{children}</th>,
  td: ({ children }) => <td className="border-b border-r border-slate-200 px-3 py-2 align-top last:border-r-0">{children}</td>,
  tr: ({ children }) => <tr className="last:[&_td]:border-b-0">{children}</tr>,
  code: ({ children, className }) => (
    <code className={className ? `${className} font-mono text-sm` : "rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm"}>
      {children}
    </code>
  ),
  pre: ({ children }) => <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm leading-6 text-slate-100">{children}</pre>,
  a: ({ children, href }) => (
    <a className="font-medium text-teal underline underline-offset-4" href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  )
};

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    title: stem,
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

