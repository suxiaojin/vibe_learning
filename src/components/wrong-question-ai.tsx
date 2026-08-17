"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronRight, HelpCircle, Loader2 } from "lucide-react";

const text = {
  button: "\u0041\u0049\u89e3\u91ca",
  fallback: "\u0041\u0049 \u6682\u65f6\u65e0\u6cd5\u56de\u7b54\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  timeout: "\u0041\u0049 \u89e3\u91ca\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  loading: "\u6b63\u5728\u7ec4\u7ec7\u8bb2\u89e3...",
  streaming: "\u6b63\u5728\u7ee7\u7eed\u8f93\u51fa...",
  explanation: "\u0041\u0049\u89e3\u91ca",
  yourFollowUp: "\u4f60\u7684\u8ffd\u95ee",
  followUpLoading: "\u6b63\u5728\u56de\u7b54\u8fd9\u4e2a\u8ffd\u95ee...",
  placeholder: "\u7ee7\u7eed\u8ffd\u95ee\u8fd9\u9053\u9898",
  followUp: "\u8ffd\u95ee"
};

type FollowUpExchange = {
  id: string;
  question: string;
  answer: string;
};

class AiExplainRequestError extends Error {}

export function WrongQuestionAi({
  questionId,
  sessionId,
  buttonClassName = "secondary-button",
  buttonText = text.button,
  containerClassName = "mt-4"
}: {
  questionId: string;
  sessionId?: string;
  buttonClassName?: string;
  buttonText?: string;
  containerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [followUps, setFollowUps] = useState<FollowUpExchange[]>([]);
  const [expandedFollowUpIds, setExpandedFollowUpIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const followUpIdRef = useRef(0);
  const historyLoadedRef = useRef(false);

  async function loadFollowUpHistory() {
    if (historyLoadedRef.current) {
      return;
    }
    historyLoadedRef.current = true;

    try {
      const query = new URLSearchParams({ questionId });
      if (sessionId) {
        query.set("sessionId", sessionId);
      }
      const response = await fetch(`/api/ai/explain?${query.toString()}`, {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error("AI_FOLLOW_UP_HISTORY_FAILED");
      }
      const payload = (await response.json()) as {
        data?: { followUps?: Array<{ id?: unknown; question?: unknown; answer?: unknown }> };
      };
      const history = (payload.data?.followUps || []).flatMap((exchange) => {
        return typeof exchange.id === "string" &&
          typeof exchange.question === "string" &&
          typeof exchange.answer === "string"
          ? [{ id: exchange.id, question: exchange.question, answer: exchange.answer }]
          : [];
      });
      setFollowUps((current) => {
        const currentIds = new Set(current.map((exchange) => exchange.id));
        return [...history.filter((exchange) => !currentIds.has(exchange.id)), ...current];
      });
    } catch {
      historyLoadedRef.current = false;
    }
  }

  async function askAi(nextPrompt?: string) {
    const content = nextPrompt?.trim() || "";
    const followUpId = content ? `local-${++followUpIdRef.current}` : null;
    const requestId = content ? createAiRequestId() : undefined;
    setOpen(true);
    setLoading(true);
    setRequestError("");
    if (followUpId === null) {
      setAnswer("");
      void loadFollowUpHistory();
    } else {
      setFollowUps((current) => [...current, { id: followUpId, question: content, answer: "" }]);
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60000);
    let streamedAnswer = "";

    function updateTargetAnswer(nextAnswer: string) {
      if (followUpId === null) {
        setAnswer(nextAnswer);
        return;
      }
      setFollowUps((current) =>
        current.map((exchange) => (exchange.id === followUpId ? { ...exchange, answer: nextAnswer } : exchange))
      );
    }

    try {
      const response = await fetch("/api/ai/explain", {
        method: "POST",
        headers: {
          Accept: "text/plain",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          questionId,
          ...(sessionId ? { sessionId } : {}),
          ...(content ? { prompt: content, requestId } : {})
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new AiExplainRequestError(await readApiErrorMessage(response));
      }
      if (!response.body) {
        throw new Error("AI_EXPLAIN_EMPTY_STREAM");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        streamedAnswer += decoder.decode(value, { stream: true });
        updateTargetAnswer(streamedAnswer);
      }
      streamedAnswer += decoder.decode();
      updateTargetAnswer(streamedAnswer.trim() ? streamedAnswer : text.fallback);
      if (followUpId !== null) {
        setPrompt("");
      }
    } catch (error) {
      const errorText = error instanceof Error && error.name === "AbortError"
        ? text.timeout
        : error instanceof AiExplainRequestError
          ? error.message
          : text.fallback;
      if (followUpId === null) {
        setRequestError(streamedAnswer ? `${streamedAnswer}\n\n${errorText}` : errorText);
      } else {
        updateTargetAnswer(streamedAnswer ? `${streamedAnswer}\n\n${errorText}` : errorText);
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  function toggleExplanation() {
    if (open) {
      setOpen(false);
      return;
    }
    if (answer || loading) {
      setOpen(true);
      return;
    }
    void askAi();
  }

  function toggleFollowUp(followUpId: string) {
    setExpandedFollowUpIds((current) => {
      return current.includes(followUpId)
        ? current.filter((id) => id !== followUpId)
        : [...current, followUpId];
    });
  }

  const activeFollowUpId = loading && followUps.length > 0 ? followUps.at(-1)?.id : null;

  return (
    <div className={containerClassName}>
      <button
        aria-expanded={open}
        className={`${buttonClassName} disabled:cursor-wait disabled:opacity-60`}
        disabled={loading}
        type="button"
        onClick={toggleExplanation}
      >
        <HelpCircle size={18} />
        {buttonText}
      </button>
      {open ? (
        <div aria-busy={loading} className="mt-4 rounded-2xl bg-mist p-4">
          {answer ? (
            <section aria-label={text.explanation}>
              <p className="text-xs font-bold text-slate-500">{text.explanation}</p>
              <div className="mt-2">
                <MarkdownText content={answer} />
              </div>
            </section>
          ) : null}

          {requestError ? <p className="text-sm font-semibold text-coral" role="alert">{requestError}</p> : null}

          {loading && activeFollowUpId === null ? (
            <p className={`${answer ? "mt-3 " : ""}flex items-center gap-2 text-sm text-slate-600`} role="status">
              <Loader2 className="animate-spin" size={16} />
              {answer ? text.streaming : text.loading}
            </p>
          ) : null}

          {followUps.length > 0 ? (
            <div className="mt-5 space-y-3 border-t border-border-soft pt-5">
              {followUps.map((exchange) => {
                const expanded = expandedFollowUpIds.includes(exchange.id);
                const answerId = `follow-up-answer-${exchange.id}`;
                const title = `${text.yourFollowUp}：${exchange.question}`;
                return (
                  <section className="overflow-hidden rounded-xl border border-border-soft bg-surface" key={exchange.id}>
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
                      <div className="border-t border-border-soft p-4" id={answerId}>
                        {exchange.answer ? <MarkdownText content={exchange.answer} /> : null}
                        {loading && exchange.id === activeFollowUpId ? (
                          <p className={`${exchange.answer ? "mt-3 " : ""}flex items-center gap-2 text-sm text-slate-600`} role="status">
                            <Loader2 className="animate-spin" size={16} />
                            {exchange.answer ? text.streaming : text.followUpLoading}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : null}

          {answer ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                className="input disabled:cursor-wait disabled:opacity-60"
                disabled={loading}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={text.placeholder}
              />
              <button
                className="primary-button sm:w-24 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={loading || !prompt.trim()}
                type="button"
                onClick={() => askAi(prompt)}
              >
                {text.followUp}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

async function readApiErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: { message?: unknown } } | null;
  return typeof payload?.error?.message === "string" && payload.error.message.trim()
    ? payload.error.message
    : text.fallback;
}

function createAiRequestId() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function MarkdownText({ content }: { content: string }) {
  const blocks = toBlocks(content);

  return (
    <div className="space-y-3 text-sm leading-7 text-slate-700">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <h3 key={index} className="text-base font-black text-ink">{renderInline(block.text)}</h3>;
        }
        if (block.type === "ordered") {
          return (
            <ol key={index} className="list-decimal space-y-1 pl-5">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
            </ol>
          );
        }
        if (block.type === "unordered") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
            </ul>
          );
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ordered"; items: string[] }
  | { type: "unordered"; items: string[] };

function toBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let ordered: string[] = [];
  let unordered: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
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

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushLists();
      blocks.push({ type: "heading", text: heading[1] });
      continue;
    }

    const orderedItem = line.match(/^\d+[.)]\s+(.+)$/);
    if (orderedItem) {
      flushParagraph();
      unordered = [];
      ordered.push(orderedItem[1]);
      continue;
    }

    const unorderedItem = line.match(/^[-*]\s+(.+)$/);
    if (unorderedItem) {
      flushParagraph();
      ordered = [];
      unordered.push(unorderedItem[1]);
      continue;
    }

    flushLists();
    paragraph.push(line);
  }

  flushParagraph();
  flushLists();
  return blocks.length > 0 ? blocks : [{ type: "paragraph", text: content }];
}

function renderInline(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }
    nodes.push(<strong key={`${match.index}-${match[1]}`} className="font-black text-ink">{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
}
