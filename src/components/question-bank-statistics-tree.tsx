"use client";

import Link from "next/link";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, FileText, Folder, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuestionBankStatisticsSectionNode = {
  id: string;
  title: string;
  path: string;
  count: number;
};

export type QuestionBankStatisticsChapterNode = {
  id: string;
  title: string;
  path: string;
  count: number;
  sections: QuestionBankStatisticsSectionNode[];
};

export type QuestionBankStatisticsCourseNode = {
  id: string;
  title: string;
  path: string;
  count: number;
  chapters: QuestionBankStatisticsChapterNode[];
};

export type QuestionBankStatisticsScopeType = "course" | "chapter" | "section";

type QuestionBankStatisticsTreeProps = {
  tree: QuestionBankStatisticsCourseNode[];
  selectedScope: {
    type: QuestionBankStatisticsScopeType;
    id: string;
  } | null;
  province: string;
  examType: string;
  ownerKey: string;
};

type QuestionBankStatisticsUiContextValue = {
  directoryCollapsed: boolean;
  setDirectoryCollapsed: (value: boolean) => void;
};

const QuestionBankStatisticsUiContext = createContext<QuestionBankStatisticsUiContextValue | null>(null);

function useQuestionBankStatisticsUi() {
  const context = useContext(QuestionBankStatisticsUiContext);
  if (!context) {
    throw new Error("Question bank statistics UI must be used within its provider.");
  }
  return context;
}

export function QuestionBankStatisticsUiProvider({ children }: { children: ReactNode }) {
  const [directoryCollapsed, setDirectoryCollapsed] = useState(false);

  return (
    <QuestionBankStatisticsUiContext.Provider value={{ directoryCollapsed, setDirectoryCollapsed }}>
      {children}
    </QuestionBankStatisticsUiContext.Provider>
  );
}

export function QuestionBankStatisticsWorkspace({ children }: { children: ReactNode }) {
  const { directoryCollapsed } = useQuestionBankStatisticsUi();

  return (
    <section
      className={cn(
        "grid min-h-0 gap-4 transition-[grid-template-columns] duration-200",
        directoryCollapsed
          ? "grid-cols-[64px_minmax(0,1fr)]"
          : "grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[390px_minmax(0,1fr)]"
      )}
    >
      {children}
    </section>
  );
}

function statisticsHref({
  province,
  examType,
  ownerKey,
  scopeType,
  scopeId
}: {
  province: string;
  examType: string;
  ownerKey: string;
  scopeType: QuestionBankStatisticsScopeType;
  scopeId: string;
}) {
  const query = new URLSearchParams({
    province,
    examType,
    owner: ownerKey,
    scope: scopeType,
    scopeId
  });
  return `/admin/question-banks/statistics?${query.toString()}`;
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

export function QuestionBankStatisticsTree({ tree, selectedScope, province, examType, ownerKey }: QuestionBankStatisticsTreeProps) {
  const { directoryCollapsed, setDirectoryCollapsed } = useQuestionBankStatisticsUi();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(() => new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => new Set());
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  useEffect(() => {
    if (!selectedScope || selectedScope.type === "course") {
      return;
    }

    tree.forEach((course) => {
      const selectedChapter = course.chapters.find((chapter) => chapter.id === selectedScope.id || chapter.sections.some((section) => section.id === selectedScope.id));
      if (!selectedChapter) {
        return;
      }
      setExpandedCourses((current) => new Set(current).add(course.id));
      if (selectedScope.type === "section") {
        setExpandedChapters((current) => new Set(current).add(selectedChapter.id));
      }
    });
  }, [selectedScope, tree]);

  const visibleTree = useMemo(() => {
    if (!normalizedSearchQuery) {
      return tree;
    }

    return tree
      .map((course) => {
        const courseMatches = includesQuery(course.path, normalizedSearchQuery);
        const chapters = course.chapters
          .map((chapter) => {
            const chapterMatches = includesQuery(chapter.path, normalizedSearchQuery);
            const sections = chapter.sections.filter((section) => courseMatches || chapterMatches || includesQuery(section.path, normalizedSearchQuery));
            if (courseMatches || chapterMatches || sections.length > 0) {
              return {
                ...chapter,
                sections: courseMatches || chapterMatches ? chapter.sections : sections
              };
            }
            return null;
          })
          .filter((chapter): chapter is QuestionBankStatisticsChapterNode => Boolean(chapter));

        if (courseMatches || chapters.length > 0) {
          return {
            ...course,
            chapters: courseMatches ? course.chapters : chapters
          };
        }
        return null;
      })
      .filter((course): course is QuestionBankStatisticsCourseNode => Boolean(course));
  }, [normalizedSearchQuery, tree]);

  function toggleCourse(courseId: string) {
    setExpandedCourses((current) => {
      const next = new Set(current);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }

  function toggleChapter(chapterId: string) {
    setExpandedChapters((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }

  function nodeHref(scopeType: QuestionBankStatisticsScopeType, scopeId: string) {
    return statisticsHref({ province, examType, ownerKey, scopeType, scopeId });
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#d8e0ec] bg-white shadow-sm">
      <div className={cn("flex h-12 items-center border-b border-[#e2e8f0]", directoryCollapsed ? "justify-center px-2" : "gap-3 px-4")}>
        {directoryCollapsed ? null : (
          <>
            <h1 className="shrink-0 text-sm font-black">知识点目录</h1>
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={15} />
              <input
                aria-label="搜索知识点"
                className="h-8 w-full rounded border border-[#d7dee8] bg-[#fbfcfe] pl-8 pr-3 text-xs font-medium text-[#071b38] outline-none focus:border-[#8fb3ff] focus:ring-2 focus:ring-[#dbeafe]"
                placeholder="搜索知识点：数字视频"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
          </>
        )}
        <button
          aria-label={directoryCollapsed ? "展开知识点目录" : "收缩知识点目录"}
          className={cn(
            "inline-flex h-8 items-center justify-center gap-1 rounded border border-[#d7dee8] text-xs font-bold text-[#475569] hover:border-[#aebbd0] hover:bg-[#f8fafc] hover:text-[#1d4ed8]",
            directoryCollapsed ? "w-9" : "px-2"
          )}
          title={directoryCollapsed ? "展开知识点目录" : "收缩知识点目录"}
          type="button"
          onClick={() => setDirectoryCollapsed(!directoryCollapsed)}
        >
          {directoryCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {directoryCollapsed ? null : <span>收起</span>}
        </button>
      </div>
      {directoryCollapsed ? (
        <button
          aria-label="展开知识点目录"
          className="flex min-h-0 flex-1 flex-col items-center gap-3 px-2 py-4 text-[#64748b] hover:bg-[#f8fafc] hover:text-[#1d4ed8]"
          title="展开知识点目录"
          type="button"
          onClick={() => setDirectoryCollapsed(false)}
        >
          <BookOpen size={18} />
          <span className="text-xs font-black [writing-mode:vertical-rl]">知识点目录</span>
        </button>
      ) : (
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3 text-sm">
        {visibleTree.length === 0 ? (
          <div className="grid h-40 place-items-center text-sm text-[#94a3b8]">没有匹配的知识点。</div>
        ) : visibleTree.map((course) => {
          const courseActive = selectedScope?.type === "course" && selectedScope.id === course.id;
          const courseExpanded = normalizedSearchQuery.length > 0 || expandedCourses.has(course.id);
          return (
            <div key={course.id} className="mb-2">
              <div className={cn("grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-1 rounded px-1 py-1.5", courseActive ? "bg-[#eff6ff] ring-1 ring-[#93c5fd]" : "hover:bg-[#f8fafc]")}>
                <button className="grid size-6 place-items-center rounded text-[#475569] hover:bg-[#e2e8f0]" type="button" onClick={() => toggleCourse(course.id)} aria-label={courseExpanded ? "收缩课程" : "展开课程"}>
                  <ChevronRight size={15} className={cn("transition", courseExpanded ? "rotate-90" : "")} />
                </button>
                <Link className={cn("flex min-w-0 items-center gap-2 truncate font-black", courseActive ? "text-[#1d4ed8]" : "text-[#071b38]")} href={nodeHref("course", course.id)} title={course.path}>
                  <BookOpen size={15} className="shrink-0 text-[#2563eb]" />
                  <span className="truncate">{course.title}</span>
                </Link>
                <CountBadge count={course.count} />
              </div>

              {courseExpanded ? (
                <div className="mt-1 space-y-1 pl-7">
                  {course.chapters.map((chapter) => {
                    const chapterActive = selectedScope?.type === "chapter" && selectedScope.id === chapter.id;
                    const chapterExpanded = normalizedSearchQuery.length > 0 || expandedChapters.has(chapter.id);
                    return (
                      <div key={chapter.id}>
                        <div className={cn("grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-1 rounded px-1 py-1.5", chapterActive ? "bg-[#fff7ed] ring-1 ring-[#fdba74]" : "hover:bg-[#f8fafc]")}>
                          <button className="grid size-6 place-items-center rounded text-[#64748b] hover:bg-[#e2e8f0]" type="button" onClick={() => toggleChapter(chapter.id)} aria-label={chapterExpanded ? "收缩章" : "展开章"}>
                            <ChevronRight size={14} className={cn("transition", chapterExpanded ? "rotate-90" : "")} />
                          </button>
                          <Link className={cn("flex min-w-0 items-center gap-2 truncate font-bold", chapterActive ? "text-[#c2410c]" : "text-[#334155]")} href={nodeHref("chapter", chapter.id)} title={chapter.path}>
                            <Folder size={14} className="shrink-0 text-[#f59e0b]" />
                            <span className="truncate">{chapter.title}</span>
                          </Link>
                          <CountBadge count={chapter.count} />
                        </div>

                        {chapterExpanded ? (
                          <div className="mt-1 space-y-1 pl-7">
                            {chapter.sections.map((section) => {
                              const sectionActive = selectedScope?.type === "section" && selectedScope.id === section.id;
                              return (
                                <Link
                                  key={section.id}
                                  className={cn(
                                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-2 text-xs transition",
                                    sectionActive ? "bg-[#ecfeff] font-black text-[#0e7490] ring-1 ring-[#67e8f9]" : "text-[#071b38] hover:bg-[#f8fafc]"
                                  )}
                                  href={nodeHref("section", section.id)}
                                  title={section.path}
                                >
                                  <span className="flex min-w-0 items-center gap-2 truncate">
                                    <FileText size={13} className="shrink-0 text-[#0891b2]" />
                                    <span className="truncate">{section.title}</span>
                                  </span>
                                  <CountBadge count={section.count} />
                                </Link>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      )}
    </aside>
  );
}
