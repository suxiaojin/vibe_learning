"use client";

import { useState, type ReactNode } from "react";
import { HelpCircle, Loader2 } from "lucide-react";

const text = {
  button: "\u0041\u0049\u89e3\u91ca",
  defaultPrompt: "\u8bf7\u9488\u5bf9\u6211\u7684\u9519\u8bef\uff0c\u7528\u901a\u4fd7\u65b9\u5f0f\u8bb2\u6e05\u695a\u8fd9\u9053\u9898\u3002",
  fallback: "\u0041\u0049 \u6682\u65f6\u65e0\u6cd5\u56de\u7b54\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  timeout: "\u0041\u0049 \u89e3\u91ca\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  loading: "\u0041\u0049 \u6b63\u5728\u7ec4\u7ec7\u8bb2\u89e3...",
  placeholder: "\u7ee7\u7eed\u8ffd\u95ee\u8fd9\u9053\u9898",
  followUp: "\u8ffd\u95ee"
};

export function WrongQuestionAi({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function askAi(nextPrompt?: string) {
    const content = nextPrompt?.trim() || text.defaultPrompt;
    setOpen(true);
    setLoading(true);
    setAnswer("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, prompt: content }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error("AI_EXPLAIN_FAILED");
      }
      setAnswer(payload?.data?.answer || payload?.answer || payload?.error?.message || payload?.error || text.fallback);
    } catch (error) {
      setAnswer(error instanceof Error && error.name === "AbortError" ? text.timeout : text.fallback);
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

  return (
    <div className="mt-4">
      <button className="secondary-button" type="button" onClick={toggleExplanation}>
        <HelpCircle size={18} />
        {text.button}
      </button>
      {open ? (
        <div className="mt-4 rounded-2xl bg-mist p-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="animate-spin" size={16} />
              {text.loading}
            </p>
          ) : (
            <>
              <MarkdownText content={answer} />
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input className="input" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={text.placeholder} />
                <button className="primary-button sm:w-24 disabled:cursor-not-allowed disabled:bg-slate-400" disabled={loading || !prompt.trim()} type="button" onClick={() => askAi(prompt)}>
                  {text.followUp}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
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
