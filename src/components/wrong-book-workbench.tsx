"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Search,
  Target
} from "lucide-react";
import { WrongQuestionAi } from "@/components/wrong-question-ai";
import { cn } from "@/lib/utils";

export type WrongBookQuestionView = {
  id: string;
  questionId: string;
  stem: string;
  options: { key: string; text: string }[];
  answerText: string;
  analysis: string | null;
  wrongCount: number;
  lastWrongAt: string;
  lastWrongLabel: string;
  sourceTitle: string;
  needsContentReview: boolean;
};

export type WrongBookGroupView = {
  key: string;
  courseTitle: string;
  chapterTitle: string;
  sectionTitle: string;
  practiceHref: string;
  items: WrongBookQuestionView[];
};

type WrongBookFilter = "all" | "repeat" | "recent";

const filterOptions: { key: WrongBookFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "repeat", label: "重复错题" },
  { key: "recent", label: "最近新增" }
];

export function WrongBookWorkbench({
  groups,
  totalCount,
  repeatedCount,
  markMasteredAction
}: {
  groups: WrongBookGroupView[];
  totalCount: number;
  repeatedCount: number;
  markMasteredAction: (formData: FormData) => Promise<void>;
}) {
  const [activeFilter, setActiveFilter] = useState<WrongBookFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(groups[0]?.items[0]?.id ?? null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(groups.map((group) => group.key)));

  const normalizedQuery = query.trim().toLowerCase();
  const allQuestions = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const recentQuestionIds = useMemo(() => {
    return new Set([...allQuestions].sort((left, right) => new Date(right.lastWrongAt).getTime() - new Date(left.lastWrongAt).getTime()).slice(0, 12).map((item) => item.id));
  }, [allQuestions]);

  const visibleGroups = useMemo(() => {
    return groups
      .map((group) => {
        const items = group.items.filter((item) => {
          if (activeFilter === "repeat" && item.wrongCount < 2) {
            return false;
          }
          if (activeFilter === "recent" && !recentQuestionIds.has(item.id)) {
            return false;
          }
          if (!normalizedQuery) {
            return true;
          }
          const haystack = `${group.courseTitle} ${group.chapterTitle} ${group.sectionTitle} ${item.stem} ${item.sourceTitle}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        });

        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);
  }, [activeFilter, groups, normalizedQuery, recentQuestionIds]);

  const visibleQuestions = useMemo(() => visibleGroups.flatMap((group) => group.items), [visibleGroups]);

  useEffect(() => {
    setCollapsedGroups(new Set(groups.map((group) => group.key)));
  }, [activeFilter, groups]);

  useEffect(() => {
    if (visibleQuestions.length === 0) {
      setSelectedQuestionId(null);
      return;
    }
    if (!visibleQuestions.some((item) => item.id === selectedQuestionId)) {
      setSelectedQuestionId(visibleQuestions[0].id);
    }
  }, [selectedQuestionId, visibleQuestions]);

  const selectedQuestion = visibleQuestions.find((item) => item.id === selectedQuestionId) ?? visibleQuestions[0] ?? allQuestions[0] ?? null;
  const selectedGroup = selectedQuestion
    ? visibleGroups.find((group) => group.items.some((item) => item.id === selectedQuestion.id)) ??
      groups.find((group) => group.items.some((item) => item.id === selectedQuestion.id)) ??
      null
    : null;
  const selectedIndex = selectedGroup?.items.findIndex((item) => item.id === selectedQuestion?.id) ?? -1;

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <section className="mx-auto w-full max-w-5xl px-5 py-8 lg:px-8">
        <div className="panel text-slate-600">当前没有待掌握错题。</div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8">
      <section className="grid gap-3 md:grid-cols-3">
        <SummaryMetric icon={<Target size={20} />} label="待掌握" value={`${totalCount}`} hint="需要继续复盘的题目" tone="coral" />
        <SummaryMetric icon={<BookOpenCheck size={20} />} label="涉及小节" value={`${groups.length}`} hint="按章节点开处理" tone="honey" />
        <SummaryMetric icon={<ListChecks size={20} />} label="重复错题" value={`${repeatedCount}`} hint="优先攻克的题目" tone="teal" />
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {filterOptions.map((option) => (
                  <button
                    key={option.key}
                    className={cn(
                      "inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold transition",
                      activeFilter === option.key ? "bg-teal text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-teal hover:text-teal"
                    )}
                    type="button"
                    onClick={() => setActiveFilter(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  className="input pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索题干或小节"
                />
              </label>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-500">当前列表 {visibleQuestions.length} 道题，点开小节后选择题目，在右侧集中复盘。</p>
          </div>

          <div className="max-h-[calc(100dvh-320px)] overflow-y-auto p-4">
            {visibleGroups.length === 0 ? (
              <div className="rounded-2xl bg-mist p-5 text-sm font-semibold text-slate-500">当前筛选下没有错题。</div>
            ) : (
              <div className="space-y-4">
                {visibleGroups.map((group) => {
                  const collapsed = collapsedGroups.has(group.key);
                  return (
                    <section key={group.key} className="overflow-hidden rounded-2xl border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                        <button className="flex min-w-0 flex-1 items-start gap-3 text-left" type="button" onClick={() => toggleGroup(group.key)}>
                          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-teal/10 text-teal">
                            {collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-teal">{group.courseTitle} / {group.chapterTitle}</span>
                            <span className="mt-1 block truncate text-base font-bold text-ink">{group.sectionTitle}</span>
                          </span>
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="badge bg-coral/10 text-coral">{group.items.length} 道待掌握</span>
                        </div>
                      </div>

                      {collapsed ? null : (
                        <div className="divide-y divide-slate-100">
                          {group.items.map((item, index) => {
                            const selected = item.id === selectedQuestion?.id;
                            return (
                              <button
                                key={item.id}
                                className={cn(
                                  "block w-full px-4 py-3 text-left transition",
                                  selected ? "bg-teal/10 ring-1 ring-inset ring-teal/30" : "bg-white hover:bg-mist"
                                )}
                                type="button"
                                onClick={() => setSelectedQuestionId(item.id)}
                              >
                                <div className="flex items-start gap-3">
                                  <span
                                    className={cn(
                                      "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
                                      selected ? "bg-teal text-white" : "border border-slate-200 bg-white text-slate-500"
                                    )}
                                  >
                                    {index + 1}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold text-ink">{item.stem}</span>
                                    <span className="mt-2 flex flex-wrap items-center gap-2">
                                      <span className="badge bg-coral/10 text-coral">错 {item.wrongCount} 次</span>
                                      <span className="badge bg-slate-100 text-slate-600">{item.sourceTitle}</span>
                                      {item.needsContentReview ? <span className="badge bg-honey/20 text-slate-700">题目信息待补全</span> : null}
                                    </span>
                                  </span>
                                  <ChevronRight className={cn("mt-1 shrink-0 text-slate-300", selected ? "text-teal" : null)} size={18} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          {selectedQuestion && selectedGroup ? (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-soft">
              <div className="border-b border-slate-200 p-5">
                <p className="text-xs font-semibold text-teal">{selectedGroup.courseTitle} / {selectedGroup.chapterTitle}</p>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-xl font-bold leading-tight text-ink">{selectedGroup.sectionTitle}</h2>
                  <span className="badge bg-slate-100 text-slate-600">题号 {selectedIndex + 1} / {selectedGroup.items.length}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="badge bg-coral/10 text-coral">错 {selectedQuestion.wrongCount} 次</span>
                  <span className="badge bg-slate-100 text-slate-600">最近错题：{selectedQuestion.lastWrongLabel}</span>
                </div>
              </div>

              <div className="max-h-[calc(100dvh-280px)] overflow-y-auto p-5">
                <h3 className="text-base font-bold leading-7 text-ink">{selectedQuestion.stem}</h3>

                {selectedQuestion.options.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    {selectedQuestion.options.map((option) => (
                      <div key={option.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                        <span className="font-bold text-ink">{option.key}.</span> {option.text}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 rounded-xl border border-teal/20 bg-teal/10 p-4">
                  <p className="text-xs font-bold text-teal">正确答案</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-ink">{selectedQuestion.answerText || "暂未填写"}</p>
                </div>

                {selectedQuestion.needsContentReview ? (
                  <div className="mt-3 flex gap-3 rounded-xl border border-honey/40 bg-honey/10 p-4 text-sm leading-6 text-slate-700">
                    <AlertTriangle className="mt-0.5 shrink-0 text-honey" size={18} />
                    <p>这道题的答案提示包含“数据缺失/需补充”等内容，建议后台补全原题数据后再作为标准复盘题展示。</p>
                  </div>
                ) : null}

                <div className="mt-4 rounded-xl bg-mist p-4">
                  <p className="text-xs font-bold text-slate-500">解析</p>
                  <p className="mt-2 text-sm leading-7 text-slate-700">{selectedQuestion.analysis || "暂无解析，建议先使用 AI 讲解补充理解。"}</p>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 p-4">
                  <div>
                    <p className="text-sm font-bold text-ink">AI 讲透这题</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">从错误原因、知识点和解题步骤继续追问。</p>
                  </div>
                  <div className="mt-4">
                    <WrongQuestionAi
                      buttonClassName="primary-button"
                      buttonText="AI讲透这题"
                      key={selectedQuestion.questionId}
                      containerClassName="mt-0"
                      questionId={selectedQuestion.questionId}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 p-5">
                <Link className="secondary-button flex-1" href={selectedGroup.practiceHref}>
                  查看原题练习
                </Link>
                <form action={markMasteredAction} className="flex-1">
                  <input type="hidden" name="questionId" value={selectedQuestion.questionId} />
                  <button className="secondary-button w-full" type="submit">
                    <CheckCircle2 size={18} />
                    标记已掌握
                  </button>
                </form>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500 shadow-soft">
              请选择一道错题开始复盘。
            </section>
          )}
        </aside>
      </section>
    </section>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  hint,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "coral" | "honey" | "teal";
}) {
  const toneClass = {
    coral: "bg-coral/10 text-coral",
    honey: "bg-honey/20 text-slate-700",
    teal: "bg-teal/10 text-teal"
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(24,32,47,0.04)]">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", toneClass)}>{icon}</span>
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black text-ink">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">{hint}</p>
    </div>
  );
}
