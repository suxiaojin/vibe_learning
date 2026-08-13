import Link from "next/link";
import { ArrowDown, ArrowUp, BarChart3, CheckCircle2, FileText, Filter, Plus, Sparkles, Trash2, UserCheck } from "lucide-react";
import {
  addQuestionToChapterChallenge,
  deleteChapterChallenge,
  moveChapterChallengeQuestion,
  removeQuestionFromChapterChallenge,
  saveChapterChallenge,
  updateChapterChallengeTarget
} from "@/app/admin/question-banks/challenge-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  QuestionBankStatisticsTree,
  QuestionBankStatisticsUiProvider,
  QuestionBankStatisticsWorkspace,
  type QuestionBankStatisticsScopeType
} from "@/components/question-bank-statistics-tree";
import { requireAdmin } from "@/lib/auth";
import { ensureDefaultQuestionBankCatalog, type QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import { prisma } from "@/lib/prisma";
import { isAiGeneratedQuestionBankTitle, isRealQuestionBankTitle } from "@/lib/question-bank-source";
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
  bankSource?: string;
  questionType?: string;
  challengeId?: string;
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
type BankSourceFilter = "all" | "ai_generated" | "real_exam";
type BankSource = "ai_generated" | "real_exam" | "other";
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
  knowledgePointTitles: string[];
  type: string;
  difficulty: string;
  source: TagSource;
  bankSource: BankSource;
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

const difficultyLabels: Record<string, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
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

function isBankSourceFilter(value?: string): value is BankSourceFilter {
  return value === "ai_generated" || value === "real_exam" || value === "all";
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
  bankSource?: BankSourceFilter;
  questionType?: string;
  challengeId?: string;
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
  if (params.bankSource && params.bankSource !== "all") {
    query.set("bankSource", params.bankSource);
  }
  if (params.questionType) {
    query.set("questionType", params.questionType);
  }
  if (params.challengeId) {
    query.set("challengeId", params.challengeId);
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
  const labels = new Map<string, { id: string; path: string; title: string }>();

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
        path: [course.name, ...displayItems.map((ancestor) => ancestor.title)].join(" - "),
        title: item.title
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
      const sectionIds = [chapter.id, ...sections.flatMap((section) => section.sectionIds)];
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
  poetry_appreciation: "proof",
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

function bankSourceForTitle(title: string): BankSource {
  if (isAiGeneratedQuestionBankTitle(title)) {
    return "ai_generated";
  }
  if (isRealQuestionBankTitle(title)) {
    return "real_exam";
  }
  return "other";
}

function bankSourceFilterLabel(source: BankSourceFilter) {
  if (source === "ai_generated") {
    return "AI生成题库";
  }
  if (source === "real_exam") {
    return "历年真题";
  }
  return "全部题库来源";
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
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span>{label}</span>
        <span className="grid size-6 place-items-center rounded border border-current bg-white/70">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-black leading-none">{value}</p>
    </>
  );

  if (href) {
    return (
      <Link className={cn("rounded-lg border p-3 shadow-sm transition hover:brightness-[0.98]", metricToneClass(tone, active))} href={href}>
        {content}
      </Link>
    );
  }

  return <div className={cn("rounded-lg border p-3 shadow-sm", metricToneClass(tone, active))}>{content}</div>;
}

function BankSourceFilterChip({
  label,
  count,
  href,
  active,
  tone
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
  tone: "cyan" | "blue";
}) {
  const className =
    tone === "cyan"
      ? active
        ? "border-[#06b6d4] bg-[#06b6d4] text-white shadow-sm shadow-[#06b6d4]/30"
        : "border-[#67e8f9] bg-[#ecfeff] text-[#0e7490]"
      : active
        ? "border-[#3562ff] bg-[#3562ff] text-white shadow-sm shadow-[#3562ff]/25"
        : "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]";

  return (
    <Link className={cn("inline-flex h-8 items-center rounded border px-3 text-xs font-black transition hover:brightness-[0.97]", className)} href={href}>
      {count}道{label}
    </Link>
  );
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
  const bankSourceFilter: BankSourceFilter = isBankSourceFilter(params?.bankSource) ? params.bankSource : "all";
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
            ownerType: selectedOwner.type,
            ...(selectedOwner.type === "public_subject"
              ? { publicSubjectId: selectedOwner.id }
              : { majorId: selectedOwner.id }),
            region: {
              province: selectedProvince,
              studySystem: selectedExamType
            },
            status: "published"
          },
          question: {
            status: "published",
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
              difficulty: true,
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
    const knowledgePointTitles = uniqueValues(
      paperQuestion.question.knowledgeTags.map((tag) => displayBySyllabusItemId.get(tag.syllabusItemId)?.title || "")
    ).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
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
        knowledgePointTitles,
        type: paperQuestion.question.type,
        difficulty: paperQuestion.question.difficulty,
        source,
        bankSource: bankSourceForTitle(paperQuestion.paper.title)
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
  const challengeVersions = selectedScope?.type === "chapter"
    ? await prisma.chapterChallengeVersion.findMany({
        where: {
          chapterId: selectedScope.id,
          status: { in: ["draft", "published"] }
        },
        select: {
          id: true,
          version: true,
          targetQuestionCount: true,
          status: true,
          publishedAt: true,
          questions: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              questionId: true,
              sortOrder: true,
              question: {
                select: {
                  stem: true,
                  type: true,
                  difficulty: true,
                  source: true
                }
              }
            }
          }
        },
        orderBy: { version: "desc" }
      })
    : [];
  const challengeVersion = challengeVersions.find((version) => version.id === params?.challengeId)
    || challengeVersions.find((version) => version.status === "draft")
    || challengeVersions.find((version) => version.status === "published")
    || challengeVersions[0]
    || null;
  const selectedChallengeQuestionIds = new Set(challengeVersion?.questions.map((item) => item.questionId) || []);
  const challengeQuestionLimitReached = Boolean(
    challengeVersion && challengeVersion.questions.length >= challengeVersion.targetQuestionCount
  );
  const otherChallengeByQuestionId = new Map<string, number>();
  [...challengeVersions]
    .sort((left, right) => left.version - right.version)
    .forEach((version) => {
      if (version.id === challengeVersion?.id) {
        return;
      }
      version.questions.forEach((item) => {
        if (!otherChallengeByQuestionId.has(item.questionId)) {
          otherChallengeByQuestionId.set(item.questionId, version.version);
        }
      });
    });
  const selectedScopeRows = selectedScope ? rowsForSectionIds(rowsBySection, selectedScope.sectionIds) : [];
  const selectedStats = statsFromRows(selectedScopeRows);
  const sourceFilteredRows = selectedScopeRows.filter((row) => sourceFilter === "all" || row.source === sourceFilter);
  const bankSourceCounts = sourceFilteredRows.reduce<Record<Exclude<BankSourceFilter, "all">, number>>(
    (counts, row) => {
      if (row.bankSource === "ai_generated" || row.bankSource === "real_exam") {
        counts[row.bankSource] += 1;
      }
      return counts;
    },
    { ai_generated: 0, real_exam: 0 }
  );
  const bankSourceFilteredRows = sourceFilteredRows.filter((row) => bankSourceFilter === "all" || row.bankSource === bankSourceFilter);
  const questionTypeCounts = bankSourceFilteredRows.reduce<Map<string, number>>((counts, row) => {
    counts.set(row.type, (counts.get(row.type) || 0) + 1);
    return counts;
  }, new Map());
  const questionTypeEntries = [...questionTypeCounts.entries()].sort((left, right) => {
    const rankCompare = questionTypeSortRank(left[0]) - questionTypeSortRank(right[0]);
    return rankCompare || questionTypeLabel(left[0]).localeCompare(questionTypeLabel(right[0]), "zh-Hans-CN");
  });
  const selectedQuestionType = params?.questionType && questionTypeCounts.has(params.questionType) ? params.questionType : "";
  const selectedRows = selectedScope
    ? bankSourceFilteredRows
        .filter((row) => !selectedQuestionType || row.type === selectedQuestionType)
        .sort((left, right) => {
          const leftKnowledgePoint = left.knowledgePointTitles.join(" / ");
          const rightKnowledgePoint = right.knowledgePointTitles.join(" / ");
          if (leftKnowledgePoint && !rightKnowledgePoint) {
            return -1;
          }
          if (!leftKnowledgePoint && rightKnowledgePoint) {
            return 1;
          }
          const knowledgePointCompare = leftKnowledgePoint.localeCompare(rightKnowledgePoint, "zh-Hans-CN");
          const yearCompare = (right.paperYear || 0) - (left.paperYear || 0);
          return knowledgePointCompare || yearCompare || left.paperTitle.localeCompare(right.paperTitle, "zh-Hans-CN") || left.sortOrder - right.sortOrder;
        })
    : [];
  const selectedStatus = challengeStatus(selectedStats.total);
  const chapterChallengePanel = selectedScope?.type === "chapter" ? (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#d8e0ec] bg-white shadow-sm">
      <div className="border-b border-[#e2e8f0] px-4 py-3">
        <h3 className="text-sm font-black text-[#071b38]">章关卡组题</h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <form action={updateChapterChallengeTarget} className="flex items-end gap-2">
          <input name="chapterId" type="hidden" value={selectedScope.id} />
          <input name="challengeVersionId" type="hidden" value={challengeVersion?.id || ""} />
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-[#475569]">
            本关题数
            <input
              className="h-9 w-full rounded border border-[#cfd8e6] bg-white px-3 text-sm font-bold"
              defaultValue={challengeVersion?.targetQuestionCount || 10}
              max={100}
              min={1}
              name="targetQuestionCount"
              type="number"
            />
          </label>
          <button className="h-9 shrink-0 rounded border border-[#cfd8e6] bg-white px-3 text-xs font-black text-[#3562ff] hover:bg-[#eff6ff]" type="submit">
            保存题数
          </button>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e2e8f0]">
            <div
              className={cn("h-full rounded-full", (challengeVersion?.questions.length || 0) === (challengeVersion?.targetQuestionCount || 10) ? "bg-[#16a34a]" : "bg-[#3562ff]")}
              style={{ width: `${Math.min(100, Math.round(((challengeVersion?.questions.length || 0) / (challengeVersion?.targetQuestionCount || 10)) * 100))}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-black text-[#334155]">
            已选 {challengeVersion?.questions.length || 0}/{challengeVersion?.targetQuestionCount || 10} 题
          </span>
        </div>

        {challengeVersion?.questions.length ? (
          <div className="mt-4 overflow-hidden rounded border border-[#e2e8f0] bg-white">
            {challengeVersion.questions.map((item, index) => (
              <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-t border-[#e2e8f0] px-3 py-2.5 first:border-t-0" key={item.id}>
                <span className="grid size-7 place-items-center rounded-full bg-[#eff6ff] text-xs font-black text-[#1d4ed8]">{index + 1}</span>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-xs font-bold leading-5 text-[#071b38]" title={stripHtml(item.question.stem)}>{stripHtml(item.question.stem)}</p>
                  <p className="mt-0.5 text-[11px] text-[#64748b]">
                    {questionTypeLabel(item.question.type)} · {difficultyLabels[item.question.difficulty] || item.question.difficulty} · {item.question.source}
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <form action={moveChapterChallengeQuestion}>
                      <input name="chapterId" type="hidden" value={selectedScope.id} />
                      <input name="challengeVersionId" type="hidden" value={challengeVersion.id} />
                      <input name="questionId" type="hidden" value={item.questionId} />
                      <input name="direction" type="hidden" value="up" />
                      <button aria-label="上移题目" className="grid size-7 place-items-center rounded border border-[#d7dee8] text-[#475569] disabled:opacity-30" disabled={index === 0} type="submit"><ArrowUp size={13} /></button>
                    </form>
                    <form action={moveChapterChallengeQuestion}>
                      <input name="chapterId" type="hidden" value={selectedScope.id} />
                      <input name="challengeVersionId" type="hidden" value={challengeVersion.id} />
                      <input name="questionId" type="hidden" value={item.questionId} />
                      <input name="direction" type="hidden" value="down" />
                      <button aria-label="下移题目" className="grid size-7 place-items-center rounded border border-[#d7dee8] text-[#475569] disabled:opacity-30" disabled={index === challengeVersion.questions.length - 1} type="submit"><ArrowDown size={13} /></button>
                    </form>
                    <form action={removeQuestionFromChapterChallenge}>
                      <input name="chapterId" type="hidden" value={selectedScope.id} />
                      <input name="challengeVersionId" type="hidden" value={challengeVersion.id} />
                      <input name="questionId" type="hidden" value={item.questionId} />
                      <button aria-label="移出关卡" className="grid size-7 place-items-center rounded border border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2]" type="submit"><Trash2 size={13} /></button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded border border-dashed border-[#cfd8e6] px-4 py-8 text-center text-xs leading-5 text-[#94a3b8]">
            尚未选择题目，请从中间题目列表加入本章关卡。
          </div>
        )}
      </div>

      <div className="border-t border-[#e2e8f0] bg-[#f8fafc] p-4">
        <p className="mb-3 text-xs leading-5 text-[#64748b]">
          {challengeVersion?.status === "draft" ? "保存要求已选题数与本关题数完全一致。" : "已保存关卡可继续增删题目、调整顺序或修改本关题数，修改立即生效。"}
        </p>
        {challengeVersion ? (
          <div className="flex gap-2">
            <form action={deleteChapterChallenge} id={`delete-challenge-${challengeVersion.id}`}>
              <input name="chapterId" type="hidden" value={selectedScope.id} />
              <input name="challengeVersionId" type="hidden" value={challengeVersion.id} />
            </form>
            <ConfirmSubmitButton
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded border border-[#fecaca] bg-white px-3 text-xs font-black text-[#dc2626] hover:bg-[#fef2f2]"
              form={`delete-challenge-${challengeVersion.id}`}
              message={`确认删除关卡${challengeVersion.version}？删除后该关卡的题目可加入其他关卡。`}
            >
              <Trash2 size={14} />
              删除关卡
            </ConfirmSubmitButton>
            {challengeVersion.status === "draft" ? (
              <form action={saveChapterChallenge} className="min-w-0 flex-1">
                <input name="chapterId" type="hidden" value={selectedScope.id} />
                <input name="challengeVersionId" type="hidden" value={challengeVersion.id} />
                <button
                  className="h-10 w-full rounded bg-[#16a34a] px-4 text-xs font-black text-white hover:bg-[#15803d] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
                  disabled={challengeVersion.questions.length !== challengeVersion.targetQuestionCount}
                  type="submit"
                >
                  保存
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  ) : null;

  return (
    <QuestionBankStatisticsUiProvider>
    <main className="min-h-screen bg-[#f3f5f9] text-[#081a33]">
      <header className="flex h-[64px] min-w-0 border-b border-[#d6dbe4] bg-[#f7f8fb]">
        <nav className="flex shrink-0" aria-label="内容管理">
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
                  source: sourceFilter,
                  bankSource: bankSourceFilter,
                  challengeId: challengeVersion?.id
                }),
                active: true
              },
            { label: "知识点", href: ownerKnowledgeMapHref(selectedOwner), active: false }
          ].map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                "grid h-[63px] min-w-[100px] place-items-center border-r border-[#e1e5ec] px-6 text-sm font-medium",
                tab.active ? "bg-[#e9edf3] text-[#071b38]" : "text-[#344054] hover:bg-white"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <form className="flex min-w-0 flex-1 items-center gap-2 px-3" action="/admin/question-banks/statistics">
          <label className="grid min-w-[130px] flex-1 gap-0.5 text-[10px] font-bold text-[#64748b]">
            省份
            <select className="h-8 min-w-0 rounded border border-[#cfd8e6] bg-white px-2 text-xs font-medium text-[#071b38]" name="province" defaultValue={selectedProvince}>
              {provinceOptions.map((province) => (
                <option key={province} value={province}>{province}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-[130px] flex-1 gap-0.5 text-[10px] font-bold text-[#64748b]">
            考试类型
            <select className="h-8 min-w-0 rounded border border-[#cfd8e6] bg-white px-2 text-xs font-medium text-[#071b38]" name="examType" defaultValue={selectedExamType}>
              {examTypeOptions.map((examType) => (
                <option key={examType} value={examType}>{examType}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-[150px] flex-[1.2] gap-0.5 text-[10px] font-bold text-[#64748b]">
            专业
            <select className="h-8 min-w-0 rounded border border-[#cfd8e6] bg-white px-2 text-xs font-medium text-[#071b38]" name="owner" defaultValue={ownerKey(selectedOwner)}>
              {owners.map((owner) => (
                <option key={ownerKey(owner)} value={ownerKey(owner)}>{owner.name}</option>
              ))}
            </select>
          </label>
          <button className="mt-3 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded bg-[#3562ff] px-4 text-xs font-bold text-white hover:bg-[#1d4ed8]" type="submit">
            <Filter size={14} />
            筛选
          </button>
        </form>
        <Link className="grid h-[63px] w-20 shrink-0 place-items-center text-sm font-semibold text-[#071b38] hover:bg-white" href="/admin" aria-label="返回首页">
          首页
        </Link>
      </header>

      <section className="grid h-[calc(100vh-64px)] w-full grid-rows-[minmax(0,1fr)] px-4 py-4 xl:px-5 2xl:px-6">
        <QuestionBankStatisticsWorkspace>
          <QuestionBankStatisticsTree
            tree={tree}
            selectedScope={selectedScope ? { type: selectedScope.type, id: selectedScope.id } : null}
            province={selectedProvince}
            examType={selectedExamType}
            ownerKey={ownerKey(selectedOwner)}
          />

          <section className={cn(
            "grid min-h-0 gap-4",
            chapterChallengePanel
              ? "grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_350px] 2xl:grid-cols-[minmax(0,1fr)_400px]"
              : "grid-cols-1"
          )}>
          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#d8e0ec] bg-white shadow-sm">
            <div className="flex min-h-16 items-center justify-between border-b border-[#e2e8f0] px-5 py-3">
              <div>
                <p className="text-xs font-bold text-[#64748b]">{selectedScope?.path || "请选择知识点"}</p>
                <h2 className="mt-1 text-xl font-black text-[#071b38]">{selectedScope?.title || "暂无知识点"}</h2>
              </div>
              <span className={cn("rounded-full border px-3 py-1 text-xs font-black", selectedStatus.className)}>{selectedStatus.label}</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
              <div className="grid shrink-0 grid-flow-col auto-cols-[minmax(132px,160px)] gap-2 overflow-x-auto pb-1">
                <MetricCard label="题库题目数" value={selectedStats.total} icon={<BarChart3 size={15} />} tone="blue" />
                <MetricCard label="去重题目数" value={selectedStats.uniqueQuestionIds.size} icon={<CheckCircle2 size={15} />} tone="green" />
                <MetricCard
                  label="AI打标"
                  value={selectedStats.ai}
                  icon={<Sparkles size={15} />}
                  active={sourceFilter === "ai"}
                  tone="cyan"
                  href={selectedScope ? statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, scopeType: selectedScope.type, scopeId: selectedScope.id, source: "ai", bankSource: bankSourceFilter, challengeId: challengeVersion?.id }) : undefined}
                />
                <MetricCard
                  label="人工打标"
                  value={selectedStats.manual}
                  icon={<UserCheck size={15} />}
                  active={sourceFilter === "manual"}
                  tone="amber"
                  href={selectedScope ? statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, scopeType: selectedScope.type, scopeId: selectedScope.id, source: "manual", bankSource: bankSourceFilter, challengeId: challengeVersion?.id }) : undefined}
                />
                {selectedScope?.type === "chapter"
                  ? [...challengeVersions].sort((left, right) => left.version - right.version).map((version) => {
                      const active = challengeVersion?.id === version.id;
                      return (
                        <Link
                          className={cn(
                            "rounded-lg border px-3 py-2 shadow-sm transition",
                            active
                              ? "border-[#3562ff] bg-[#eff6ff] text-[#1d4ed8] ring-1 ring-[#93c5fd]"
                              : "border-[#d7dee8] bg-white text-[#334155] hover:border-[#93c5fd] hover:bg-[#f8fbff]"
                          )}
                          href={statisticsHref({
                            province: selectedProvince,
                            examType: selectedExamType,
                            owner: selectedOwner,
                            scopeType: selectedScope.type,
                            scopeId: selectedScope.id,
                            source: sourceFilter,
                            bankSource: bankSourceFilter,
                            questionType: selectedQuestionType || undefined,
                            challengeId: version.id
                          })}
                          key={version.id}
                          title={`查看关卡${version.version}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold">关卡题库</span>
                            {version.status === "draft" ? <span className="rounded bg-[#fffbeb] px-1.5 py-0.5 text-[10px] font-black text-[#b45309]">编辑中</span> : null}
                          </div>
                          <p className="mt-2 text-2xl font-black leading-none">关卡{version.version}</p>
                        </Link>
                      );
                    })
                  : null}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black">题目列表</h3>
                  <p className="mt-1 text-xs text-[#64748b]">
                    当前显示：{sourceFilterLabel(sourceFilter)} / {bankSourceFilterLabel(bankSourceFilter)}{selectedQuestionType ? ` / ${questionTypeLabel(selectedQuestionType)}` : ""}，共 {selectedRows.length} 道。
                  </p>
                </div>
                {selectedScope && (sourceFilter !== "all" || bankSourceFilter !== "all" || selectedQuestionType) ? (
                  <Link className="rounded border border-[#cfd8e6] px-3 py-1.5 text-xs font-bold text-[#3562ff] hover:bg-[#eff6ff]" href={statisticsHref({ province: selectedProvince, examType: selectedExamType, owner: selectedOwner, scopeType: selectedScope.type, scopeId: selectedScope.id, challengeId: challengeVersion?.id })}>
                    查看全部
                  </Link>
                ) : null}
              </div>

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
                        bankSource: bankSourceFilter,
                        questionType: active ? undefined : type,
                        challengeId: challengeVersion?.id
                      })}
                    >
                      {count}道{questionTypeLabel(type)}
                    </Link>
                  );
                })}
                <BankSourceFilterChip
                  active={bankSourceFilter === "ai_generated"}
                  count={bankSourceCounts.ai_generated}
                  href={statisticsHref({
                    province: selectedProvince,
                    examType: selectedExamType,
                    owner: selectedOwner,
                    scopeType: selectedScope?.type,
                    scopeId: selectedScope?.id,
                    source: sourceFilter,
                    bankSource: bankSourceFilter === "ai_generated" ? undefined : "ai_generated",
                    questionType: selectedQuestionType || undefined,
                    challengeId: challengeVersion?.id
                  })}
                  label="AI生成"
                  tone="cyan"
                />
                <BankSourceFilterChip
                  active={bankSourceFilter === "real_exam"}
                  count={bankSourceCounts.real_exam}
                  href={statisticsHref({
                    province: selectedProvince,
                    examType: selectedExamType,
                    owner: selectedOwner,
                    scopeType: selectedScope?.type,
                    scopeId: selectedScope?.id,
                    source: sourceFilter,
                    bankSource: bankSourceFilter === "real_exam" ? undefined : "real_exam",
                    questionType: selectedQuestionType || undefined,
                    challengeId: challengeVersion?.id
                  })}
                  label="历年真题"
                  tone="blue"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[#e2e8f0]">
                <table className="w-full min-w-[1000px] border-collapse text-left text-sm 2xl:min-w-[1120px]">
                  <thead className="sticky top-0 bg-[#f1f5f9] text-xs text-[#334155]">
                    <tr className="h-10">
                      <th className="border-r border-[#e2e8f0] px-3 font-black">题干</th>
                      <th className="w-[180px] border-r border-[#e2e8f0] px-3 font-black">所属知识点</th>
                      <th className="w-[260px] border-r border-[#e2e8f0] px-3 font-black">题库</th>
                      <th className="w-[88px] border-r border-[#e2e8f0] px-3 font-black">题型</th>
                      <th className="w-[100px] border-r border-[#e2e8f0] px-3 font-black">打标来源</th>
                      <th className="w-[180px] px-3 font-black">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRows.length === 0 ? (
                      <tr>
                        <td className="h-56 text-center text-sm text-[#94a3b8]" colSpan={6}>
                          当前筛选下暂无题目。
                        </td>
                      </tr>
                    ) : selectedRows.map((row) => (
                      <tr key={`${row.paperQuestionId}:${row.questionId}`} className="border-t border-[#e2e8f0] odd:bg-white even:bg-[#fbfdff]">
                        <td className="px-3 py-3 font-medium text-[#071b38]">{row.stem}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {row.knowledgePointTitles.length ? row.knowledgePointTitles.map((title) => (
                              <span className="rounded border border-[#c7d7fe] bg-[#eff6ff] px-2 py-0.5 text-xs font-bold text-[#1d4ed8]" key={title}>{title}</span>
                            )) : <span className="text-xs text-[#94a3b8]">未标注</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[#334155]">{row.paperTitle}</td>
                        <td className="px-3 py-3">
                          <span className={cn("rounded border px-2 py-0.5 text-xs font-black", questionTypeChipClass(row.type))}>{questionTypeLabel(row.type)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-black", sourceBadgeClass(row.source))}>{sourceLabels[row.source]}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            {selectedScope?.type === "chapter" ? (
                              selectedChallengeQuestionIds.has(row.questionId) ? (
                                <span className="inline-flex items-center gap-1 text-xs font-black text-[#15803d]"><CheckCircle2 size={13} />已加入</span>
                              ) : otherChallengeByQuestionId.has(row.questionId) ? (
                                <button
                                  className="inline-flex cursor-not-allowed items-center gap-1 text-xs font-black text-[#94a3b8]"
                                  disabled
                                  title={`已加入关卡${otherChallengeByQuestionId.get(row.questionId)}`}
                                  type="button"
                                >
                                  <Plus size={13} />已加入关卡{otherChallengeByQuestionId.get(row.questionId)}
                                </button>
                              ) : challengeQuestionLimitReached ? (
                                <button
                                  className="inline-flex cursor-not-allowed items-center gap-1 text-xs font-black text-[#94a3b8]"
                                  disabled
                                  title={`本关最多加入${challengeVersion?.targetQuestionCount || 10}道题`}
                                  type="button"
                                >
                                  <Plus size={13} />已达题数上限
                                </button>
                              ) : (
                                <form action={addQuestionToChapterChallenge}>
                                  <input name="chapterId" type="hidden" value={selectedScope.id} />
                                  <input name="challengeVersionId" type="hidden" value={challengeVersion?.id || ""} />
                                  <input name="questionId" type="hidden" value={row.questionId} />
                                  <button className="inline-flex items-center gap-1 text-xs font-black text-[#3562ff] hover:underline" type="submit"><Plus size={13} />加入关卡</button>
                                </form>
                              )
                            ) : null}
                            <Link className="inline-flex items-center gap-1 text-xs font-bold text-[#3562ff] hover:underline" href={`/admin/question-banks/${row.paperId}?question=${row.paperQuestionId}#paper-question-${row.paperQuestionId}`}>
                              <FileText size={13} />
                              题库
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          {chapterChallengePanel}
          </section>
        </QuestionBankStatisticsWorkspace>
      </section>
    </main>
    </QuestionBankStatisticsUiProvider>
  );
}
