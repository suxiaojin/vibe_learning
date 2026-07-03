"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type NavigationNode = {
  id: string;
  title: string;
};

type StudyBuddyDetailControlsProps = {
  hasExplicitNode: boolean;
  nextNode: NavigationNode | null;
  previousNode: NavigationNode | null;
  projectId: string;
  selectedNodeId: string;
  selectedNodeSummary: string;
  selectedNodeTitle: string;
  validNodeIds: string[];
};

type ChatMessage = {
  id: string;
  content: string;
  role: "assistant" | "user";
  tone?: "error";
};

type ChatResponsePayload = {
  data?: {
    answer?: string;
  };
  error?: {
    message?: string;
  };
  ok?: boolean;
};

const lastNodeStoragePrefix = "vibe-ai-study-last-node:v1:";

export function StudyBuddyDetailControls({
  hasExplicitNode,
  nextNode,
  previousNode,
  projectId,
  selectedNodeId,
  selectedNodeSummary,
  selectedNodeTitle,
  validNodeIds
}: StudyBuddyDetailControlsProps) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageIdRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const storageKey = `${lastNodeStoragePrefix}${projectId}`;
  const validNodeSet = useMemo(() => new Set(validNodeIds), [validNodeIds]);

  const suggestions = useMemo(() => {
    const shortTitle = compactTitle(selectedNodeTitle || "这个知识点", 18);
    return [
      `${shortTitle}考试时容易怎么考？`,
      `用例子讲清楚${shortTitle}`,
      `我该怎么记住这一节？`
    ];
  }, [selectedNodeTitle]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    try {
      const savedNodeId = window.localStorage.getItem(storageKey);
      if (!hasExplicitNode && savedNodeId && validNodeSet.has(savedNodeId) && savedNodeId !== selectedNodeId) {
        router.replace(buildNodeHref(projectId, savedNodeId));
        return;
      }
      rememberSelectedNode(storageKey, selectedNodeId);
    } catch {
      // Local navigation memory is best-effort only.
    }
  }, [hasExplicitNode, projectId, router, selectedNodeId, storageKey, validNodeSet]);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (chatOpen || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "ArrowLeft" && previousNode) {
        event.preventDefault();
        navigateToNode(previousNode.id);
      }
      if (event.key === "ArrowRight" && nextNode) {
        event.preventDefault();
        navigateToNode(nextNode.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, nextNode?.id, previousNode?.id, projectId, storageKey]);

  useEffect(() => {
    setDraft("");
    setMessages([]);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!chatOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [chatOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  function navigateToNode(nodeId: string) {
    rememberSelectedNode(storageKey, nodeId);
    router.push(buildNodeHref(projectId, nodeId));
  }

  function nextMessageId(prefix: string) {
    messageIdRef.current += 1;
    return `${prefix}-${Date.now()}-${messageIdRef.current}`;
  }

  async function sendMessage(rawMessage = draft) {
    const message = rawMessage.trim();
    if (!message || sending) {
      return;
    }

    setSending(true);
    setDraft("");
    setMessages((current) => [
      ...current,
      { id: nextMessageId("user"), content: message, role: "user" }
    ]);

    try {
      const response = await fetch(`/api/ai-study/projects/${projectId}/chat`, {
        body: JSON.stringify({
          message,
          nodeId: selectedNodeId || null
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as ChatResponsePayload | null;
      if (!response.ok) {
        throw new Error(payload?.error?.message || "AI学习搭子暂时没有回答。");
      }

      const answer = payload?.data?.answer?.trim() || "暂时没有生成回答，请稍后再试。";
      setMessages((current) => [
        ...current,
        { id: nextMessageId("assistant"), content: answer, role: "assistant" }
      ]);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "AI学习搭子暂时不可用，请稍后再试。";
      setMessages((current) => [
        ...current,
        { id: nextMessageId("assistant-error"), content: messageText, role: "assistant", tone: "error" }
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <>
      <button
        className="inline-flex h-9 items-center gap-2 rounded-full border border-[#dfe4ea] bg-white px-4 text-sm font-semibold text-[#111827] shadow-sm transition hover:border-[#cbd5e1] hover:bg-[#f8fafc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563ff]"
        onClick={() => setChatOpen(true)}
        type="button"
      >
        <MessageCircle size={17} />
        问问搭子
      </button>

      {chatOpen ? (
        <div className="fixed inset-0 z-[80] pointer-events-none">
          <aside className="pointer-events-auto absolute bottom-3 right-3 top-3 flex w-[min(448px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#edf0f4] px-6">
              <h2 className="text-[16px] font-semibold text-[#111827]">对话</h2>
              <button
                aria-label="关闭对话"
                className="grid size-9 place-items-center rounded-full text-[#1f2937] transition hover:bg-[#f3f4f6]"
                onClick={() => setChatOpen(false)}
                type="button"
              >
                <X size={21} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-6">
              <div className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#edf8dc] text-[#77b43a]">
                  <Bot size={19} />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#111827]">AI学习搭子</p>
                  <p className="mt-4 text-[15px] leading-7 text-[#1f2937]">
                    关于【{selectedNodeTitle || "当前项目"}】，你有什么想要继续了解的：
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col items-start gap-3 pl-12">
                {suggestions.map((suggestion) => (
                  <button
                    className="max-w-full rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3 text-left text-sm font-medium leading-5 text-[#475467] shadow-sm transition hover:border-[#cbd5e1] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={sending}
                    key={suggestion}
                    onClick={() => {
                      void sendMessage(suggestion);
                    }}
                    type="button"
                  >
                    <span className="line-clamp-1">{suggestion}</span>
                  </button>
                ))}
              </div>

              {messages.length > 0 ? (
                <div className="mt-7 space-y-4">
                  {messages.map((message) => (
                    <div
                      className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                      key={message.id}
                    >
                      <div
                        className={cn(
                          "max-w-[86%] rounded-[16px] px-4 py-3 text-sm leading-6 shadow-sm",
                          message.role === "user"
                            ? "bg-[#2563ff] text-white"
                            : "border border-[#edf0f4] bg-[#f8fafc] text-[#1f2937]",
                          message.tone === "error" ? "border-red-100 bg-red-50 text-red-600" : ""
                        )}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}
                  {sending ? (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-full border border-[#edf0f4] bg-[#f8fafc] px-4 py-2 text-sm font-medium text-[#667085]">
                        <Loader2 className="animate-spin" size={15} />
                        搭子正在思考
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 px-7 pb-5 pt-3">
              <div className="mb-3 flex min-w-0 items-center gap-2 text-xs text-[#667085]">
                <Sparkles className="shrink-0 text-[#16a329]" size={14} />
                <span className="shrink-0">基于知识点</span>
                <span className="truncate font-semibold text-[#111827]">“{selectedNodeTitle || "当前项目"}”</span>
                <span className="shrink-0">对话</span>
              </div>
              <form className="relative" onSubmit={handleSubmit}>
                <textarea
                  className="h-[120px] w-full resize-none rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-4 pr-14 text-sm leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#cbd5e1] focus:ring-4 focus:ring-[#2563ff]/10"
                  disabled={sending}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleDraftKeyDown}
                  placeholder={selectedNodeSummary ? "对于该知识点有什么想要了解的呢" : "问问搭子关于这个项目的问题"}
                  ref={textareaRef}
                  value={draft}
                />
                <button
                  aria-label="发送"
                  className="absolute bottom-4 right-4 grid size-9 place-items-center rounded-full bg-[#c0c4cc] text-white transition hover:bg-[#9ca3af] disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={sending || !draft.trim()}
                  type="submit"
                >
                  {sending ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                </button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function rememberSelectedNode(storageKey: string, nodeId: string) {
  try {
    window.localStorage.setItem(storageKey, nodeId);
  } catch {
    // Local navigation memory is best-effort only.
  }
}

function buildNodeHref(projectId: string, nodeId: string) {
  return `/study-buddy/${projectId}?node=${encodeURIComponent(nodeId)}`;
}

function compactTitle(title: string, maxLength: number) {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}
