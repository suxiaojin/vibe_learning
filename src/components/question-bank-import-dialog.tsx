"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileInput, Loader2, UploadCloud, X } from "lucide-react";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import type { ImportQuestion, ImportQuestionPaperPayload } from "@/lib/question-paper-import";
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

type ParseResponse = {
  payload: ImportQuestionPaperPayload;
  stats: Record<string, number>;
  warnings: string[];
};

type ParserTaskResponse = Partial<ParseResponse> & {
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
  owners: OwnerOption[];
  regions: RegionOption[];
};

const typeLabels: Record<string, string> = {
  all: "全部",
  single_choice: "单选",
  multiple_choice: "多选",
  true_false: "判断",
  fill_blank: "填空",
  comprehensive: "综合"
};

function ownerKey(owner: OwnerOption) {
  return `${owner.type}:${owner.id}`;
}

function answerToText(answer: string[]) {
  return answer.join("、");
}

function textToAnswer(value: string) {
  return value
    .split(/[、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
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

export function QuestionBankImportDialog({ selectedOwner, owners, regions }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedOwnerKey, setSelectedOwnerKey] = useState(ownerKey(selectedOwner));
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [regionId, setRegionId] = useState((selectedOwner.regions[0] || regions[0])?.id || "");
  const [questionPdf, setQuestionPdf] = useState<File | null>(null);
  const [answerPdf, setAnswerPdf] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResponse | null>(null);
  const [task, setTask] = useState<ParserTaskResponse | null>(null);
  const [taskId, setTaskId] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [isParsing, startParsing] = useTransition();
  const [isCommitting, startCommitting] = useTransition();

  const activeOwner = useMemo(() => owners.find((owner) => ownerKey(owner) === selectedOwnerKey) || selectedOwner, [owners, selectedOwner, selectedOwnerKey]);
  const ownerRegions = activeOwner.regions.length > 0 ? activeOwner.regions : regions;
  const selectedRegionName = useMemo(() => ownerRegions.find((region) => region.id === regionId)?.name || ownerRegions[0]?.name || "江苏三年制", [ownerRegions, regionId]);
  const filteredQuestions = useMemo(() => {
    const questions = parsed?.payload.questions || [];
    return selectedType === "all" ? questions : questions.filter((question) => question.type === selectedType);
  }, [parsed, selectedType]);
  const selectedQuestion = useMemo(() => {
    const questions = parsed?.payload.questions || [];
    return questions.find((question) => question.number === selectedQuestionNumber) || filteredQuestions[0] || null;
  }, [filteredQuestions, parsed, selectedQuestionNumber]);
  const activeTask = Boolean(taskId || task?.status === "queued" || task?.status === "running" || isParsing);
  const issueCount = useMemo(() => (parsed?.payload.questions || []).reduce((count, question) => count + (questionIssues(question).length > 0 ? 1 : 0), 0), [parsed]);

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
        const response = await fetch(`/api/admin/question-bank-imports/tasks/${encodeURIComponent(taskId)}`, {
          cache: "no-store"
        });
        const data = await readJson<ParserTaskResponse>(response);
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
          setError(data.error || data.message || "解析失败。");
          setTaskId("");
          setStartedAt(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "查询解析进度失败。");
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

  function parsePaper() {
    setError("");
    setParsed(null);
    setSelectedQuestionNumber(null);
    if (!questionPdf || !answerPdf) {
      setError("请先选择真题 PDF 和答案解析 PDF。");
      return;
    }
    if (!title.trim()) {
      setError("请填写题库名称。");
      return;
    }

    setTask(null);
    setStartedAt(Date.now());
    setElapsed(0);
    startParsing(async () => {
      try {
        const body = new FormData();
        body.append("questionPdf", questionPdf);
        body.append("answerPdf", answerPdf);
        body.append("title", title.trim());
        body.append("year", year.trim());
        body.append("regionName", selectedRegionName);
        body.append("ownerName", activeOwner.name);
        body.append("ownerType", activeOwner.type);
        body.append("courseName", activeOwner.name);

        const response = await fetch("/api/admin/question-bank-imports/tasks", {
          method: "POST",
          body
        });
        const data = await readJson<ParserTaskResponse>(response);
        setTask(data);
        setTaskId(data.taskId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "解析失败。");
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
        const response = await fetch("/api/admin/question-bank-imports/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerType: activeOwner.type,
            ownerId: activeOwner.id,
            regionId,
            payload: parsed.payload
          })
        });
        const data = await readJson<CommitResponse>(response);
        setOpen(false);
        router.push(`/admin/question-banks/${data.paperId}`);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "导入失败。");
      } finally {
        setStartedAt(null);
      }
    });
  }

  return (
    <>
      <button className="grid justify-items-center gap-1 text-xs font-medium text-[#071b38]" type="button" onClick={() => setOpen(true)}>
        <span className="grid size-8 place-items-center text-[#f0a000]">
          <FileInput size={29} strokeWidth={2.4} />
        </span>
        导入导出
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#07142b]/35 px-5 py-8">
          <section className="grid max-h-[92vh] w-full max-w-[1280px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-[#cbd3df] bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#e2e6ee] px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-[#071b38]">题库 PDF 导入</h2>
                <p className="mt-1 text-xs text-slate-500">{activeOwner.name} / {selectedRegionName}</p>
              </div>
              <button className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" type="button" onClick={() => setOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 overflow-auto bg-[#f7f8fb] p-5">
              <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <section className="grid content-start gap-4 rounded-md border border-[#d8dee8] bg-white p-4">
                  <div>
                    <label className="label">导入到专业课</label>
                    <select className="input rounded-none" value={selectedOwnerKey} onChange={(event) => { setSelectedOwnerKey(event.target.value); resetState(); }}>
                      {owners.map((item) => (
                        <option key={ownerKey(item)} value={ownerKey(item)}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">题库名称</label>
                    <input className="input rounded-none" value={title} onChange={(event) => { setTitle(event.target.value); resetState(); }} placeholder="例如 2024年江苏专转本《计算机理论》真题" />
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
                  <label className="grid cursor-pointer gap-2 rounded-md border border-dashed border-[#b8c2d2] bg-[#f9fafc] p-4 text-sm text-[#071b38] hover:border-[#6f8dff]">
                    <span className="inline-flex items-center gap-2 font-semibold"><UploadCloud size={17} />真题 PDF</span>
                    <span className="truncate text-xs text-slate-500">{questionPdf?.name || "选择文件"}</span>
                    <input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => { setQuestionPdf(event.target.files?.[0] || null); resetState(); }} />
                  </label>
                  <label className="grid cursor-pointer gap-2 rounded-md border border-dashed border-[#b8c2d2] bg-[#f9fafc] p-4 text-sm text-[#071b38] hover:border-[#6f8dff]">
                    <span className="inline-flex items-center gap-2 font-semibold"><UploadCloud size={17} />答案解析 PDF</span>
                    <span className="truncate text-xs text-slate-500">{answerPdf?.name || "选择文件"}</span>
                    <input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => { setAnswerPdf(event.target.files?.[0] || null); resetState(); }} />
                  </label>
                  <button
                    className="primary-button inline-flex h-10 items-center justify-center gap-2 rounded-none disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={isParsing}
                    onClick={parsePaper}
                  >
                    {isParsing ? <Loader2 className="animate-spin" size={16} /> : null}
                    开始解析
                  </button>
                  {(activeTask || isCommitting) ? (
                    <div className="rounded-md border border-[#d8dee8] bg-[#f9fafc] p-3 text-xs text-[#071b38]">
                      <div className="mb-2 flex items-center justify-between gap-3 font-semibold">
                        <span>{isCommitting ? "正在写入数据库" : task?.message || "正在创建解析任务"}</span>
                        <span>{isCommitting ? "" : `${Math.max(0, Math.min(100, task?.progress || 0))}%`}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#dbe3ef]">
                        <div
                          className={cn("h-full rounded-full bg-[#2563eb] transition-all", !task?.progress && "w-1/2 animate-pulse")}
                          style={task?.progress ? { width: `${Math.max(2, Math.min(100, task.progress))}%` } : undefined}
                        />
                      </div>
                      <div className="mt-2 text-slate-500">已耗时 {elapsed}s。解析期间可在 14 服务器查看日志。</div>
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
                    <div className="text-sm font-bold text-[#071b38]">解析预览与编辑</div>
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
                      {activeTask ? "正在解析，请稍候..." : "等待解析结果"}
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
                              );})}
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
                              <input
                                className="h-9 border border-[#d6dce7] bg-white px-2 outline-none focus:border-[#6f8dff]"
                                value={answerToText(selectedQuestion.answer)}
                                onChange={(event) => updateQuestion(selectedQuestion.number, (question) => ({ ...question, answer: textToAnswer(event.target.value) }))}
                              />
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
                确认导入
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
