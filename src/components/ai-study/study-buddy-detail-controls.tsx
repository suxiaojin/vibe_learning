"use client";

import { type FormEvent, type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Pause, Send, Sparkles, X } from "lucide-react";
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

type ChatHistoryResponse = {
  data?: {
    messages?: unknown;
  };
};

const lastNodeStoragePrefix = "vibe-ai-study-last-node:v1:";
const drawerWidthStorageKey = "vibe-ai-study-chat-drawer-width:v1";
const defaultDrawerWidth = 448;
const minDrawerWidth = 360;
const maxDrawerWidth = 720;

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
  const [drawerWidth, setDrawerWidth] = useState(defaultDrawerWidth);
  const [draft, setDraft] = useState("");
  const [isResizing, setIsResizing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const storageKey = `${lastNodeStoragePrefix}${projectId}`;
  const validNodeSet = useMemo(() => new Set(validNodeIds), [validNodeIds]);
  const hasDraft = draft.trim().length > 0;

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
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    const searchParams = new URLSearchParams();
    if (selectedNodeId) {
      searchParams.set("nodeId", selectedNodeId);
    }

    setDraft("");
    setSending(false);
    setMessages([]);
    setLoadingHistory(true);

    fetch(`/api/ai-study/projects/${projectId}/chat${searchParams.size ? `?${searchParams.toString()}` : ""}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const payload = (await response.json()) as ChatHistoryResponse;
        setMessages(normalizeChatMessages(payload.data?.messages));
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        const messageText = error instanceof Error ? error.message : "历史对话加载失败，请稍后再试。";
        setMessages([
          {
            id: `history-error-${Date.now()}`,
            content: messageText,
            role: "assistant",
            tone: "error"
          }
        ]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingHistory(false);
        }
      });

    return () => controller.abort();
  }, [projectId, selectedNodeId]);

  useEffect(() => {
    try {
      const savedWidth = Number(window.localStorage.getItem(drawerWidthStorageKey));
      if (Number.isFinite(savedWidth)) {
        setDrawerWidth(clampDrawerWidth(savedWidth));
      }
    } catch {
      // Drawer width preference is best-effort only.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(drawerWidthStorageKey, String(drawerWidth));
    } catch {
      // Drawer width preference is best-effort only.
    }
  }, [drawerWidth]);

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

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

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
    if (!message || sending || loadingHistory) {
      return;
    }

    const controller = new AbortController();
    const assistantMessageId = nextMessageId("assistant");
    let rawAnswer = "";
    abortControllerRef.current = controller;
    setSending(true);
    setDraft("");
    setMessages((current) => [
      ...current,
      { id: nextMessageId("user"), content: message, role: "user" },
      { id: assistantMessageId, content: "", role: "assistant" }
    ]);

    try {
      const response = await fetch(`/api/ai-study/projects/${projectId}/chat`, {
        body: JSON.stringify({
          message,
          nodeId: selectedNodeId || null
        }),
        headers: {
          Accept: "text/plain",
          "Content-Type": "application/json",
          "X-AI-Study-Stream": "1"
        },
        method: "POST",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      if (!response.body) {
        throw new Error("AI学习搭子暂时没有回答。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        rawAnswer += decoder.decode(value, { stream: true });
        updateAssistantMessage(assistantMessageId, cleanAiText(rawAnswer));
      }

      rawAnswer += decoder.decode();
      updateAssistantMessage(assistantMessageId, cleanAiText(rawAnswer) || "暂时没有生成回答，请稍后再试。");
    } catch (error) {
      if (controller.signal.aborted) {
        const pausedText = cleanAiText(rawAnswer) || "已暂停输出。";
        updateAssistantMessage(assistantMessageId, pausedText);
      } else {
        const messageText = error instanceof Error ? error.message : "AI学习搭子暂时不可用，请稍后再试。";
        updateAssistantMessage(assistantMessageId, messageText, "error");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setSending(false);
    }
  }

  function stopStreaming() {
    abortControllerRef.current?.abort();
  }

  function updateAssistantMessage(messageId: string, content: string, tone?: ChatMessage["tone"]) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content,
              tone
            }
          : message
      )
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) {
      stopStreaming();
      return;
    }
    void sendMessage();
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!sending && !loadingHistory) {
        void sendMessage();
      }
    }
  }

  function handleResizePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (window.innerWidth < 640) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  }

  function handleResizePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    setDrawerWidth(clampDrawerWidth(window.innerWidth - event.clientX - 12));
  }

  function stopResizing(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsResizing(false);
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
          <aside
            className={cn(
              "pointer-events-auto absolute bottom-3 right-3 top-3 flex flex-col overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]",
              isResizing ? "select-none" : ""
            )}
            style={{ width: `min(${drawerWidth}px, calc(100vw - 24px))` }}
          >
            <button
              aria-label="拖动调整对话侧栏宽度"
              className="absolute -left-2 top-0 hidden h-full w-4 cursor-col-resize touch-none items-center justify-center rounded-l-[24px] text-transparent transition hover:text-[#9ca3af] sm:flex"
              onPointerCancel={stopResizing}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={stopResizing}
              title="拖动调整宽度"
              type="button"
            >
              <span className="h-12 w-1 rounded-full bg-current" />
            </button>

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
                    disabled={sending || loadingHistory}
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

              {loadingHistory && messages.length === 0 ? (
                <div className="mt-7 flex items-center gap-2 pl-12 text-sm text-[#667085]">
                  <Loader2 className="animate-spin" size={15} />
                  正在加载历史对话
                </div>
              ) : null}

              {messages.length > 0 ? (
                <div className="mt-7 space-y-4">
                  {messages.map((message) => {
                    const renderedContent = message.role === "assistant" ? cleanAiText(message.content) : message.content;
                    return (
                      <div
                        className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                        key={message.id}
                      >
                        <div
                          className={cn(
                            "max-w-[86%] whitespace-pre-wrap rounded-[16px] px-4 py-3 text-sm leading-6 shadow-sm",
                            message.role === "user"
                              ? "bg-[#2563ff] text-white"
                              : "border border-[#edf0f4] bg-[#f8fafc] text-[#1f2937]",
                            message.tone === "error" ? "border-red-100 bg-red-50 text-red-600" : ""
                          )}
                        >
                          {renderedContent ? (
                            renderedContent
                          ) : (
                            <span className="inline-flex items-center gap-2 text-[#667085]">
                              <Loader2 className="animate-spin" size={15} />
                              搭子正在思考
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 px-7 pb-4 pt-3">
              <div className="mb-3 flex min-w-0 items-center gap-2 text-xs text-[#667085]">
                <Sparkles className="shrink-0 text-[#16a329]" size={14} />
                <span className="shrink-0">基于知识点</span>
                <span className="truncate font-semibold text-[#111827]">“{selectedNodeTitle || "当前项目"}”</span>
                <span className="shrink-0">对话</span>
              </div>
              <form className="relative" onSubmit={handleSubmit}>
                <textarea
                  className="h-[120px] w-full resize-none rounded-[18px] border border-[#d9e5ff] bg-white px-4 py-4 pr-14 text-sm leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#b8ccff] focus:ring-4 focus:ring-[#2563ff]/10 disabled:bg-[#f8fafc]"
                  disabled={sending || loadingHistory}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleDraftKeyDown}
                  placeholder={selectedNodeSummary ? "对于该知识点有什么想要了解的呢" : "问问搭子关于这个项目的问题"}
                  ref={textareaRef}
                  value={draft}
                />
                <button
                  aria-label={sending ? "暂停输出" : "发送"}
                  className={cn(
                    "absolute bottom-4 right-4 grid size-9 place-items-center rounded-full text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563ff]",
                    sending
                      ? "bg-[#111827] hover:bg-[#374151]"
                      : hasDraft
                        ? "bg-[#16a329] hover:bg-[#118320]"
                        : "bg-[#c0c4cc] disabled:cursor-not-allowed disabled:opacity-80"
                  )}
                  disabled={!sending && (!hasDraft || loadingHistory)}
                  onClick={sending ? stopStreaming : undefined}
                  type={sending ? "button" : "submit"}
                >
                  {sending ? <Pause size={17} /> : <Send size={17} />}
                </button>
              </form>
              <p className="mt-2 text-center text-xs font-medium text-[#b6bdc8]">内容由AI生成，请仔细甄别</p>
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

function clampDrawerWidth(value: number) {
  const viewportMax = typeof window === "undefined" ? maxDrawerWidth : Math.max(minDrawerWidth, window.innerWidth - 24);
  return Math.max(minDrawerWidth, Math.min(Math.min(maxDrawerWidth, viewportMax), Number(value.toFixed(0))));
}

function compactTitle(title: string, maxLength: number) {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function cleanAiText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z0-9_-]*\n?/g, "").replace(/```/g, ""))
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "· ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.content === "string" &&
    (message.role === "assistant" || message.role === "user") &&
    (message.tone === undefined || message.tone === "error")
  );
}

function normalizeChatMessages(value: unknown) {
  return Array.isArray(value) ? value.filter(isChatMessage).slice(-80) : [];
}

async function readErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return "AI学习搭子暂时没有回答。";
  }
  try {
    const payload = JSON.parse(text) as { error?: { message?: string } };
    return payload.error?.message || text;
  } catch {
    return text;
  }
}
