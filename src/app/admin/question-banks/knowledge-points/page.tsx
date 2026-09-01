import Link from "next/link";
import { Filter } from "lucide-react";
import { QuestionBankKnowledgeMap, type KnowledgeMapNode, type KnowledgeMapOwner } from "@/components/question-bank-knowledge-map";
import { requireAdmin } from "@/lib/auth";
import { ensureDefaultQuestionBankCatalog, type QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type SearchParams = {
  type?: string;
  id?: string;
  province?: string;
  examType?: string;
};

type RegionOption = {
  id: string;
  name: string;
  province: string;
  studySystem: string;
};

type SyllabusItem = {
  id: string;
  courseId: string;
  parentId: string | null;
  code: string | null;
  title: string;
  sortOrder: number;
};

type OwnerOption = KnowledgeMapOwner & {
  sortOrder: number;
  regions: RegionOption[];
};

function isOwnerType(value?: string): value is QuestionBankOwnerType {
  return value === "public_subject" || value === "major";
}

function ownerKey(owner: Pick<KnowledgeMapOwner, "type" | "id">) {
  return `${owner.type}:${owner.id}`;
}

function ownerQuestionBankHref(owner: KnowledgeMapOwner, province = "", examType = "") {
  const query = new URLSearchParams({ type: owner.type, id: owner.id, page: "1" });
  if (province) query.set("province", province);
  if (examType) query.set("examType", examType);
  return `/admin/question-banks?${query.toString()}`;
}

function ownerKnowledgeMapHref(owner: KnowledgeMapOwner, province = "", examType = "") {
  const query = new URLSearchParams({ type: owner.type, id: owner.id });
  if (province) query.set("province", province);
  if (examType) query.set("examType", examType);
  return `/admin/question-banks/knowledge-points?${query.toString()}`;
}

function ownerStatisticsHref(owner: KnowledgeMapOwner, province = "", examType = "") {
  const query = new URLSearchParams({ type: owner.type, id: owner.id });
  if (province) query.set("province", province);
  if (examType) query.set("examType", examType);
  return `/admin/question-banks/statistics?${query.toString()}`;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sortNodes(nodes: KnowledgeMapNode[]) {
  nodes.sort((left, right) => {
    const codeCompare = (left.code || "").localeCompare(right.code || "", "zh-Hans-CN", { numeric: true });
    return codeCompare || left.title.localeCompare(right.title, "zh-Hans-CN");
  });
  nodes.forEach((node) => sortNodes(node.children));
}

function buildSyllabusTree(items: SyllabusItem[]) {
  const nodes = new Map<string, KnowledgeMapNode>();
  const roots: KnowledgeMapNode[] = [];

  items.forEach((item) => {
    nodes.set(item.id, {
      id: item.id,
      courseId: item.courseId,
      parentId: item.parentId,
      code: item.code,
      title: item.title,
      children: []
    });
  });

  items.forEach((item) => {
    const node = nodes.get(item.id);
    if (!node) {
      return;
    }
    if (item.parentId && nodes.has(item.parentId)) {
      nodes.get(item.parentId)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  sortNodes(roots);
  return roots;
}

export default async function QuestionBankKnowledgePointsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  await ensureDefaultQuestionBankCatalog();

  const params = await searchParams;
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
  const selectedExamType = examTypeOptions.includes(params?.examType || "") ? params?.examType || "" : examTypeOptions[0] || "";
  const matchingRegions = regions.filter(
    (region) => region.province === selectedProvince && region.studySystem === selectedExamType
  );
  const matchingRegionIds = new Set(matchingRegions.map((region) => region.id));

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
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      if (a.type !== b.type) {
        return a.type === "public_subject" ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });

  const requestedType = isOwnerType(params?.type) ? params.type : undefined;
  const requestedOwner = owners.find((owner) => owner.type === requestedType && owner.id === params?.id);
  const computerOwner = owners.find((owner) => owner.type === "major" && owner.name.includes("计算机"));
  const selectedOwner = requestedOwner || computerOwner || owners[0];

  if (!selectedOwner) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5f9] text-sm text-slate-500">
        暂无可展示的知识点。
      </main>
    );
  }

  const courses = await prisma.learningCourse.findMany({
    where: {
      courseType: selectedOwner.type,
      ...(selectedOwner.type === "public_subject" ? { publicSubjectId: selectedOwner.id } : { majorId: selectedOwner.id }),
      regionId: { in: matchingRegions.map((region) => region.id) }
    },
    include: {
      syllabusItems: {
        where: { checkpointScope: null },
        select: {
          id: true,
          courseId: true,
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

  const root: KnowledgeMapNode = {
    id: ownerKey(selectedOwner),
    title: selectedOwner.name,
    children: courses.map((course) => ({
      id: course.id,
      courseId: course.id,
      title: course.name,
      code: null,
      children: buildSyllabusTree(course.syllabusItems)
    }))
  };

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-[#081a33]">
      <header className="flex h-[64px] min-w-0 border-b border-[#d6dbe4] bg-[#f7f8fb]">
        <nav className="flex shrink-0" aria-label="内容管理">
          {[
            { label: "题库", href: ownerQuestionBankHref(selectedOwner, selectedProvince, selectedExamType), active: false },
            { label: "知识点题目统计", href: ownerStatisticsHref(selectedOwner, selectedProvince, selectedExamType), active: false },
            { label: "知识点", href: ownerKnowledgeMapHref(selectedOwner, selectedProvince, selectedExamType), active: true }
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
        <form className="flex min-w-0 flex-1 items-center gap-2 px-3" action="/admin/question-banks/knowledge-points">
          <input name="type" type="hidden" value={selectedOwner.type} />
          <input name="id" type="hidden" value={selectedOwner.id} />
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
          <button className="mt-3 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded bg-[#3562ff] px-4 text-xs font-bold text-white hover:bg-[#1d4ed8]" type="submit">
            <Filter size={14} />
            筛选
          </button>
        </form>
        <Link className="grid h-[63px] w-20 shrink-0 place-items-center text-sm font-semibold text-[#071b38] hover:bg-white" href="/admin" aria-label="返回首页">
          首页
        </Link>
      </header>

      <QuestionBankKnowledgeMap
        owners={owners.map((owner) => ({ type: owner.type, id: owner.id, name: owner.name }))}
        selectedOwner={{ type: selectedOwner.type, id: selectedOwner.id, name: selectedOwner.name }}
        selectedOwnerKey={ownerKey(selectedOwner)}
        root={root}
        province={selectedProvince}
        examType={selectedExamType}
      />
    </main>
  );
}
