import Link from "next/link";
import { BarChart3, CheckCircle2, FileText, Filter, Sparkles, UserCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { ensureDefaultQuestionBankCatalog, type QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import { prisma } from "@/lib/prisma";
import { questionBankTypeDefaultLabels } from "@/lib/question-bank-types";
import { cn } from "@/lib/utils";

type SearchParams = {
  province?: string;
  examType?: string;
  owner?: string;
  type?: string;
  id?: string;
  syllabusItemId?: string;
  source?: string;
};

type RegionOption = {
  id: string;
  name: string;
  province: string;
  studySystem: string;
};

type OwnerOption = {
  type: QuestionBankOwnerType;
  id: string;
  name: string;
  sortOrder: number;
  regions: RegionOption[];
};

type SyllabusItemRow = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
  sortOrder: number;
};

type CourseRow = {
  id: string;
  name: string;
  sortOrder: number;
  syllabusItems: SyllabusItemRow[];
};

type SectionNode = {
  id: string;
  title: string;
  path: string;
  count: number;
};

type ChapterNode = {
  id: string;
  title: string;
  count: number;
  sections: SectionNode[];
};

type CourseNode = {
  id: string;
  title: string;
  count: number;
  chapters: ChapterNode[];
};

type SourceFilter = "all" | "ai" | "manual";
type TagSource = "ai" | "manual";

type SectionStats = {
  total: number;
  ai: number;
  manual: number;
  uniqueQuestionIds: Set<string>;
};

type QuestionRow = {
  paperQuestionId: string;
  paperId: string;
  paperTitle: string;
  paperYear: number | null;
  sortOrder: number;
  questionId: string;
  stem: string;
  type: string;
  source: TagSource;
};

const sourceLabels: Record<TagSource, string> = {
  ai: "AI",
  manual: "人工"
};

function isOwnerType(value?: string): value is QuestionBankOwnerType {
  return value === "public_subject" || value === "major";
}

function isSourceFilter(value?: string): value is SourceFilter {
  return value === "ai" || value === "manual" || value === "all";
}

function ownerKey(owner: Pick<OwnerOption, "type" | "id">) {
  return `${owner.type}:${owner.id}`;
}

function parseOwnerKey(value?: string) {
  if (!value) {
    return null;
  }
  const [type, id] = value.split(":");
  if (!isOwnerType(type) || !id) {
    return null;
  }
  return { type, id };
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function sortByCatalogOrder(left: OwnerOption, right: OwnerOption) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  if (left.type !== right.type) {
    return left.type === "public_subject" ? -1 : 1;
  }
  return left.name.localeCompare(right.name, "zh-Hans-CN");
}

function statisticsHref(params: {
  province: string;
  examType: string;
  owner: OwnerOption;
  syllabusItemId?: string;
  source?: SourceFilter;
}) {
  const query = new URLSearchParams({
    province: params.province,
    examType: params.examType,
    owner: ownerKey(params.owner)
  });
  if (params.syllabusItemId) {
    query.set("syllabusItemId", params.syllabusItemId);
  }
  if (params.source && params.source !== "all") {
    query.set("source", params.source);
  }
  return `/admin/question-banks/statistics?${query.toString()}`;
}

function ownerQuestionBankHref(owner: OwnerOption) {
  return `/admin/question-banks?type=${owner.type}&id=${encodeURIComponent(owner.id)}&page=1`;
}

function ownerKnowledgeMapHref(owner: OwnerOption) {
  return `/admin/question-banks/knowledge-points?type=${owner.type}&id=${encodeURIComponent(owner.id)}`;
}

function sortSyllabusItems(items: SyllabusItemRow[]) {
  return [...items].sort((left, right) => {
    const codeCompare = (left.code || "").localeCompare(right.code || "", "zh-Hans-CN", { numeric: true });
    return codeCompare || left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, "zh-Hans-CN");
  });
}

function buildKnowledgeDisplayMap(courses: CourseRow[]) {
  const labels = new Map<string, { id: string; path: string }>();

  courses.forEach((course) => {
    const itemById = new Map(course.syllabusItems.map((item) => [item.id, item]));

    function ancestorsFor(item: SyllabusItemRow) {
      const ancestors = [item];
      let parentId = item.parentId;

      while (parentId) {
        const parent = itemById.get(parentId);
        if (!parent) {
          break;
        }
        ancestors.unshift(parent);
        parentId = parent.parentId;
      }

      return ancestors;
    }

    course.syllabusItems.forEach((item) => {
      const ancestors = ancestorsFor(item);
      const displayItems = ancestors.slice(0, 2);
      const displayTarget = displayItems[displayItems.length - 1] || item;
      labels.set(item.id, {
        id: displayTarget.id,
        path: [course.name, ...displayItems.map((ancestor) => ancestor.title)].join(" - ")
      });
    });
  });

  return labels;
}

function buildKnowledgeTree(courses: CourseRow[], statsBySection: Map<string, SectionStats>) {
  return courses.map((course): CourseNode => {
    const items = sortSyllabusItems(course.syllabusItems);
    const childrenByParent = new Map<string | null, SyllabusItemRow[]>();

    items.forEach((item) => {
      const children = childrenByParent.get(item.parentId) || [];
      children.push(item);
      childrenByParent.set(item.parentId, children);
    });

    const chapters = (childrenByParent.get(null) || []).map((chapter): ChapterNode => {
      const sections = (childrenByParent.get(chapter.id) || []).map((section): SectionNode => {
        const count = statsBySection.get(section.id)?.total || 0;
        return {
          id: section.id,
          title: section.title,
          path: `${course.name} - ${chapter.title} - ${section.title}`,
          count
        };
      });
      return {
        id: chapter.id,
        title: chapter.title,
        count: sections.reduce((total, section) => total + section.count, 0),
        sections
      };
    });

    return {
      id: course.id,
      title: course.name,
      count: chapters.reduce((total, chapter) => total + chapter.count, 0),
      chapters
    };
  });
}

function firstSection(tree: CourseNode[]) {
  return tree.flatMap((course) => course.chapters.flatMap((chapter) => chapter.sections))[0] || null;
}

function findSection(tree: CourseNode[], sectionId?: string) {
  const sections = tree.flatMap((course) => course.chapters.flatMap((chapter) => chapter.sections));
  return sections.find((section) => section.id === sectionId) || sections.find((section) => section.count > 0) || sections[0] || null;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function questionTypeLabel(type: string) {
  return questionBankTypeDefaultLabels[type as keyof typeof questionBankTypeDefaultLabels] || type;
}

function emptyStats(): SectionStats {
  return {
    total: 0,
    ai: 0,
    manual: 0,
    uniqueQuestionIds: new Set<string>()
  };
}

function sourceBadgeClass(source: TagSource) {
  return source === "ai" ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]";
}

function sourceFilterLabel(source: SourceFilter) {
  if (source === "ai") {
    return "AI打标题目";
  }
  if (source === "manual") {
    return "人工打标题目";
  }
  return "全部题目";
}

function challengeStatus(count: number) {
  if (count <= 0) {
    return { label: "无题", className: "border-[#e5e7eb] bg-[#f8fafc] text-[#64748b]" };
  }
  if (count < 5) {
    return { label: "题量不足", className: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]" };
  }
  return { label: "可用于闯关", className: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" };
}

function MetricCard({
  label,
  value,
  icon,
  href,
  active
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
  active?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between text-xs font-bold text-[#64748b]">
        <span>{label}</span>
        <span className={cn("grid size-7 place-items-center rounded border", active ? "border-[#8fb3ff] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#e2e8f0] bg-[#f8fafc] text-[#475569]")}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-black leading-none text-[#071b38]">{value}</p>
    </>
  );

  if (href) {
    return (
      <Link className={cn("rounded-lg border bg-white p-4 shadow-sm transition hover:border-[#7aa2ff]", active ? "border-[#6d93ff] ring-2 ring-[#dbeafe]" : "border-[#d8e0ec]")} href={href}>
        {content}
      </Link>
    );
  }

  return <div className="rounded-lg border border-[#d8e0ec] bg-white p-4 shadow-sm">{content}</div>;
}

export default async function QuestionBankKnowledgeStatisticsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  await ensureDefaultQuestionBankCatalog();

  const params = await searchParams;
  const sourceFilter: SourceFilter = isSourceFilter(params?.source) ? params.source : "all";
  const [regions, publicSubjects, majors] = await Promise.all([
    prisma.region.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, province: true, studySystem: true }
    }),
    prisma.publicSubject.findMany({
      where: { status: { not: "archived" } },
      include: {
        regions: {
          include: { region: { select: { id: true, name: true, province: true, studySystem: true } } },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    prisma.major.findMany({
      where: { status: { not: "archived" } },
      include: {
        regions: {
          include: { region: { select: { id: true, name: true, province: true, studySystem: true } } },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    })
  ]);

  const provinceOptions = uniqueValues(regions.map((region) => region.province));
  const selectedProvince = provinceOptions.includes(params?.province || "")
    ? params?.province || ""
    : provinceOptions.includes("江苏")
      ? "江苏"
      : provinceOptions[0] || "";
  const examTypeOptions = uniqueValues(regions.filter((region) => region.province === selectedProvince).map((region) => region.studySystem));
  const selectedExamType = examTypeOptions.includes(params?.examType || "")
    ? params?.examType || ""
    : examTypeOptions.includes("专转本")
      ? "专转本"
      : examTypeOptions[0] || "";
  const matchingRegionIds = new Set(
    regions
      .filter((region) => region.province === selectedProvince && region.studySystem === selectedExamType)
      .map((region) => region.id)
  );

  const owners: OwnerOption[] = [
    ...publicSubjects.map((subject) => ({
      type: "public_subject" as const,
      id: subject.id,
      name: subject.name,
      sortOrder: subject.sortOrder,
      regions: subject.regions.map((item) => item.region)
    })),
    ...majors.map((major) => ({
      type: "major" as const,
      id: major.id,
      name: major.name,
      sortOrder: major.sortOrder,
      regions: major.regions.map((item) => item.region)
    }))
  ]
    .filter((owner) => owner.regions.some((region) => matchingRegionIds.has(region.id)))
    .sort(sortByCatalogOrder);

  const ownerFromSelect = parseOwnerKey(params?.owner);
  const ownerFromLegacyParams = isOwnerType(params?.type) && params?.id ? { type: params.type, id: params.id } : null;
  const requestedOwner = ownerFromSelect || ownerFromLegacyParams;
  const selectedOwner =
    owners.find((owner) => owner.type === requestedOwner?.type && owner.id === requestedOwner.id) ||
    owners.find((owner) => owner.type === "major" && owner.name.includes("计算机")) ||
    owners[0];

  if (!selectedOwner) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5f9] text-sm text-slate-500">
        暂无可统计的专业或公共课。
      </main>
    );
  }

  const courseWhere = {
    courseType: selectedOwner.type,
    ...(selectedOwner.type === "public_subject" ? { publicSubjectId: selectedOwner.id } : { majorId: selectedOwner.id }),
    region: {
      province: selectedProvince,
      studySystem: selectedExamType
    }
  };
  const courses = await prisma.learningCourse.findMany({
    where: courseWhere,
    select: {
      id: true,
      name: true,
      sortOrder: true,
      syllabusItems: {
        select: {
          id: true,
          parentId: true,
          code: true,
          title: true,
          sortOrder: true
        },
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { code: "asc" }]
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  const displayBySyllabusItemId = buildKnowledgeDisplayMap(courses);
  const allSyllabusItemIds = [...displayBySyllabusItemId.keys()];

  const paperQuestions = allSyllabusItemIds.length
    ? await prisma.examPaperQuestion.findMany({
        where: {
          paper: {
            course: courseWhere
          },
          question: {
            knowledgeTags: {
              some: {
                syllabusItemId: { in: allSyllabusItemIds }
              }
            }
          }
        },
        select: {
          id: true,
          sortOrder: true,
          paper: {
            select: {
              id: true,
              title: true,
              year: true,
              updatedAt: true
            }
          },
          question: {
            select: {
              id: true,
              stem: true,
              type: true,
              knowledgeTags: {
                where: {
                  syllabusItemId: { in: allSyllabusItemIds }
                },
                select: {
                  syllabusItemId: true,
                  source: true
                }
              }
            }
          }
        }
      })
    : [];

  const statsBySection = new Map<string, SectionStats>();
  const rowsBySection = new Map<string, QuestionRow[]>();

  paperQuestions.forEach((paperQuestion) => {
    const sourceBySection = new Map<string, TagSource>();
    paperQuestion.question.knowledgeTags.forEach((tag) => {
      const display = displayBySyllabusItemId.get(tag.syllabusItemId);
      if (!display) {
        return;
      }
      const current = sourceBySection.get(display.id);
      if (!current || tag.source === "manual") {
        sourceBySection.set(display.id, tag.source);
      }
    });

    sourceBySection.forEach((source, sectionId) => {
      const stats = statsBySection.get(sectionId) || emptyStats();
      stats.total += 1;
      stats[source] += 1;
      stats.uniqueQuestionIds.add(paperQuestion.question.id);
      statsBySection.set(sectionId, stats);

      const rows = rowsBySection.get(sectionId) || [];
      rows.push({
        paperQuestionId: paperQuestion.id,
        paperId: paperQuestion.paper.id,
        paperTitle: paperQuestion.paper.title,
        paperYear: paperQuestion.paper.year,
        sortOrder: paperQuestion.sortOrder,
        questionId: paperQuestion.question.id,
        stem: stripHtml(paperQuestion.question.stem),
        type: paperQuestion.question.type,
        source
      });
      rowsBySection.set(sectionId, rows);
    });
  });

  const tree = buildKnowledgeTree(courses, statsBySection);
  const fallbackSection = firstSection(tree);
  const selectedSection = findSection(tree, params?.syllabusItemId) || fallbackSection;
  const selectedStats = selectedSection ? statsBySection.get(selectedSection.id) || emptyStats() : emptyStats();
  const selectedRows = selectedSection
    ? (rowsBySection.get(selectedSection.id) || [])
        .filter((row) => sourceFilter === "all" || row.source === sourceFilter)
        .sort((left, right) => {
          const yearCompare = (right.paperYear || 0) - (left.paperYear || 0);
          return yearCompare || left.paperTitle.localeCompare(right.paperTitle, "zh-Hans-CN") || left.sortOrder - right.sortOrder;
        })
    : [];
  const selectedStatus = challengeStatus(selectedStats.total);

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-[#081a33]">
      <header className="grid h-[51px] grid-cols-[1fr_auto] border-b border-[#d6dbe4] bg-[#f7f8fb]">
        <nav className="flex" aria-label="内容管理">
          {[
            { label: "题库", href: ownerQuestionBankHref(selectedOwner), active: false },
            { label: "知识点题目统计", href: statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, syllabusItemId: selectedSection?.id, source: sourceFilter }), active: true },
            { label: "知识点", href: ownerKnowledgeMapHref(selectedOwner), active: false }
          ].map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                "grid h-[50px] min-w-[100px] place-items-center border-r border-[#e1e5ec] px-8 text-sm font-medium",
                tab.active ? "bg-[#e9edf3] text-[#071b38]" : "text-[#344054] hover:bg-white"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <Link className="grid h-[50px] w-24 place-items-center text-sm font-semibold text-[#071b38] hover:bg-white" href="/admin" aria-label="返回首页">
          首页
        </Link>
      </header>

      <section className="mx-auto grid h-[calc(100vh-51px)] max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] gap-4 px-5 py-4">
        <form className="grid grid-cols-[repeat(3,minmax(180px,1fr))_auto] gap-3 rounded-lg border border-[#d8e0ec] bg-white p-4 shadow-sm" action="/admin/question-banks/statistics">
          <label className="grid gap-1 text-xs font-bold text-[#475569]">
            省份
            <select className="h-10 rounded border border-[#cfd8e6] bg-white px-3 text-sm font-medium text-[#071b38]" name="province" defaultValue={selectedProvince}>
              {provinceOptions.map((province) => (
                <option key={province} value={province}>{province}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-[#475569]">
            考试类型
            <select className="h-10 rounded border border-[#cfd8e6] bg-white px-3 text-sm font-medium text-[#071b38]" name="examType" defaultValue={selectedExamType}>
              {examTypeOptions.map((examType) => (
                <option key={examType} value={examType}>{examType}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-[#475569]">
            专业
            <select className="h-10 rounded border border-[#cfd8e6] bg-white px-3 text-sm font-medium text-[#071b38]" name="owner" defaultValue={ownerKey(selectedOwner)}>
              {owners.map((owner) => (
                <option key={ownerKey(owner)} value={ownerKey(owner)}>{owner.name}</option>
              ))}
            </select>
          </label>
          <button className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded bg-[#3562ff] px-5 text-sm font-bold text-white hover:bg-[#1d4ed8]" type="submit">
            <Filter size={16} />
            筛选
          </button>
        </form>

        <section className="grid min-h-0 grid-cols-[390px_minmax(0,1fr)] gap-4">
          <aside className="min-h-0 overflow-hidden rounded-lg border border-[#d8e0ec] bg-white shadow-sm">
            <div className="flex h-12 items-center justify-between border-b border-[#e2e8f0] px-4">
              <h1 className="text-sm font-black">知识点目录</h1>
              <span className="text-xs font-medium text-[#64748b]">课程 - 章 - 节</span>
            </div>
            <div className="h-full min-h-0 overflow-auto px-3 py-3 text-sm">
              {tree.length === 0 ? (
                <div className="grid h-40 place-items-center text-sm text-[#94a3b8]">当前筛选下暂无知识点。</div>
              ) : tree.map((course) => (
                <div key={course.id} className="mb-4">
                  <div className="mb-2 flex items-center justify-between rounded bg-[#f1f5f9] px-3 py-2 font-black text-[#071b38]">
                    <span>{course.title}</span>
                    <span className="text-xs text-[#64748b]">{course.count}题</span>
                  </div>
                  <div className="space-y-2 pl-2">
                    {course.chapters.map((chapter) => (
                      <div key={chapter.id} className="border-l border-[#d9e2ef] pl-3">
                        <div className="mb-1 flex items-center justify-between text-xs font-bold text-[#475569]">
                          <span>{chapter.title}</span>
                          <span>{chapter.count}题</span>
                        </div>
                        <div className="space-y-1">
                          {chapter.sections.map((section) => {
                            const active = selectedSection?.id === section.id;
                            return (
                              <Link
                                key={section.id}
                                className={cn(
                                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-2 text-xs transition",
                                  active ? "bg-[#eff6ff] font-black text-[#1d4ed8] ring-1 ring-[#93c5fd]" : "text-[#071b38] hover:bg-[#f8fafc]"
                                )}
                                href={statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, syllabusItemId: section.id, source: sourceFilter })}
                                title={section.path}
                              >
                                <span className="truncate">{section.title}</span>
                                <span className={cn("rounded-full px-2 py-0.5 font-bold", section.count > 0 ? "bg-[#e0f2fe] text-[#0369a1]" : "bg-[#f1f5f9] text-[#94a3b8]")}>{section.count}题</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="min-h-0 overflow-hidden rounded-lg border border-[#d8e0ec] bg-white shadow-sm">
            <div className="flex min-h-16 items-center justify-between border-b border-[#e2e8f0] px-5 py-3">
              <div>
                <p className="text-xs font-bold text-[#64748b]">{selectedSection?.path || "请选择知识点"}</p>
                <h2 className="mt-1 text-xl font-black text-[#071b38]">{selectedSection?.title || "暂无知识点"}</h2>
              </div>
              <span className={cn("rounded-full border px-3 py-1 text-xs font-black", selectedStatus.className)}>{selectedStatus.label}</span>
            </div>

            <div className="grid gap-4 p-5">
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="题库题目数" value={selectedStats.total} icon={<BarChart3 size={15} />} />
                <MetricCard label="去重题目数" value={selectedStats.uniqueQuestionIds.size} icon={<CheckCircle2 size={15} />} />
                <MetricCard
                  label="AI打标"
                  value={selectedStats.ai}
                  icon={<Sparkles size={15} />}
                  active={sourceFilter === "ai"}
                  href={selectedSection ? statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, syllabusItemId: selectedSection.id, source: "ai" }) : undefined}
                />
                <MetricCard
                  label="人工打标"
                  value={selectedStats.manual}
                  icon={<UserCheck size={15} />}
                  active={sourceFilter === "manual"}
                  href={selectedSection ? statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, syllabusItemId: selectedSection.id, source: "manual" }) : undefined}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black">题目列表</h3>
                  <p className="mt-1 text-xs text-[#64748b]">当前显示：{sourceFilterLabel(sourceFilter)}，共 {selectedRows.length} 道。</p>
                </div>
                {sourceFilter !== "all" && selectedSection ? (
                  <Link className="rounded border border-[#cfd8e6] px-3 py-1.5 text-xs font-bold text-[#3562ff] hover:bg-[#eff6ff]" href={statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, syllabusItemId: selectedSection.id })}>
                    查看全部
                  </Link>
                ) : null}
              </div>

              <div className="min-h-0 overflow-auto rounded-lg border border-[#e2e8f0]">
                <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-[#f1f5f9] text-xs text-[#334155]">
                    <tr className="h-10">
                      <th className="border-r border-[#e2e8f0] px-3 font-black">题干</th>
                      <th className="w-[260px] border-r border-[#e2e8f0] px-3 font-black">题库</th>
                      <th className="w-[88px] border-r border-[#e2e8f0] px-3 font-black">题型</th>
                      <th className="w-[100px] border-r border-[#e2e8f0] px-3 font-black">打标来源</th>
                      <th className="w-[110px] px-3 font-black">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRows.length === 0 ? (
                      <tr>
                        <td className="h-56 text-center text-sm text-[#94a3b8]" colSpan={5}>
                          当前筛选下暂无题目。
                        </td>
                      </tr>
                    ) : selectedRows.map((row) => (
                      <tr key={`${row.paperQuestionId}:${row.questionId}`} className="border-t border-[#e2e8f0] odd:bg-white even:bg-[#fbfdff]">
                        <td className="px-3 py-3 font-medium text-[#071b38]">{row.stem}</td>
                        <td className="px-3 py-3 text-[#334155]">{row.paperTitle}</td>
                        <td className="px-3 py-3 text-[#334155]">{questionTypeLabel(row.type)}</td>
                        <td className="px-3 py-3">
                          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-black", sourceBadgeClass(row.source))}>{sourceLabels[row.source]}</span>
                        </td>
                        <td className="px-3 py-3">
                          <Link className="inline-flex items-center gap-1 text-xs font-bold text-[#3562ff] hover:underline" href={`/admin/question-banks/${row.paperId}`}>
                            <FileText size={13} />
                            跳转题库
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
