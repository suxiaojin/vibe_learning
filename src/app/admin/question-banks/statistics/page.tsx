import Link from "next/link";
import { BarChart3, CheckCircle2, FileText, Filter, Sparkles, UserCheck } from "lucide-react";
import {
  QuestionBankStatisticsTree,
  type QuestionBankStatisticsScopeType
} from "@/components/question-bank-statistics-tree";
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
  scope?: string;
  scopeId?: string;
  syllabusItemId?: string;
  source?: string;
  questionType?: string;
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
  sectionIds: string[];
};

type ChapterNode = {
  id: string;
  title: string;
  path: string;
  count: number;
  sectionIds: string[];
  sections: SectionNode[];
};

type CourseNode = {
  id: string;
  title: string;
  path: string;
  count: number;
  sectionIds: string[];
  chapters: ChapterNode[];
};

type SourceFilter = "all" | "ai" | "manual";
type TagSource = "ai" | "manual";

type ScopeType = QuestionBankStatisticsScopeType;

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

type SelectedScope = {
  type: ScopeType;
  id: string;
  title: string;
  path: string;
  sectionIds: string[];
};

const sourceLabels: Record<TagSource, string> = {
  ai: "AI",
  manual: "人工"
};

const questionTypeOrder = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "fill_blank",
  "calculation",
  "proof",
  "comprehensive"
];

function isOwnerType(value?: string): value is QuestionBankOwnerType {
  return value === "public_subject" || value === "major";
}

function isSourceFilter(value?: string): value is SourceFilter {
  return value === "ai" || value === "manual" || value === "all";
}

function isScopeType(value?: string): value is ScopeType {
  return value === "course" || value === "chapter" || value === "section";
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
  scopeType?: ScopeType;
  scopeId?: string;
  source?: SourceFilter;
  questionType?: string;
}) {
  const query = new URLSearchParams({
    province: params.province,
    examType: params.examType,
    owner: ownerKey(params.owner)
  });
  if (params.scopeType && params.scopeId) {
    query.set("scope", params.scopeType);
    query.set("scopeId", params.scopeId);
  }
  if (params.source && params.source !== "all") {
    query.set("source", params.source);
  }
  if (params.questionType) {
    query.set("questionType", params.questionType);
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

function rowsForSectionIds(rowsBySection: Map<string, QuestionRow[]>, sectionIds: string[]) {
  const rowsByPaperQuestion = new Map<string, QuestionRow>();

  sectionIds.forEach((sectionId) => {
    (rowsBySection.get(sectionId) || []).forEach((row) => {
      const current = rowsByPaperQuestion.get(row.paperQuestionId);
      if (!current || row.source === "manual") {
        rowsByPaperQuestion.set(row.paperQuestionId, row);
      }
    });
  });

  return [...rowsByPaperQuestion.values()];
}

function statsFromRows(rows: QuestionRow[]): SectionStats {
  return rows.reduce<SectionStats>((stats, row) => {
    stats.total += 1;
    stats[row.source] += 1;
    stats.uniqueQuestionIds.add(row.questionId);
    return stats;
  }, emptyStats());
}

function buildKnowledgeTree(courses: CourseRow[], rowsBySection: Map<string, QuestionRow[]>) {
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
        const sectionIds = [section.id];
        const count = statsFromRows(rowsForSectionIds(rowsBySection, sectionIds)).total;
        return {
          id: section.id,
          title: section.title,
          path: `${course.name} - ${chapter.title} - ${section.title}`,
          count,
          sectionIds
        };
      });
      const sectionIds = sections.flatMap((section) => section.sectionIds);
      return {
        id: chapter.id,
        title: chapter.title,
        path: `${course.name} - ${chapter.title}`,
        count: statsFromRows(rowsForSectionIds(rowsBySection, sectionIds)).total,
        sectionIds,
        sections
      };
    });
    const sectionIds = chapters.flatMap((chapter) => chapter.sectionIds);

    return {
      id: course.id,
      title: course.name,
      path: course.name,
      count: statsFromRows(rowsForSectionIds(rowsBySection, sectionIds)).total,
      sectionIds,
      chapters
    };
  });
}

function firstScope(tree: CourseNode[]): SelectedScope | null {
  const course = tree.find((item) => item.count > 0) || tree[0];
  if (!course) {
    return null;
  }
  return {
    type: "course",
    id: course.id,
    title: course.title,
    path: course.path,
    sectionIds: course.sectionIds
  };
}

function findScope(tree: CourseNode[], requestedScope: { type: ScopeType; id: string } | null): SelectedScope | null {
  if (!requestedScope) {
    return firstScope(tree);
  }

  for (const course of tree) {
    if (requestedScope.type === "course" && requestedScope.id === course.id) {
      return {
        type: "course",
        id: course.id,
        title: course.title,
        path: course.path,
        sectionIds: course.sectionIds
      };
    }
    for (const chapter of course.chapters) {
      if (requestedScope.type === "chapter" && requestedScope.id === chapter.id) {
        return {
          type: "chapter",
          id: chapter.id,
          title: chapter.title,
          path: chapter.path,
          sectionIds: chapter.sectionIds
        };
      }
      const section = chapter.sections.find((item) => requestedScope.type === "section" && item.id === requestedScope.id);
      if (section) {
        return {
          type: "section",
          id: section.id,
          title: section.title,
          path: section.path,
          sectionIds: section.sectionIds
        };
      }
    }
  }

  return firstScope(tree);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function questionTypeLabel(type: string) {
  return questionBankTypeDefaultLabels[type as keyof typeof questionBankTypeDefaultLabels] || type;
}

function questionTypeSortRank(type: string) {
  const canonicalType = questionTypeChipStyles[type] ? type : questionTypeStyleAliases[type] || type;
  const index = questionTypeOrder.indexOf(canonicalType);
  return index >= 0 ? index : questionTypeOrder.length;
}

const questionTypeChipStyles: Record<string, { chip: string; activeChip: string }> = {
  single_choice: {
    chip: "border-[#86efac] bg-[#dcfce7] text-[#166534]",
    activeChip: "border-[#22c55e] bg-[#22c55e] text-white shadow-sm shadow-[#22c55e]/30"
  },
  multiple_choice: {
    chip: "border-[#93c5fd] bg-[#dbeafe] text-[#1d4ed8]",
    activeChip: "border-[#3b82f6] bg-[#3b82f6] text-white shadow-sm shadow-[#3b82f6]/30"
  },
  true_false: {
    chip: "border-[#f6c35d] bg-[#fff3cf] text-[#92400e]",
    activeChip: "border-[#f59e0b] bg-[#f59e0b] text-white shadow-sm shadow-[#f59e0b]/30"
  },
  fill_blank: {
    chip: "border-[#67e8f9] bg-[#cffafe] text-[#0e7490]",
    activeChip: "border-[#06b6d4] bg-[#06b6d4] text-white shadow-sm shadow-[#06b6d4]/30"
  },
  calculation: {
    chip: "border-[#c4b5fd] bg-[#ede9fe] text-[#5b21b6]",
    activeChip: "border-[#8b5cf6] bg-[#8b5cf6] text-white shadow-sm shadow-[#8b5cf6]/30"
  },
  proof: {
    chip: "border-[#f9a8d4] bg-[#fce7f3] text-[#9d174d]",
    activeChip: "border-[#ec4899] bg-[#ec4899] text-white shadow-sm shadow-[#ec4899]/30"
  },
  comprehensive: {
    chip: "border-[#fda4af] bg-[#ffe4e6] text-[#be123c]",
    activeChip: "border-[#f43f5e] bg-[#f43f5e] text-white shadow-sm shadow-[#f43f5e]/30"
  }
};

const questionTypeStyleAliases: Record<string, string> = {
  term_explanation: "proof",
  calculation_analysis: "calculation",
  practical_writing: "comprehensive",
  short_answer: "fill_blank",
  essay: "comprehensive",
  comprehensive_analysis: "comprehensive",
  material_analysis: "proof",
  operation_record: "fill_blank",
  practical_operation: "calculation",
  application: "calculation",
  question_answer: "fill_blank",
  handwriting: "fill_blank",
  reading_comprehension: "comprehensive",
  classical_chinese_translation: "proof",
  writing: "comprehensive",
  legal_document: "proof",
  chinese_character_writing: "fill_blank",
  language_expression: "comprehensive",
  teaching_design: "calculation",
  comprehensive_essay: "comprehensive"
};

const defaultQuestionTypeChipStyle = {
  chip: "border-[#d7dee8] bg-[#eef2f7] text-[#344054]",
  activeChip: "border-[#667085] bg-[#667085] text-white"
};

function questionTypeChipClass(type: string, active = false) {
  const styleKey = questionTypeChipStyles[type] ? type : questionTypeStyleAliases[type];
  const style = styleKey ? questionTypeChipStyles[styleKey] : defaultQuestionTypeChipStyle;
  return active ? style.activeChip : style.chip;
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

function metricToneClass(tone: "blue" | "green" | "cyan" | "amber", active?: boolean) {
  const classes = {
    blue: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    green: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
    cyan: "border-[#a5f3fc] bg-[#ecfeff] text-[#0e7490]",
    amber: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]"
  };
  return cn(classes[tone], active ? "ring-2 ring-offset-1" : null);
}

function MetricCard({
  label,
  value,
  icon,
  href,
  active,
  tone = "blue"
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
  active?: boolean;
  tone?: "blue" | "green" | "cyan" | "amber";
}) {
  const content = (
    <>
      <div className="flex items-center justify-between text-xs font-bold">
        <span>{label}</span>
        <span className="grid size-7 place-items-center rounded border border-current bg-white/70">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-black leading-none">{value}</p>
    </>
  );

  if (href) {
    return (
      <Link className={cn("rounded-lg border p-4 shadow-sm transition hover:brightness-[0.98]", metricToneClass(tone, active))} href={href}>
        {content}
      </Link>
    );
  }

  return <div className={cn("rounded-lg border p-4 shadow-sm", metricToneClass(tone, active))}>{content}</div>;
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

  const tree = buildKnowledgeTree(courses, rowsBySection);
  const requestedScope =
    isScopeType(params?.scope) && params?.scopeId
      ? { type: params.scope, id: params.scopeId }
      : params?.syllabusItemId
        ? { type: "section" as const, id: params.syllabusItemId }
        : null;
  const selectedScope = findScope(tree, requestedScope);
  const selectedScopeRows = selectedScope ? rowsForSectionIds(rowsBySection, selectedScope.sectionIds) : [];
  const selectedStats = statsFromRows(selectedScopeRows);
  const sourceFilteredRows = selectedScopeRows.filter((row) => sourceFilter === "all" || row.source === sourceFilter);
  const questionTypeCounts = sourceFilteredRows.reduce<Map<string, number>>((counts, row) => {
    counts.set(row.type, (counts.get(row.type) || 0) + 1);
    return counts;
  }, new Map());
  const questionTypeEntries = [...questionTypeCounts.entries()].sort((left, right) => {
    const rankCompare = questionTypeSortRank(left[0]) - questionTypeSortRank(right[0]);
    return rankCompare || questionTypeLabel(left[0]).localeCompare(questionTypeLabel(right[0]), "zh-Hans-CN");
  });
  const selectedQuestionType = params?.questionType && questionTypeCounts.has(params.questionType) ? params.questionType : "";
  const selectedRows = selectedScope
    ? sourceFilteredRows
        .filter((row) => !selectedQuestionType || row.type === selectedQuestionType)
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
            {
              label: "知识点题目统计",
              href: statisticsHref({
                province: selectedProvince,
                examType: selectedExamType,
                owner: selectedOwner,
                scopeType: selectedScope?.type,
                scopeId: selectedScope?.id,
                source: sourceFilter
              }),
              active: true
            },
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
          <QuestionBankStatisticsTree
            tree={tree}
            selectedScope={selectedScope ? { type: selectedScope.type, id: selectedScope.id } : null}
            province={selectedProvince}
            examType={selectedExamType}
            ownerKey={ownerKey(selectedOwner)}
          />

          <section className="min-h-0 overflow-hidden rounded-lg border border-[#d8e0ec] bg-white shadow-sm">
            <div className="flex min-h-16 items-center justify-between border-b border-[#e2e8f0] px-5 py-3">
              <div>
                <p className="text-xs font-bold text-[#64748b]">{selectedScope?.path || "请选择知识点"}</p>
                <h2 className="mt-1 text-xl font-black text-[#071b38]">{selectedScope?.title || "暂无知识点"}</h2>
              </div>
              <span className={cn("rounded-full border px-3 py-1 text-xs font-black", selectedStatus.className)}>{selectedStatus.label}</span>
            </div>

            <div className="grid gap-4 p-5">
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="题库题目数" value={selectedStats.total} icon={<BarChart3 size={15} />} tone="blue" />
                <MetricCard label="去重题目数" value={selectedStats.uniqueQuestionIds.size} icon={<CheckCircle2 size={15} />} tone="green" />
                <MetricCard
                  label="AI打标"
                  value={selectedStats.ai}
                  icon={<Sparkles size={15} />}
                  active={sourceFilter === "ai"}
                  tone="cyan"
                  href={selectedScope ? statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, scopeType: selectedScope.type, scopeId: selectedScope.id, source: "ai" }) : undefined}
                />
                <MetricCard
                  label="人工打标"
                  value={selectedStats.manual}
                  icon={<UserCheck size={15} />}
                  active={sourceFilter === "manual"}
                  tone="amber"
                  href={selectedScope ? statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, scopeType: selectedScope.type, scopeId: selectedScope.id, source: "manual" }) : undefined}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black">题目列表</h3>
                  <p className="mt-1 text-xs text-[#64748b]">
                    当前显示：{sourceFilterLabel(sourceFilter)}{selectedQuestionType ? ` / ${questionTypeLabel(selectedQuestionType)}` : ""}，共 {selectedRows.length} 道。
                  </p>
                </div>
                {selectedScope && (sourceFilter !== "all" || selectedQuestionType) ? (
                  <Link className="rounded border border-[#cfd8e6] px-3 py-1.5 text-xs font-bold text-[#3562ff] hover:bg-[#eff6ff]" href={statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, scopeType: selectedScope.type, scopeId: selectedScope.id })}>
                    查看全部
                  </Link>
                ) : null}
              </div>

              {questionTypeEntries.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {questionTypeEntries.map(([type, count]) => {
                    const active = selectedQuestionType === type;
                    return (
                      <Link
                        key={type}
                        className={cn(
                          "inline-flex h-8 items-center rounded border px-3 text-xs font-black transition hover:brightness-[0.97]",
                          questionTypeChipClass(type, active)
                        )}
                        href={statisticsHref({
                          province: selectedProvince,
                          examType: selectedExamType,
                          owner: selectedOwner,
                          scopeType: selectedScope?.type,
                          scopeId: selectedScope?.id,
                          source: sourceFilter,
                          questionType: active ? undefined : type
                        })}
                      >
                        {count}道{questionTypeLabel(type)}
                      </Link>
                    );
                  })}
                </div>
              ) : null}

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
                        <td className="px-3 py-3">
                          <span className={cn("rounded border px-2 py-0.5 text-xs font-black", questionTypeChipClass(row.type))}>{questionTypeLabel(row.type)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-black", sourceBadgeClass(row.source))}>{sourceLabels[row.source]}</span>
                        </td>
                        <td className="px-3 py-3">
                          <Link className="inline-flex items-center gap-1 text-xs font-bold text-[#3562ff] hover:underline" href={`/admin/question-banks/${row.paperId}?question=${row.paperQuestionId}#paper-question-${row.paperQuestionId}`}>
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
