"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, CheckCircle2, ChevronRight, Folder, Loader2, Maximize2, Minimize2, Move, Search, Sparkles, X } from "lucide-react";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import type { ImportQuestion, ImportQuestionPaperPayload, ImportQuestionType } from "@/lib/question-paper-import";
import { getAiReferenceQuestionTypes } from "@/lib/question-bank-ai-reference";
import { isQuestionBankRichAnswerQuestionType, questionBankTypeDefaultLabels } from "@/lib/question-bank-types";
import { cn } from "@/lib/utils";

type RegionOption = {
  id: string;
  name: string;
};

type OwnerOption = {
  type: QuestionBankOwnerType;
  id: string;
  name: string;
  regions: RegionOption[];
};

type ReferenceChapterNode = {
  id: string;
  title: string;
  path: string;
  count: number;
  questionTypes: ImportQuestionType[];
};

type ReferenceCourseNode = {
  id: string;
  title: string;
  path: string;
  count: number;
  chapters: ReferenceChapterNode[];
};

type GenerationResponse = {
  payload: ImportQuestionPaperPayload;
  stats: Record<string, number>;
  warnings: string[];
};

type GenerationTaskResponse = Partial<GenerationResponse> & {
  taskId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  stage: string;
  progress: number;
  message: string;
  elapsedSeconds?: number;
  events?: Array<{ time: number; message: string }>;
  error?: string;
};

type CommitResponse = {
  paperId: string;
  importedQuestions: number;
};

type Props = {
  selectedOwner: OwnerOption;
  regions: RegionOption[];
  knowledgeTreesByRegion: Record<string, ReferenceCourseNode[]>;
};

const typeLabels: Record<string, string> = { all: "全部", ...questionBankTypeDefaultLabels };

const difficultyLabels = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

function answerToText(answer: string[]) {
  return answer.join("、");
}

function textToAnswer(value: string) {
  return value
    .split(/[、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query);
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-black", count > 0 ? "bg-[#e0f2fe] text-[#0369a1]" : "bg-[#f1f5f9] text-[#94a3b8]")}>
      {count}题
    </span>
  );
}

function questionIssues(question: ImportQuestion) {
  const issues: string[] = [];
  const optionKeys = new Set(question.options.map((option) => option.key));
  if (!question.stem.trim()) {
    issues.push("题干为空");
  }
  if ((question.type === "single_choice" || question.type === "multiple_choice") && question.options.length !== 4) {
    issues.push(`选项数量 ${question.options.length}`);
  }
  if (question.type === "single_choice" && question.answer.length !== 1) {
    issues.push("单选答案数量异常");
  }
  if (question.type === "multiple_choice" && question.answer.length < 2) {
    issues.push("多选答案少于 2 个");
  }
  if ((question.type === "single_choice" || question.type === "multiple_choice") && question.answer.some((item) => !optionKeys.has(item))) {
    issues.push("答案不在选项中");
  }
  if (question.type === "true_false" && question.answer.some((item) => item !== "A" && item !== "B")) {
    issues.push("判断题答案不是 A/B");
  }
  if (question.answer.length === 0) {
    issues.push("答案为空");
  }
  if (!question.analysis.trim()) {
    issues.push("解析为空");
  }
  return issues;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (!response.ok) {
    throw new Error([data.error, data.detail].filter(Boolean).join("\n") || "请求失败。");
  }
  return data as T;
}

const defaultDialogSize = {
  width: 1280,
  height: 760
};

const minDialogSize = {
  width: 900,
  height: 560
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function defaultTitle(ownerName: string) {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `AI生成题库-${ownerName}-${yyyy}-${mm}-${dd}-${hh}-${mi}-${ss}`;
}

export function QuestionBankAiGenerationDialog({ selectedOwner, regions, knowledgeTreesByRegion }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle(selectedOwner.name));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [regionId, setRegionId] = useState((selectedOwner.regions[0] || regions[0])?.id || "");
  const [count, setCount] = useState("10");
  const [difficulty, setDifficulty] = useState<keyof typeof difficultyLabels>("medium");
  const [questionTypes, setQuestionTypes] = useState<ImportQuestionType[]>([]);
  const [questionTypeCounts, setQuestionTypeCounts] = useState<Partial<Record<ImportQuestionType, string>>>({});
  const [referenceSearchQuery, setReferenceSearchQuery] = useState("");
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(() => new Set());
  const [selectedReferenceChapterIds, setSelectedReferenceChapterIds] = useState<string[]>([]);
  const [parsed, setParsed] = useState<GenerationResponse | null>(null);
  const [task, setTask] = useState<GenerationTaskResponse | null>(null);
  const [taskId, setTaskId] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [dialogSize, setDialogSize] = useState(defaultDialogSize);
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const [isCommitting, startCommitting] = useTransition();

  const activeOwner = selectedOwner;
  const ownerRegions = activeOwner.regions.length > 0 ? activeOwner.regions : regions;
  const selectedRegionName = useMemo(() => ownerRegions.find((region) => region.id === regionId)?.name || ownerRegions[0]?.name || "江苏三年制", [ownerRegions, regionId]);
  const knowledgeTree = useMemo(() => knowledgeTreesByRegion[regionId] || [], [knowledgeTreesByRegion, regionId]);
  const referenceChapters = useMemo(
    () => knowledgeTree.flatMap((course) => course.chapters),
    [knowledgeTree]
  );
  const selectedReferenceChapters = useMemo(
    () => referenceChapters.filter((section) => selectedReferenceChapterIds.includes(section.id)),
    [referenceChapters, selectedReferenceChapterIds]
  );
  const availableQuestionTypes = useMemo(() => getAiReferenceQuestionTypes(selectedReferenceChapters), [selectedReferenceChapters]);
  const questionTypeOptions = availableQuestionTypes.map((value) => ({ value, label: questionBankTypeDefaultLabels[value] }));

  useEffect(() => {
    setQuestionTypes(availableQuestionTypes);
    setQuestionTypeCounts({});
  }, [availableQuestionTypes]);

  const normalizedReferenceSearchQuery = referenceSearchQuery.trim().toLowerCase();
  const visibleKnowledgeTree = useMemo(() => {
    if (!normalizedReferenceSearchQuery) {
      return knowledgeTree;
    }

    return knowledgeTree
      .map((course) => {
        const courseMatches = includesQuery(course.path, normalizedReferenceSearchQuery);
        const chapters = course.chapters.filter((chapter) => courseMatches || includesQuery(chapter.path, normalizedReferenceSearchQuery));

        if (courseMatches || chapters.length > 0) {
          return {
            ...course,
            chapters: courseMatches ? course.chapters : chapters
          };
        }
        return null;
      })
      .filter((course): course is ReferenceCourseNode => Boolean(course));
  }, [knowledgeTree, normalizedReferenceSearchQuery]);
  const filteredQuestions = useMemo(() => {
    const questions = parsed?.payload.questions || [];
    return selectedType === "all" ? questions : questions.filter((question) => question.type === selectedType);
  }, [parsed, selectedType]);
  const selectedQuestion = useMemo(() => {
    const questions = parsed?.payload.questions || [];
    return questions.find((question) => question.number === selectedQuestionNumber) || filteredQuestions[0] || null;
  }, [filteredQuestions, parsed, selectedQuestionNumber]);
  const activeTask = Boolean(taskId || task?.status === "queued" || task?.status === "running" || isGenerating);
  const issueCount = useMemo(() => (parsed?.payload.questions || []).reduce((total, question) => total + (questionIssues(question).length > 0 ? 1 : 0), 0), [parsed]);
  const selectedReferenceCount = selectedReferenceChapters.length;
  const availableReferenceCount = referenceChapters.filter((section) => section.count > 0).length;
  const selectedReferenceQuestionCount = selectedReferenceChapters.reduce((total, section) => total + section.count, 0);
  const selectedReferenceChapterTitle = useMemo(() => {
    if (selectedReferenceChapters.length === 0) {
      return "请先选择参考章节";
    }
    const titles = selectedReferenceChapters.map((section) => section.title);
    if (titles.length <= 3) {
      return titles.join("、");
    }
    return `${titles.slice(0, 3).join("、")} 等 ${titles.length} 个章`;
  }, [selectedReferenceChapters]);
  const selectedReferenceChapterFullTitle = selectedReferenceChapters.map((section) => section.path).join("\n");

  useEffect(() => {
    setRegionId((selectedOwner.regions[0] || regions[0])?.id || "");
    setTitle(defaultTitle(selectedOwner.name));
    setSelectedReferenceChapterIds([]);
    setReferenceSearchQuery("");
    setQuestionTypes([]);
    setQuestionTypeCounts({});
    resetState();
  }, [regions, selectedOwner.id, selectedOwner.name, selectedOwner.regions, selectedOwner.type]);

  useEffect(() => {
    const referenceChapterIds = new Set(referenceChapters.map((section) => section.id));
    setSelectedReferenceChapterIds((current) => current.filter((id) => referenceChapterIds.has(id)));
    setExpandedCourseIds(new Set(knowledgeTree.filter((course) => course.count > 0).map((course) => course.id)));
  }, [knowledgeTree, referenceChapters]);

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }
    const width = Math.min(defaultDialogSize.width, window.innerWidth - 40);
    const height = Math.min(defaultDialogSize.height, window.innerHeight - 40);
    setDialogSize({ width, height });
    setDialogPosition({
      x: Math.max(20, Math.floor((window.innerWidth - width) / 2)),
      y: Math.max(20, Math.floor((window.innerHeight - height) / 2))
    });
  }, [open]);

  useEffect(() => {
    const firstRegion = ownerRegions[0]?.id || regions[0]?.id || "";
    if (!ownerRegions.some((region) => region.id === regionId)) {
      setRegionId(firstRegion);
    }
  }, [ownerRegions, regionId, regions]);

  useEffect(() => {
    if (!startedAt || (!activeTask && !isCommitting)) {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeTask, isCommitting, startedAt]);

  useEffect(() => {
    if (!taskId) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/admin/question-bank-ai-generations/tasks/${encodeURIComponent(taskId)}`, {
          cache: "no-store"
        });
        const data = await readJson<GenerationTaskResponse>(response);
        if (cancelled) {
          return;
        }
        setTask(data);
        if (data.status === "succeeded" && data.payload) {
          setParsed({
            payload: data.payload,
            stats: data.stats || {},
            warnings: data.warnings || []
          });
          setSelectedQuestionNumber(data.payload.questions[0]?.number || null);
          setTaskId("");
          setStartedAt(null);
        }
        if (data.status === "failed") {
          setError(data.error || data.message || "AI 生题失败。");
          setTaskId("");
          setStartedAt(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "查询 AI 生题进度失败。");
          setTaskId("");
          setStartedAt(null);
        }
      }
    };
    poll();
    const timer = window.setInterval(poll, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [taskId]);

  function resetState() {
    setParsed(null);
    setTask(null);
    setTaskId("");
    setSelectedQuestionNumber(null);
    setSelectedType("all");
    setError("");
  }

  function openDialog() {
    setFullscreen(false);
    setOpen(true);
  }

  function startDialogDrag(event: ReactPointerEvent<HTMLElement>) {
    if (fullscreen) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = { ...dialogPosition };
    const handleMove = (moveEvent: PointerEvent) => {
      const nextX = clamp(startPosition.x + moveEvent.clientX - startX, 0, Math.max(0, window.innerWidth - dialogSize.width));
      const nextY = clamp(startPosition.y + moveEvent.clientY - startY, 0, Math.max(0, window.innerHeight - dialogSize.height));
      setDialogPosition({ x: nextX, y: nextY });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function startDialogResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (fullscreen) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = { ...dialogSize };
    const startPosition = { ...dialogPosition };
    const handleMove = (moveEvent: PointerEvent) => {
      setDialogSize({
        width: clamp(startSize.width + moveEvent.clientX - startX, minDialogSize.width, window.innerWidth - startPosition.x - 12),
        height: clamp(startSize.height + moveEvent.clientY - startY, minDialogSize.height, window.innerHeight - startPosition.y - 12)
      });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function updateQuestion(number: number, updater: (question: ImportQuestion) => ImportQuestion) {
    setParsed((current) => {
      if (!current) {
        return current;
      }
      const questions = current.payload.questions.map((question) => (question.number === number ? updater(question) : question));
      const stats = questions.reduce<Record<string, number>>((counts, question) => {
        counts[question.type] = (counts[question.type] || 0) + 1;
        return counts;
      }, {});
      return {
        ...current,
        stats,
        payload: {
          ...current.payload,
          questions
        }
      };
    });
  }

  function updateOption(question: ImportQuestion, key: string, text: string) {
    updateQuestion(question.number, (item) => ({
      ...item,
      options: item.options.map((option) => (option.key === key ? { ...option, text } : option))
    }));
  }

  function toggleQuestionType(type: ImportQuestionType) {
    resetState();
    const shouldRemove = questionTypes.includes(type);
    setQuestionTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));
    if (shouldRemove) {
      setQuestionTypeCounts((counts) => ({ ...counts, [type]: "" }));
    }
  }

  function updateQuestionTypeCount(type: ImportQuestionType, value: string) {
    resetState();
    const cleaned = value.replace(/[^\d]/g, "").slice(0, 3);
    setQuestionTypeCounts((current) => ({ ...current, [type]: cleaned }));
    if (Number(cleaned) > 0) {
      setQuestionTypes((current) => (current.includes(type) ? current : [...current, type]));
    }
  }

  function toggleReferenceChapter(section: ReferenceChapterNode) {
    resetState();
    if (section.count <= 0) {
      setError(`该章节无参考题目：${section.path}`);
      return;
    }
    setSelectedReferenceChapterIds((current) => (current.includes(section.id) ? current.filter((item) => item !== section.id) : [...current, section.id]));
  }

  function selectAllReferenceChapters() {
    resetState();
    setSelectedReferenceChapterIds(referenceChapters.filter((section) => section.count > 0).map((section) => section.id));
  }

  function clearReferenceChapters() {
    resetState();
    setSelectedReferenceChapterIds([]);
  }

  function toggleCourse(courseId: string) {
    setExpandedCourseIds((current) => {
      const next = new Set(current);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }

  function parsedQuestionTypeCounts() {
    return questionTypeOptions.reduce<Partial<Record<ImportQuestionType, number>>>((counts, option) => {
      const value = Number(questionTypeCounts[option.value] || 0);
      if (Number.isInteger(value) && value > 0) {
        counts[option.value] = value;
      }
      return counts;
    }, {});
  }

  function generateQuestions() {
    setError("");
    setParsed(null);
    setSelectedQuestionNumber(null);
    if (!title.trim()) {
      setError("请填写 AI 题库名称。");
      return;
    }
    if (selectedReferenceChapterIds.length === 0) {
      setError("请至少选择一个参考章节。");
      return;
    }
    const emptySection = selectedReferenceChapters.find((section) => section.count <= 0);
    if (emptySection) {
      setError(`该章节无参考题目：${emptySection.path}`);
      return;
    }
    const requestedCount = Number(count);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 50) {
      setError("生成数量请填写 1-50 之间的整数。");
      return;
    }
    const normalizedQuestionTypeCounts = parsedQuestionTypeCounts();
    const questionTypeCountTotal = Object.values(normalizedQuestionTypeCounts).reduce((total, value) => total + (value || 0), 0);
    if (questionTypeCountTotal > requestedCount) {
      setError("题型数量合计不能超过生成总数。");
      return;
    }
    const effectiveQuestionTypes = [
      ...new Set([...questionTypes, ...(Object.keys(normalizedQuestionTypeCounts) as ImportQuestionType[])])
    ].filter((type) => availableQuestionTypes.includes(type));
    if (effectiveQuestionTypes.length === 0) {
      setError("请至少选择一种章节已有题型。");
      return;
    }

    setTask(null);
    setStartedAt(Date.now());
    setElapsed(0);
    startGenerating(async () => {
      try {
        const response = await fetch("/api/admin/question-bank-ai-generations/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerType: activeOwner.type,
            ownerId: activeOwner.id,
            regionId,
            title: title.trim(),
            year,
            count: requestedCount,
            questionTypes: effectiveQuestionTypes,
            questionTypeCounts: normalizedQuestionTypeCounts,
            difficulty,
            referenceChapterIds: selectedReferenceChapterIds
          })
        });
        const data = await readJson<GenerationTaskResponse>(response);
        setTask(data);
        setTaskId(data.taskId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "AI 生题失败。");
        setStartedAt(null);
      }
    });
  }

  function commitPaper() {
    if (!parsed) {
      return;
    }
    setError("");
    setStartedAt(Date.now());
    setElapsed(0);
    startCommitting(async () => {
      try {
        const response = await fetch("/api/admin/question-bank-ai-generations/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerType: activeOwner.type,
            ownerId: activeOwner.id,
            regionId,
            referenceChapterIds: selectedReferenceChapterIds,
            payload: parsed.payload
          })
        });
        const data = await readJson<CommitResponse>(response);
        setOpen(false);
        router.push(`/admin/question-banks/${data.paperId}`);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "AI 题库入库失败。");
      } finally {
        setStartedAt(null);
      }
    });
  }

  return (
    <>
      <button className="grid justify-items-center gap-1 text-xs font-medium text-[#071b38]" type="button" onClick={openDialog}>
        <span className="grid size-8 place-items-center text-[#168bd4]">
          <Sparkles size={29} strokeWidth={2.4} />
        </span>
        AI生题
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-[#07142b]/35">
          <section
            ref={dialogRef}
            className={cn(
              "fixed grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border border-[#cbd3df] bg-white shadow-2xl",
              fullscreen ? "inset-0 rounded-none" : "rounded-lg"
            )}
            style={fullscreen ? undefined : { left: dialogPosition.x, top: dialogPosition.y, width: dialogSize.width, height: dialogSize.height }}
          >
            <header className="flex items-center justify-between border-b border-[#e2e6ee] px-5 py-4">
              <div className={cn("min-w-0 flex-1", !fullscreen && "cursor-move")} onPointerDown={startDialogDrag}>
                <h2 className="text-base font-bold text-[#071b38]">AI 生题</h2>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                  <Move size={13} />
                  {activeOwner.name} / {selectedRegionName}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setFullscreen((value) => !value)}
                  aria-label={fullscreen ? "退出全屏" : "全屏"}
                >
                  {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </button>
                <button
                  className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setOpen(false)}
                  aria-label="关闭"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="min-h-0 overflow-auto bg-[#f7f8fb] p-5">
              <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <section className="grid content-start gap-4 rounded-md border border-[#d8dee8] bg-white p-4">
                  <div>
                    <label className="label">参考专业课</label>
                    <div className="flex h-11 items-center border border-[#d6dce7] bg-[#f8fafc] px-3 text-sm font-semibold text-[#071b38]">
                      {activeOwner.name}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <label className="label mb-0">参考知识点题目</label>
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <button className="text-[#006aff] hover:underline" type="button" onClick={selectAllReferenceChapters}>全选</button>
                        <button className="text-slate-500 hover:text-[#006aff]" type="button" onClick={clearReferenceChapters}>清空</button>
                      </div>
                    </div>
                    {knowledgeTree.length > 0 ? (
                      <div className="border border-[#d6dce7] bg-[#fbfcfe]">
                        <label className="relative block border-b border-[#e2e6ee] bg-white">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={15} />
                          <input
                            className="h-9 w-full bg-white pl-8 pr-3 text-xs font-medium text-[#071b38] outline-none focus:ring-2 focus:ring-inset focus:ring-[#dbeafe]"
                            placeholder="搜索课程、章"
                            value={referenceSearchQuery}
                            onChange={(event) => setReferenceSearchQuery(event.target.value)}
                          />
                        </label>
                        <div className="max-h-52 overflow-auto p-2 text-xs">
                          {visibleKnowledgeTree.length > 0 ? (
                            <div className="space-y-1">
                              {visibleKnowledgeTree.map((course) => {
                                const courseExpanded = normalizedReferenceSearchQuery.length > 0 || expandedCourseIds.has(course.id);
                                return (
                                  <div key={course.id}>
                                    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-1 rounded px-1 py-1.5 hover:bg-white">
                                      <button className="grid size-6 place-items-center rounded text-[#475569] hover:bg-[#e2e8f0]" type="button" onClick={() => toggleCourse(course.id)} aria-label={courseExpanded ? "收缩课程" : "展开课程"}>
                                        <ChevronRight size={15} className={cn("transition", courseExpanded ? "rotate-90" : "")} />
                                      </button>
                                      <span className="flex min-w-0 items-center gap-2 truncate font-black text-[#071b38]" title={course.path}>
                                        <BookOpen size={15} className="shrink-0 text-[#2563eb]" />
                                        <span className="truncate">{course.title}</span>
                                      </span>
                                      <CountBadge count={course.count} />
                                    </div>
                                    {courseExpanded ? (
                                      <div className="mt-1 space-y-1 pl-7">
                                        {course.chapters.map((chapter) => {
                                          const selected = selectedReferenceChapterIds.includes(chapter.id);
                                          const disabled = chapter.count <= 0;
                                          return (
                                            <label
                                              key={chapter.id}
                                              className={cn(
                                                "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-2 transition",
                                                disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-[#071b38] hover:bg-white",
                                                selected && "bg-[#ecfeff] font-black text-[#0e7490] ring-1 ring-[#67e8f9]"
                                              )}
                                              title={chapter.path}
                                            >
                                              <input type="checkbox" disabled={disabled} checked={selected} onChange={() => toggleReferenceChapter(chapter)} />
                                              <span className="flex min-w-0 items-center gap-2 truncate">
                                                <Folder size={14} className={cn("shrink-0", disabled ? "text-slate-300" : "text-[#f59e0b]")} />
                                                <span className="truncate">{chapter.title}</span>
                                              </span>
                                              <CountBadge count={chapter.count} />
                                            </label>
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="grid h-24 place-items-center text-slate-500">没有匹配的章节。</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="border border-dashed border-[#cbd3df] bg-[#f8fafc] px-3 py-4 text-xs text-slate-500">
                        当前专业还没有可参考的章节目录。
                      </div>
                    )}
                    <p className="mt-2 text-xs text-slate-500" title={selectedReferenceChapterFullTitle}>
                      已选择 {selectedReferenceCount} 个章，合计 {selectedReferenceQuestionCount} 道参考题：{selectedReferenceChapterTitle}
                    </p>
                  </div>
                  <div>
                    <label className="label">AI 题库名称</label>
                    <input className="input rounded-none" value={title} onChange={(event) => { setTitle(event.target.value); resetState(); }} />
                  </div>
                  <div className="grid grid-cols-[1fr_110px] gap-3">
                    <div>
                      <label className="label">区域信息</label>
                      <select className="input rounded-none" value={regionId} onChange={(event) => { setRegionId(event.target.value); resetState(); }}>
                        {ownerRegions.map((region) => (
                          <option key={region.id} value={region.id}>{region.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">年份</label>
                      <input className="input rounded-none" value={year} onChange={(event) => { setYear(event.target.value); resetState(); }} inputMode="numeric" />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr] gap-3">
                    <div>
                      <label className="label">生成数量</label>
                      <input className="input rounded-none" value={count} onChange={(event) => { setCount(event.target.value.replace(/[^\d]/g, "")); resetState(); }} inputMode="numeric" min={1} max={50} placeholder="例如 25" />
                    </div>
                    <div>
                      <label className="label">难度</label>
                      <select className="input rounded-none" value={difficulty} onChange={(event) => { setDifficulty(event.target.value as keyof typeof difficultyLabels); resetState(); }}>
                        {Object.entries(difficultyLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">题型</label>
                    <div className="grid gap-2 text-xs">
                      {questionTypeOptions.length === 0 ? <p className="text-slate-500">请先选择有参考题目的章节。</p> : null}
                      {questionTypeOptions.map((option) => (
                        <div key={option.value} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2 border border-[#d6dce7] bg-[#f9fafc] px-3 py-2 font-semibold text-[#071b38] hover:border-[#6f8dff]">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={questionTypes.includes(option.value)}
                              onChange={() => toggleQuestionType(option.value)}
                            />
                            {option.label}
                          </label>
                          <input
                            className="h-8 border border-[#d6dce7] bg-white px-2 text-right outline-none focus:border-[#6f8dff]"
                            value={questionTypeCounts[option.value] || ""}
                            onChange={(event) => updateQuestionTypeCount(option.value, event.target.value)}
                            inputMode="numeric"
                            placeholder="数量"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">题型与所选章节已有题型一致。题型数量可不填；填写后合计不能超过生成总数，未填的剩余题量由 AI 按所选题型补足。</p>
                  </div>
                  <div className="rounded-md border border-[#d8dee8] bg-[#f9fafc] p-3 text-xs leading-5 text-slate-600">
                    任务会提交到 14 AI 生题服务执行，71 只负责读取样题、转发任务和确认入库。
                  </div>
                  <button
                    className="primary-button inline-flex h-10 items-center justify-center gap-2 rounded-none disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={activeTask || availableReferenceCount === 0 || selectedReferenceCount === 0}
                    onClick={generateQuestions}
                  >
                    {isGenerating ? <Loader2 className="animate-spin" size={16} /> : null}
                    开始生成
                  </button>
                  {(activeTask || isCommitting) ? (
                    <div className="rounded-md border border-[#d8dee8] bg-[#f9fafc] p-3 text-xs text-[#071b38]">
                      <div className="mb-2 flex items-center justify-between gap-3 font-semibold">
                        <span>{isCommitting ? "正在写入数据库" : task?.message || "正在创建 AI 生题任务"}</span>
                        <span>{isCommitting ? "" : `${Math.max(0, Math.min(100, task?.progress || 0))}%`}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#dbe3ef]">
                        <div
                          className={cn("h-full rounded-full bg-[#2563eb] transition-all", !task?.progress && "w-1/2 animate-pulse")}
                          style={task?.progress ? { width: `${Math.max(2, Math.min(100, task.progress))}%` } : undefined}
                        />
                      </div>
                      <div className="mt-2 text-slate-500">已耗时 {elapsed}s。</div>
                      {task?.events?.length ? (
                        <div className="mt-2 max-h-20 overflow-auto rounded border border-[#e1e6ef] bg-white p-2 text-slate-500">
                          {task.events.slice(-4).map((event) => (
                            <div key={`${event.time}-${event.message}`}>{event.message}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="min-h-[560px] overflow-hidden rounded-md border border-[#d8dee8] bg-white">
                  <div className="flex h-12 items-center justify-between border-b border-[#e2e6ee] px-4">
                    <div className="text-sm font-bold text-[#071b38]">AI 生成预览与编辑</div>
                    {parsed ? (
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#15803d]">
                        <CheckCircle2 size={15} />
                        {parsed.payload.questions.length} 题{issueCount > 0 ? ` / ${issueCount} 题需确认` : ""}
                      </div>
                    ) : null}
                  </div>

                  {error ? (
                    <div className="m-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertTriangle className="mt-0.5 shrink-0" size={17} />
                      <pre className="whitespace-pre-wrap font-sans">{error}</pre>
                    </div>
                  ) : null}

                  {!parsed && !error ? (
                    <div className="grid h-[420px] place-items-center text-sm text-slate-500">
                      {activeTask ? "正在生成，请稍候..." : "等待 AI 生题结果"}
                    </div>
                  ) : null}

                  {parsed ? (
                    <div className="grid gap-4 p-4">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {["all", ...Object.keys(parsed.stats)].map((type) => (
                          <button
                            key={type}
                            className={cn(
                              "rounded-md border px-2.5 py-1 font-semibold",
                              selectedType === type ? "border-[#3562ff] bg-[#eef3ff] text-[#1746d3]" : "border-[#d7deea] bg-[#f7f9fc] text-[#071b38]"
                            )}
                            type="button"
                            onClick={() => { setSelectedType(type); setSelectedQuestionNumber(null); }}
                          >
                            {typeLabels[type] || type}：{type === "all" ? parsed.payload.questions.length : parsed.stats[type]}
                          </button>
                        ))}
                      </div>
                      {parsed.warnings.length > 0 ? (
                        <div className="max-h-24 overflow-auto rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          {parsed.warnings.map((warning) => (
                            <div key={warning}>{warning}</div>
                          ))}
                        </div>
                      ) : null}
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                        <div className="max-h-[520px] overflow-auto border border-[#e2e6ee]">
                          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                            <thead className="sticky top-0 bg-[#eef2f7] text-[#071b38]">
                              <tr>
                                <th className="w-14 border-b border-[#d8dee8] px-2 py-2">题号</th>
                                <th className="w-20 border-b border-[#d8dee8] px-2 py-2">题型</th>
                                <th className="border-b border-[#d8dee8] px-2 py-2">题干</th>
                                <th className="w-28 border-b border-[#d8dee8] px-2 py-2">答案</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredQuestions.map((question) => {
                                const issues = questionIssues(question);
                                return (
                                  <tr
                                    key={question.number}
                                    className={cn(
                                      "cursor-pointer border-b border-[#edf0f5] hover:bg-[#f6f9ff]",
                                      selectedQuestion?.number === question.number && "bg-[#eef3ff]",
                                      issues.length > 0 && "bg-amber-50"
                                    )}
                                    onClick={() => setSelectedQuestionNumber(question.number)}
                                  >
                                    <td className="px-2 py-2 font-semibold">{question.number}</td>
                                    <td className="px-2 py-2">{typeLabels[question.type] || question.type}</td>
                                    <td className="max-w-[520px] truncate px-2 py-2">{question.stem}</td>
                                    <td className="px-2 py-2">{answerToText(question.answer)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {selectedQuestion ? (
                          <div className="grid max-h-[520px] gap-3 overflow-auto border border-[#e2e6ee] bg-[#fbfcfe] p-3 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="font-bold text-[#071b38]">第 {selectedQuestion.number} 题</div>
                              <span className="rounded bg-[#eef3ff] px-2 py-1 font-semibold text-[#1746d3]">{typeLabels[selectedQuestion.type]}</span>
                            </div>
                            {questionIssues(selectedQuestion).length > 0 ? (
                              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                                {questionIssues(selectedQuestion).map((issue) => (
                                  <div key={issue}>{issue}</div>
                                ))}
                              </div>
                            ) : null}
                            <label className="grid gap-1">
                              <span className="font-semibold text-[#071b38]">题干</span>
                              <textarea
                                className="min-h-24 resize-y border border-[#d6dce7] bg-white p-2 leading-6 outline-none focus:border-[#6f8dff]"
                                value={selectedQuestion.stem}
                                onChange={(event) => updateQuestion(selectedQuestion.number, (question) => ({ ...question, stem: event.target.value }))}
                              />
                            </label>
                            {selectedQuestion.options.length > 0 ? (
                              <div className="grid gap-2">
                                <div className="font-semibold text-[#071b38]">选项</div>
                                {selectedQuestion.options.map((option) => (
                                  <label key={option.key} className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2">
                                    <span className="font-bold">{option.key}</span>
                                    <input
                                      className="h-9 border border-[#d6dce7] bg-white px-2 outline-none focus:border-[#6f8dff]"
                                      value={option.text}
                                      onChange={(event) => updateOption(selectedQuestion, option.key, event.target.value)}
                                    />
                                  </label>
                                ))}
                              </div>
                            ) : null}
                            <label className="grid gap-1">
                              <span className="font-semibold text-[#071b38]">答案</span>
                              {isQuestionBankRichAnswerQuestionType(selectedQuestion.type) ? (
                                <textarea
                                  className="min-h-24 border border-[#d6dce7] bg-white px-2 py-2 outline-none focus:border-[#6f8dff]"
                                  value={selectedQuestion.answer.join("\n\n")}
                                  onChange={(event) => updateQuestion(selectedQuestion.number, (question) => ({ ...question, answer: [event.target.value] }))}
                                />
                              ) : (
                              <input
                                className="h-9 border border-[#d6dce7] bg-white px-2 outline-none focus:border-[#6f8dff]"
                                value={answerToText(selectedQuestion.answer)}
                                onChange={(event) => updateQuestion(selectedQuestion.number, (question) => ({ ...question, answer: textToAnswer(event.target.value) }))}
                              />
                              )}
                            </label>
                            <label className="grid gap-1">
                              <span className="font-semibold text-[#071b38]">解析</span>
                              <textarea
                                className="min-h-40 resize-y border border-[#d6dce7] bg-white p-2 leading-6 outline-none focus:border-[#6f8dff]"
                                value={selectedQuestion.analysis}
                                onChange={(event) => updateQuestion(selectedQuestion.number, (question) => ({ ...question, analysis: event.target.value }))}
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-3 border-t border-[#e2e6ee] bg-white px-5 py-4">
              <button className="h-9 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100" type="button" onClick={() => setOpen(false)}>取消</button>
              <button
                className={cn("primary-button inline-flex h-9 items-center justify-center gap-2 rounded-none px-5", (!parsed || isCommitting) && "cursor-not-allowed opacity-60")}
                type="button"
                disabled={!parsed || isCommitting || activeTask}
                onClick={commitPaper}
              >
                {isCommitting ? <Loader2 className="animate-spin" size={16} /> : null}
                确认入库
              </button>
            </footer>
            {!fullscreen ? (
              <div
                className="absolute bottom-0 right-0 size-6 cursor-nwse-resize"
                onPointerDown={startDialogResize}
                aria-hidden="true"
              >
                <span className="absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2 border-[#91a0b5]" />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
