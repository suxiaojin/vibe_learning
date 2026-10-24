"use client";

import { type FormEvent, type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronLeft, ChevronRight, Copy, Loader2, MessageCircle, Pause, RefreshCw, Send, Share2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiStudyChatShareDialog } from "@/components/ai-study/ai-study-chat-share-dialog";
import { DiamondInsufficientMessage } from "@/components/diamond-insufficient-message";
import { isDiamondInsufficientMessage } from "@/lib/diamond-insufficient";
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
  partResume?: { storageKey: string; validPartIds: string[] };
  materialTitle: string;
  selectedNodeCardKeyPoints: string[];
  selectedNodeCardOverview: string;
  selectedNodeDepth: number;
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
  createdAt?: string;
  completed?: boolean;
  versions?: ChatVersion[];
  questionMessageId?: string | null;
};

type ChatVersion = {
  id: string;
  content: string;
  createdAt?: string;
};

type RegenerationStyle = "rephrase" | "example" | "steps" | "concise";

type RegenerationQuote = { amount: number; ruleVersion: number };

type RegenerationSelection = {
  messageId: string;
  style: RegenerationStyle;
  quote: RegenerationQuote | null;
  loadingQuote: boolean;
  error: string;
};

type ChatHistoryResponse = {
  data?: {
    messages?: unknown;
  };
};

type ShareSelection = {
  messageId: string;
  question: string;
  answer: string;
  nodeTitle: string;
  materialTitle: string;
};

const lastNodeStoragePrefix = "vibe-ai-study-last-node:v1:";
const drawerWidthStorageKey = "vibe-ai-study-chat-drawer-width:v1";
const suggestionStoragePrefix = "vibe-ai-study-chat-suggestions:v1:";
const defaultDrawerWidth = 448;
const minDrawerWidth = 360;
const maxDrawerWidth = 720;
const regenerationStyles: { value: RegenerationStyle; label: string }[] = [
  { value: "rephrase", label: "换个说法" },
  { value: "example", label: "举个例子" },
  { value: "steps", label: "分步骤讲" },
  { value: "concise", label: "更简洁" }
];

export function StudyBuddyDetailControls({
  hasExplicitNode,
  nextNode,
  previousNode,
  projectId,
  partResume,
  materialTitle,
  selectedNodeId,
  selectedNodeSummary,
  selectedNodeTitle,
  validNodeIds
}: StudyBuddyDetailControlsProps) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const suggestionCacheRef = useRef(new Map<string, string[]>());
  const suggestionRequestRef = useRef<AbortController | null>(null);
  const [drawerWidth, setDrawerWidth] = useState(defaultDrawerWidth);
  const [draft, setDraft] = useState("");
  const [isResizing, setIsResizing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [sharedMessageIds, setSharedMessageIds] = useState<Set<string>>(() => new Set());
  const [shareSelection, setShareSelection] = useState<ShareSelection | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [selectedVersionIds, setSelectedVersionIds] = useState<Record<string, string>>({});
  const [regeneration, setRegeneration] = useState<RegenerationSelection | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const regeneratingRequestRef = useRef(false);
  const copiedResetTimerRef = useRef<number | null>(null);
  const messageIdRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const storageKey = `${lastNodeStoragePrefix}${projectId}`;
  const validNodeSet = useMemo(() => new Set(validNodeIds), [validNodeIds]);
  const hasDraft = draft.trim().length > 0;

  const suggestionCacheKey = `${projectId}:${selectedNodeId}`;

  function getCachedSuggestions(): string[] | undefined {
    if (suggestionCacheRef.current.has(suggestionCacheKey)) {
      return suggestionCacheRef.current.get(suggestionCacheKey);
    }
    try {
      const stored = window.sessionStorage.getItem(`${suggestionStoragePrefix}${suggestionCacheKey}`);
      if (stored === null) {
        return undefined;
      }
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && (parsed.length === 0 || parsed.length === 2) && parsed.every((item) => typeof item === "string")) {
        suggestionCacheRef.current.set(suggestionCacheKey, parsed);
        return parsed;
      }
    } catch {
      // In-memory cache still prevents a second request in this page.
    }
    return undefined;
  }

  function rememberSuggestions(value: string[]) {
    suggestionCacheRef.current.set(suggestionCacheKey, value);
    try {
      window.sessionStorage.setItem(`${suggestionStoragePrefix}${suggestionCacheKey}`, JSON.stringify(value));
    } catch {
      // Session storage is best-effort; the in-memory record remains.
    }
  }

  useEffect(() => {
    suggestionRequestRef.current?.abort();
    suggestionRequestRef.current = null;
    setLoadingSuggestions(false);
    setSuggestions(getCachedSuggestions() || []);
    return () => suggestionRequestRef.current?.abort();
  }, [suggestionCacheKey]);

  async function loadSuggestions() {
    if (!selectedNodeId) {
      return;
    }
    const cached = getCachedSuggestions();
    if (cached !== undefined) {
      setSuggestions(cached);
      return;
    }

    // Record the attempt before the request so failure, cancellation and reopen do not retry.
    rememberSuggestions([]);
    suggestionRequestRef.current?.abort();
    const controller = new AbortController();
    suggestionRequestRef.current = controller;
    setSuggestions([]);
    setLoadingSuggestions(true);
    try {
      const response = await fetch(`/api/ai-study/projects/${projectId}/chat/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: selectedNodeId }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("Suggestion generation failed.");
      }
      const payload = await response.json() as { data?: { suggestions?: unknown } };
      const next = Array.isArray(payload.data?.suggestions)
        ? payload.data.suggestions.filter((item): item is string => typeof item === "string")
        : [];
      if (suggestionRequestRef.current === controller && next.length === 2) {
        rememberSuggestions(next);
        setSuggestions(next);
      }
    } catch {
      // Failed suggestions stay hidden; the student can always ask directly.
      if (suggestionRequestRef.current === controller) {
        setSuggestions([]);
      }
    } finally {
      if (suggestionRequestRef.current === controller) {
        suggestionRequestRef.current = null;
        setLoadingSuggestions(false);
      }
    }
  }

  function openChat() {
    setChatOpen(true);
    void loadSuggestions();
  }

  function closeChat() {
    suggestionRequestRef.current?.abort();
    suggestionRequestRef.current = null;
    setLoadingSuggestions(false);
    setChatOpen(false);
  }

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    try {
      if (partResume) {
        const savedPartId = window.localStorage.getItem(partResume.storageKey);
        if (savedPartId && savedPartId !== projectId && partResume.validPartIds.includes(savedPartId)) {
          return;
        }
      }
      const savedNodeId = window.localStorage.getItem(storageKey);
      if (!hasExplicitNode && savedNodeId && validNodeSet.has(savedNodeId) && savedNodeId !== selectedNodeId) {
        router.replace(buildNodeHref(projectId, savedNodeId));
        return;
      }
      rememberSelectedNode(storageKey, selectedNodeId);
    } catch {
      // Local navigation memory is best-effort only.
    }
  }, [hasExplicitNode, partResume, projectId, router, selectedNodeId, storageKey, validNodeSet]);

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
    setShareSelection(null);
    setSelectedVersionIds({});
    setRegeneration(null);
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
  }, [messages.length, messages[messages.length - 1]?.content.length, sending]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (copiedResetTimerRef.current !== null) window.clearTimeout(copiedResetTimerRef.current);
    };
  }, []);

  function navigateToNode(nodeId: string) {
    rememberSelectedNode(storageKey, nodeId);
    router.push(buildNodeHref(projectId, nodeId));
  }

  function nextMessageId(prefix: string) {
    messageIdRef.current += 1;
    return `${prefix}-${Date.now()}-${messageIdRef.current}`;
  }

  async function refreshChatHistory() {
    const searchParams = new URLSearchParams();
    if (selectedNodeId) searchParams.set("nodeId", selectedNodeId);
    const response = await fetch(`/api/ai-study/projects/${projectId}/chat${searchParams.size ? `?${searchParams.toString()}` : ""}`);
    if (!response.ok) throw new Error(await readErrorMessage(response));
    const payload = (await response.json()) as ChatHistoryResponse;
    setMessages(normalizeChatMessages(payload.data?.messages));
  }

  async function openRegeneration(messageId: string) {
    if (regeneration?.messageId === messageId) {
      setRegeneration(null);
      return;
    }
    if (sending || regeneratingMessageId) return;
    setRegeneration({ messageId, style: "rephrase", quote: null, loadingQuote: true, error: "" });
    try {
      const response = await fetch(`/api/ai-study/projects/${projectId}/chat/regenerate`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      const payload = (await response.json()) as { data?: { quote?: RegenerationQuote } };
      const quote = payload.data?.quote;
      if (!quote || !Number.isInteger(quote.amount) || !Number.isInteger(quote.ruleVersion)) {
        throw new Error("暂时无法读取本次消耗，请稍后再试。");
      }
      setRegeneration((current) => current?.messageId === messageId ? { ...current, quote, loadingQuote: false } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : "暂时无法读取本次消耗，请稍后再试。";
      setRegeneration((current) => current?.messageId === messageId ? { ...current, loadingQuote: false, error: message } : current);
    }
  }

  async function submitRegeneration(messageId: string) {
    const selection = regeneration;
    if (!selection?.quote || selection.messageId !== messageId || regeneratingRequestRef.current || sending) return;
    regeneratingRequestRef.current = true;
    setRegeneratingMessageId(messageId);
    setRegeneration({ ...selection, error: "" });
    try {
      const response = await fetch(`/api/ai-study/projects/${projectId}/chat/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantMessageId: messageId,
          style: selection.style,
          expectedAmount: selection.quote.amount,
          expectedRuleVersion: selection.quote.ruleVersion
        })
      });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      const payload = (await response.json()) as { data?: { originalMessageId?: string; version?: ChatVersion } };
      const version = payload.data?.version;
      if (payload.data?.originalMessageId !== messageId || !version?.id || !version.content) {
        throw new Error("新回答已生成，请刷新对话查看。");
      }
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, versions: [...(message.versions || []), version] }
        : message));
      setSelectedVersionIds((current) => ({ ...current, [messageId]: version.id }));
      setRegeneration(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "重新生成失败，请稍后再试。";
      setRegeneration((current) => current?.messageId === messageId
        ? { ...current, error: message, quote: message.includes("本次消耗已变化") ? null : current.quote }
        : current);
    } finally {
      regeneratingRequestRef.current = false;
      setRegeneratingMessageId(null);
    }
  }

  async function sendMessage(rawMessage = draft) {
    const message = rawMessage.trim();
    if (!message || sending || loadingHistory || regeneratingMessageId) {
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
      { id: assistantMessageId, content: "", role: "assistant", completed: false }
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
      updateAssistantMessage(assistantMessageId, cleanAiText(rawAnswer) || "暂时没有生成回答，请稍后再试。", undefined, true);
      await refreshChatHistory().catch(() => {});
    } catch (error) {
      if (controller.signal.aborted) {
        const pausedText = cleanAiText(rawAnswer) || "已暂停输出。";
        updateAssistantMessage(assistantMessageId, pausedText, undefined, true);
      } else {
        const messageText = error instanceof Error ? error.message : "AI学习搭子暂时不可用，请稍后再试。";
        updateAssistantMessage(assistantMessageId, messageText, "error", true);
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

  async function copyAnswer(messageId: string, content: string) {
    if (copiedResetTimerRef.current !== null) window.clearTimeout(copiedResetTimerRef.current);
    setCopiedMessageId(null);
    if (!await writeClipboardText(content)) return;
    setCopiedMessageId(messageId);
    copiedResetTimerRef.current = window.setTimeout(() => {
      setCopiedMessageId(null);
      copiedResetTimerRef.current = null;
    }, 1800);
  }

  function updateAssistantMessage(messageId: string, content: string, tone?: ChatMessage["tone"], completed = false) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content,
              tone,
              ...(completed ? { completed: true, createdAt: new Date().toISOString() } : {})
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
      if (!sending && !loadingHistory && !regeneratingMessageId) {
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
        onClick={openChat}
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
                onClick={closeChat}
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

              {loadingSuggestions ? (
                <div className="mt-4 flex items-center gap-2 pl-12 text-sm text-[#667085]">
                  <Loader2 className="animate-spin" size={15} />
                  正在生成该知识点推荐问题
                </div>
              ) : null}

              {suggestions.length > 0 ? (
                <div className="mt-4 flex flex-col items-start gap-3 pl-12">
                  {suggestions.map((suggestion) => (
                    <button
                      className="max-w-full rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3 text-left text-sm font-medium leading-5 text-[#475467] shadow-sm transition hover:border-[#cbd5e1] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={sending || loadingHistory || Boolean(regeneratingMessageId)}
                      key={suggestion}
                      onClick={() => {
                        void sendMessage(suggestion);
                      }}
                      title={suggestion}
                      type="button"
                    >
                      <span className="line-clamp-1">{suggestion}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {loadingHistory && messages.length === 0 ? (
                <div className="mt-7 flex items-center gap-2 pl-12 text-sm text-[#667085]">
                  <Loader2 className="animate-spin" size={15} />
                  正在加载历史对话
                </div>
              ) : null}

              {messages.length > 0 ? (
                <div className="mt-7 space-y-4">
                  {messages.map((message, index) => {
                    const versions: ChatVersion[] = message.role === "assistant"
                      ? [{ id: message.id, content: message.content, createdAt: message.createdAt }, ...(message.versions || [])]
                      : [];
                    const selectedVersionIndex = versions.findIndex((version) => version.id === selectedVersionIds[message.id]);
                    const activeVersionIndex = selectedVersionIndex >= 0 ? selectedVersionIndex : versions.length - 1;
                    const activeVersion = versions[activeVersionIndex];
                    const renderedContent = message.role === "assistant" ? cleanAiText(activeVersion?.content || "") : message.content;
                    const showAnswerActions = message.role === "assistant" && message.tone !== "error" && message.completed !== false && Boolean(renderedContent);
                    const answerTime = showAnswerActions ? formatAnswerTime(activeVersion?.createdAt) : null;
                    const pairedQuestion = message.questionMessageId
                      ? messages.find((candidate) => candidate.id === message.questionMessageId && candidate.role === "user")
                      : null;
                    const question = message.questionMessageId
                      ? pairedQuestion?.content || null
                      : index > 0 && messages[index - 1].role === "user" ? messages[index - 1].content : null;
                    return (
                      <div
                        className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                        key={message.id}
                      >
                        <div className="min-w-0 max-w-[86%]">
                          <div
                            className={cn(
                              "whitespace-pre-wrap rounded-[16px] px-4 py-3 text-sm leading-6 shadow-sm",
                              message.role === "user"
                                ? "bg-[#2563ff] text-white"
                                : "border border-[#edf0f4] bg-[#f8fafc] text-[#1f2937]",
                              message.tone === "error" ? "border-red-100 bg-red-50 text-red-600" : ""
                            )}
                          >
                            {renderedContent ? (
                              isDiamondInsufficientMessage(renderedContent) ? (
                                <DiamondInsufficientMessage />
                              ) : (
                                renderedContent
                              )
                            ) : (
                              <span className="inline-flex items-center gap-2 text-[#667085]">
                                <Loader2 className="animate-spin" size={15} />
                                搭子正在思考
                              </span>
                            )}
                          </div>
                          {showAnswerActions ? (
                            <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[#98a2b3]">
                              <div className="flex items-center gap-3" aria-label="回答操作">
                                <button
                                  aria-label="复制回答"
                                  className="rounded text-[#98a2b3] transition hover:text-[#475467] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563ff]"
                                  onClick={() => { void copyAnswer(activeVersion.id, renderedContent); }}
                                  title="复制回答"
                                  type="button"
                                >
                                  {copiedMessageId === activeVersion.id ? <Check size={15} /> : <Copy size={15} />}
                                </button>
                                <button
                                  aria-label={sharedMessageIds.has(activeVersion.id) ? "已分享到一起上岸" : "分享到一起上岸"}
                                  className="rounded text-[#98a2b3] transition hover:text-[#475467] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563ff] disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={!question || sharedMessageIds.has(activeVersion.id)}
                                  onClick={() => { if (question) setShareSelection({ messageId: activeVersion.id, question, answer: renderedContent, nodeTitle: selectedNodeTitle, materialTitle }); }}
                                  title={!question ? "未找到对应提问" : sharedMessageIds.has(activeVersion.id) ? "已分享到一起上岸" : "分享到一起上岸"}
                                  type="button"
                                >
                                  {sharedMessageIds.has(activeVersion.id) ? <Check size={15} /> : <Share2 size={15} />}
                                </button>
                                <button
                                  aria-expanded={regeneration?.messageId === message.id}
                                  aria-label="重新生成这条回答"
                                  className="rounded text-[#98a2b3] transition hover:text-[#475467] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563ff] disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={!question || message.id.startsWith("assistant-") || sending || Boolean(regeneratingMessageId)}
                                  onClick={() => { void openRegeneration(message.id); }}
                                  title={!question ? "未找到对应提问" : "重新生成这条回答"}
                                  type="button"
                                >
                                  <RefreshCw size={15} />
                                </button>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {versions.length > 1 ? (
                                  <div className="flex items-center gap-0.5 text-xs" aria-label={`回答版本 ${activeVersionIndex + 1}/${versions.length}`}>
                                    <button aria-label="上一版回答" className="rounded p-0.5 hover:bg-[#edf0f4] disabled:opacity-40" disabled={activeVersionIndex === 0} onClick={() => setSelectedVersionIds((current) => ({ ...current, [message.id]: versions[activeVersionIndex - 1].id }))} type="button"><ChevronLeft size={14} /></button>
                                    <span className="tabular-nums">{activeVersionIndex + 1}/{versions.length}</span>
                                    <button aria-label="下一版回答" className="rounded p-0.5 hover:bg-[#edf0f4] disabled:opacity-40" disabled={activeVersionIndex === versions.length - 1} onClick={() => setSelectedVersionIds((current) => ({ ...current, [message.id]: versions[activeVersionIndex + 1].id }))} type="button"><ChevronRight size={14} /></button>
                                  </div>
                                ) : null}
                                {answerTime ? <time className="shrink-0 text-xs" dateTime={activeVersion.createdAt}>{answerTime}</time> : null}
                              </div>
                            </div>
                          ) : null}
                          {regeneration?.messageId === message.id ? (
                            <div className="mt-2 rounded-xl border border-[#d9e3ee] bg-white p-3 text-sm text-[#344054] shadow-sm">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold">这次想怎么讲？</p>
                                <button aria-label="关闭重新生成菜单" className="rounded p-1 text-[#98a2b3] hover:bg-[#f3f4f6]" disabled={regeneratingMessageId === message.id} onClick={() => setRegeneration(null)} type="button"><X size={15} /></button>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="选择讲解方式">
                                {regenerationStyles.map((style) => (
                                  <button
                                    aria-pressed={regeneration.style === style.value}
                                    className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", regeneration.style === style.value ? "border-[#1f9d8a] bg-[#e8f6f3] text-[#117666]" : "border-[#d9e3ee] text-[#667085] hover:border-[#1f9d8a]")}
                                    disabled={Boolean(regeneratingMessageId)}
                                    key={style.value}
                                    onClick={() => setRegeneration((current) => current ? { ...current, style: style.value } : current)}
                                    type="button"
                                  >{style.label}</button>
                                ))}
                              </div>
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-[#667085]">{regeneration.loadingQuote ? "正在读取本次消耗…" : regeneration.quote ? regeneration.quote.amount > 0 ? `本次生成消耗 ${regeneration.quote.amount} 钻石` : "本次生成不消耗钻石" : "暂时无法确认消耗"}</p>
                                <button className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#1f9d8a] px-4 text-xs font-semibold text-white hover:bg-[#168473] disabled:cursor-not-allowed disabled:opacity-50" disabled={!regeneration.quote || Boolean(regeneratingMessageId)} onClick={() => { void submitRegeneration(message.id); }} type="button">
                                  {regeneratingMessageId === message.id ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                                  {regeneratingMessageId === message.id ? "正在生成新版本" : "生成新版本"}
                                </button>
                              </div>
                              {regeneration.error ? (
                                <div className="mt-2" role="alert">
                                  {isDiamondInsufficientMessage(regeneration.error)
                                    ? <DiamondInsufficientMessage />
                                    : <p className="text-xs text-red-600">{regeneration.error}</p>}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
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
                  disabled={sending || loadingHistory || Boolean(regeneratingMessageId)}
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
                  disabled={!sending && (!hasDraft || loadingHistory || Boolean(regeneratingMessageId))}
                  onClick={sending ? stopStreaming : undefined}
                  type={sending ? "button" : "submit"}
                >
                  {sending ? <Pause size={17} /> : <Send size={17} />}
                </button>
              </form>
              <p className="mt-2 text-center text-xs font-medium text-[#b6bdc8]">
                内容由AI生成，请仔细甄别。AI回答会消耗钻石，具体请参考-
                <Link className="italic no-underline transition hover:text-[#8d96a3]" href="/help?tab=faq">
                  帮助中心
                </Link>
                或
                <Link className="italic no-underline transition hover:text-[#8d96a3]" href="/me?tab=diamonds">
                  联系客服
                </Link>
              </p>
            </div>
          </aside>
        </div>
      ) : null}
      {shareSelection ? (
        <AiStudyChatShareDialog
          answer={shareSelection.answer}
          materialTitle={shareSelection.materialTitle}
          messageId={shareSelection.messageId}
          nodeTitle={shareSelection.nodeTitle}
          onClose={() => setShareSelection(null)}
          onPublished={(messageId) => {
            setSharedMessageIds((current) => new Set(current).add(messageId));
            setShareSelection(null);
          }}
          question={shareSelection.question}
        />
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
  return Array.isArray(value) ? value.filter(isChatMessage).slice(-80).map((message) => ({
    ...message,
    versions: Array.isArray(message.versions) ? message.versions.filter(isChatVersion) : [],
    questionMessageId: typeof message.questionMessageId === "string" ? message.questionMessageId : null
  })) : [];
}

function isChatVersion(value: unknown): value is ChatVersion {
  if (!value || typeof value !== "object") return false;
  const version = value as Partial<ChatVersion>;
  return typeof version.id === "string" && typeof version.content === "string" && typeof version.createdAt === "string";
}

const answerDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "numeric",
  day: "numeric"
});

const answerTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

function formatAnswerTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const parts = answerDateFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const dayOfMonth = Number(parts.find((part) => part.type === "day")?.value);
  const currentYear = Number(answerDateFormatter.formatToParts(now).find((part) => part.type === "year")?.value);
  const day = answerDateFormatter.format(date) === answerDateFormatter.format(now)
    ? "今天"
    : year === currentYear
      ? `${month}月${dayOfMonth}日`
      : `${year}年${month}月${dayOfMonth}日`;
  return `${day} ${answerTimeFormatter.format(date)}`;
}

async function writeClipboardText(content: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      // HTTP deployments may not expose the Clipboard API.
    }
  }

  const textarea = document.createElement("textarea");
  const focusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    focusedElement?.focus({ preventScroll: true });
  }
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
