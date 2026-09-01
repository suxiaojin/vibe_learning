import Link from "next/link";
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Filter,
  ListFilter,
  Trash2
} from "lucide-react";
import { createQuestionBankPaper, deleteQuestionBankPaper, toggleQuestionBankPaperStatus, updateQuestionBankPaper } from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CopyQuestionBankDialog } from "@/components/copy-question-bank-dialog";
import { QuestionBankAiGenerationDialog } from "@/components/question-bank-ai-generation-dialog";
import { QuestionBankImportDialog } from "@/components/question-bank-import-dialog";
import { QuestionBankSidebar } from "@/components/question-bank-sidebar";
import { requireAdmin } from "@/lib/auth";
import { ensureDefaultQuestionBankCatalog, type QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import { buildAiReferenceKnowledgeTree } from "@/lib/question-bank-ai-reference";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type SearchParams = {
  type?: string;
  id?: string;
  page?: string;
  province?: string;
  examType?: string;
  copiedPaperId?: string;
  copyNotice?: string;
  mapped?: string;
  unmapped?: string;
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

const pageSize = 10;

function isOwnerType(value?: string): value is QuestionBankOwnerType {
  return value === "public_subject" || value === "major";
}

function ownerHref(owner: OwnerOption, page = 1, province = "", examType = "") {
  const query = new URLSearchParams({ type: owner.type, id: owner.id, page: String(page) });
  if (province) query.set("province", province);
  if (examType) query.set("examType", examType);
  return `/admin/question-banks?${query.toString()}`;
}

function ownerKnowledgeMapHref(owner: OwnerOption, province = "", examType = "") {
  const query = new URLSearchParams({ type: owner.type, id: owner.id });
  if (province) query.set("province", province);
  if (examType) query.set("examType", examType);
  return `/admin/question-banks/knowledge-points?${query.toString()}`;
}

function ownerStatisticsHref(owner: OwnerOption, province = "", examType = "") {
  const query = new URLSearchParams({ type: owner.type, id: owner.id });
  if (province) query.set("province", province);
  if (examType) query.set("examType", examType);
  return `/admin/question-banks/statistics?${query.toString()}`;
}

function paperHref(paperId: string, province: string, examType: string) {
  const query = new URLSearchParams({ province, examType });
  return `/admin/question-banks/${paperId}?${query.toString()}`;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatDate(date: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}/${value.month}/${value.day} ${value.hour}:${value.minute}`;
}

function ownerInputs(owner: OwnerOption) {
  return (
    <>
      <input type="hidden" name="ownerType" value={owner.type} />
      <input type="hidden" name="ownerId" value={owner.id} />
    </>
  );
}

function headerLabel(label: string) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{label}</span>
      <span className="inline-flex items-center gap-1 text-[#9aa0a8]">
        <ArrowUpDown size={13} />
        <ListFilter size={12} />
      </span>
    </span>
  );
}

function visiblePages(totalPages: number, currentPage: number) {
  const count = Math.min(totalPages, 4);
  const start = Math.max(1, Math.min(currentPage - 1, totalPages - count + 1));
  return Array.from({ length: count }, (_, index) => start + index);
}

export default async function QuestionBanksPage({
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
      include: {
        regions: {
          include: { region: { select: { id: true, name: true, province: true, studySystem: true } } },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    prisma.major.findMany({
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
  const selectedOwner =
    owners.find((owner) => owner.type === requestedType && owner.id === params?.id) ||
    owners.find((owner) => owner.type === "major" && owner.name.includes("计算机")) ||
    owners[0];
  const regionOptions = selectedOwner?.regions.filter((region) => matchingRegionIds.has(region.id)) || matchingRegions;

  if (!selectedOwner) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5f9] text-sm text-slate-500">
        暂无可管理的专业或公共课。
      </main>
    );
  }

  const aiReferenceKnowledgeTreeEntries = await Promise.all(
    regionOptions.map(async (region) => {
      const courseWhere = {
        courseType: selectedOwner.type,
        ...(selectedOwner.type === "public_subject" ? { publicSubjectId: selectedOwner.id } : { majorId: selectedOwner.id }),
        regionId: region.id
      };
      const courses = await prisma.learningCourse.findMany({
        where: courseWhere,
        select: {
          id: true,
          name: true,
          sortOrder: true,
          syllabusItems: {
            where: { checkpointScope: null },
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
      const syllabusItemIds = courses.flatMap((course) => course.syllabusItems.map((item) => item.id));
      const paperQuestions = syllabusItemIds.length
        ? await prisma.examPaperQuestion.findMany({
            where: {
              paper: {
                regionId: region.id,
                ownerType: selectedOwner.type,
                ...(selectedOwner.type === "public_subject"
                  ? { publicSubjectId: selectedOwner.id }
                  : { majorId: selectedOwner.id })
              },
              question: {
                knowledgeTags: {
                  some: {
                    syllabusItemId: { in: syllabusItemIds }
                  }
                }
              }
            },
            select: {
              id: true,
              question: {
                select: {
                  type: true,
                  knowledgeTags: {
                    where: {
                      syllabusItemId: { in: syllabusItemIds }
                    },
                    select: {
                      syllabusItemId: true
                    }
                  }
                }
              }
            }
          })
        : [];

      return [region.id, buildAiReferenceKnowledgeTree(courses, paperQuestions)] as const;
    })
  );
  const aiReferenceKnowledgeTreesByRegion = Object.fromEntries(aiReferenceKnowledgeTreeEntries);

  const paperWhere = {
    ownerType: selectedOwner.type,
    regionId: { in: matchingRegions.map((region) => region.id) },
    ...(selectedOwner.type === "public_subject" ? { publicSubjectId: selectedOwner.id } : { majorId: selectedOwner.id })
  };
  const totalPapers = await prisma.examPaper.count({ where: paperWhere });
  const totalPages = Math.max(1, Math.ceil(totalPapers / pageSize));
  const requestedPage = Math.max(1, Number(params?.page || 1) || 1);
  const currentPage = Math.min(requestedPage, totalPages);
  const [papers, selectedPaperNames] = await Promise.all([
    prisma.examPaper.findMany({
      where: paperWhere,
      include: {
        region: true,
        _count: {
          select: { questions: true }
        }
      },
      orderBy: [{ year: "desc" }, { updatedAt: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize
    }),
    prisma.examPaper.findMany({
      where: paperWhere,
      select: {
        id: true,
        title: true,
        _count: {
          select: { questions: true }
        }
      },
      orderBy: [{ year: "desc" }, { updatedAt: "desc" }]
    })
  ]);
  const pageNumbers = visiblePages(totalPages, currentPage);
  const copiedPaper = papers.find((paper) => paper.id === params?.copiedPaperId);
  const copiedMappedCount = Math.max(0, Number(params?.mapped || 0) || 0);
  const copiedUnmappedCount = Math.max(0, Number(params?.unmapped || 0) || 0);
  const courseManagementHref = selectedOwner.type === "major"
    ? `/admin/majors/${selectedOwner.id}/courses`
    : `/admin/public-subjects/${selectedOwner.id}/courses`;

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-[#081a33]">
      <header className="flex h-[64px] min-w-0 border-b border-[#d6dbe4] bg-[#f7f8fb]">
        <nav className="flex shrink-0" aria-label="内容管理">
          {[
            { label: "题库", href: ownerHref(selectedOwner, 1, selectedProvince, selectedExamType), active: true },
            { label: "知识点题目统计", href: ownerStatisticsHref(selectedOwner, selectedProvince, selectedExamType), active: false },
            { label: "知识点", href: ownerKnowledgeMapHref(selectedOwner, selectedProvince, selectedExamType), active: false }
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
        <form className="flex min-w-0 flex-1 items-center gap-2 px-3" action="/admin/question-banks">
          <input name="type" type="hidden" value={selectedOwner.type} />
          <input name="id" type="hidden" value={selectedOwner.id} />
          <input name="page" type="hidden" value="1" />
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

      <section className="grid h-[calc(100vh-64px)] grid-cols-[346px_minmax(0,1fr)]">
        <QuestionBankSidebar
          owners={owners}
          selectedOwnerKey={`${selectedOwner.type}:${selectedOwner.id}`}
          selectedPapers={selectedPaperNames}
          regions={matchingRegions}
          province={selectedProvince}
          examType={selectedExamType}
        />

        <section className="min-w-0 overflow-auto bg-[#f3f5f9] px-5 pb-10 pt-12">
          <div className="mx-auto max-w-[1535px]">
            {params?.copyNotice === "paper-copied" ? (
              <div className="mb-5 flex items-start gap-3 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950" role="status">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                <div>
                  <p className="font-bold">题库已复制到 {copiedPaper?.region.name || selectedProvince + selectedExamType}，新旧题库可以独立修改。</p>
                  <p className="mt-0.5 text-emerald-800">
                    已匹配 {copiedMappedCount} 项知识点关联
                    {copiedUnmappedCount ? `，${copiedUnmappedCount} 项无法匹配并已标记为未归类` : "，没有未匹配关联"}。
                  </p>
                </div>
              </div>
            ) : null}
            <div className="mb-9 flex min-h-[54px] items-start gap-12 pl-7">
              <details className="group relative">
                <summary className="grid cursor-pointer list-none justify-items-center gap-1 text-xs font-medium text-[#071b38] [&::-webkit-details-marker]:hidden">
                  <span className="relative grid size-8 place-items-center text-[#0872b9]">
                    <FilePlus2 size={27} strokeWidth={2.4} />
                    <span className="absolute -right-1 top-3 grid size-4 place-items-center rounded-full bg-[#2eb85c] text-xs font-black leading-none text-white">+</span>
                  </span>
                  新建题库
                </summary>
                <form action={createQuestionBankPaper} className="absolute left-0 z-20 mt-3 grid w-[360px] gap-3 border border-[#cdd4df] bg-white p-4 text-left shadow-xl">
                  {ownerInputs(selectedOwner)}
                  <div>
                    <label className="label">题库名称</label>
                    <input className="input rounded-none" name="title" placeholder="例如 2026届江苏专转本模拟卷" required />
                  </div>
                  <div className="grid grid-cols-[1fr_110px] gap-3">
                    <div>
                      <label className="label">区域信息</label>
                      <select className="input rounded-none" name="regionId" defaultValue={regionOptions[0]?.id} required>
                        {regionOptions.map((region) => (
                          <option key={region.id} value={region.id}>{region.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">年份</label>
                      <input className="input rounded-none" name="year" type="number" min="2000" max="2100" placeholder="2026" />
                    </div>
                  </div>
                  <button className="primary-button rounded-none" type="submit">保存</button>
                </form>
              </details>

              {!(selectedOwner.type === "public_subject" && selectedOwner.name.trim() === "高等数学") ? (
                <QuestionBankImportDialog
                  selectedOwner={{ type: selectedOwner.type, id: selectedOwner.id, name: selectedOwner.name, regions: selectedOwner.regions }}
                  regions={regions}
                />
              ) : null}

              <QuestionBankAiGenerationDialog
                selectedOwner={{ type: selectedOwner.type, id: selectedOwner.id, name: selectedOwner.name, regions: selectedOwner.regions }}
                regions={regions}
                knowledgeTreesByRegion={aiReferenceKnowledgeTreesByRegion}
              />
            </div>

            <section className="overflow-visible rounded-t-lg bg-white">
              <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
                <thead className="bg-[#f0f1f4] text-[#030712]">
                  <tr className="h-11">
                    <th className="border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("题库名称")}</th>
                    <th className="w-[90px] border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("题数")}</th>
                    <th className="w-[205px] border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("区域信息")}</th>
                    <th className="w-[110px] border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("年份")}</th>
                    <th className="w-[185px] border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("更新时间")}</th>
                    <th className="w-[250px] px-3 font-bold"></th>
                  </tr>
                </thead>
                <tbody>
                  {papers.length === 0 ? (
                    <tr>
                      <td className="h-64 border-b border-[#e5e7eb] text-center text-sm text-slate-500" colSpan={6}>
                        当前专业还没有题库。
                      </td>
                    </tr>
                  ) : papers.map((paper, index) => {
                    const isPublished = paper.status === "published";
                    return (
                      <tr
                        className={cn(
                          "h-[61px] scroll-mt-4 border-b border-[#e5e7eb]",
                          paper.id === params?.copiedPaperId ? "bg-emerald-50" : index === 0 ? "bg-[#e0e3e8]" : "bg-[#fbfbfc]"
                        )}
                        id={`paper-${paper.id}`}
                        key={paper.id}
                      >
                        <td className="px-3 font-medium text-[#071b38]">
                          <Link className="text-[#071b38] hover:text-[#006aff] hover:underline" href={paperHref(paper.id, selectedProvince, selectedExamType)}>
                            {paper.title}
                          </Link>
                        </td>
                        <td className="px-3 text-[#071b38]">{paper._count.questions}</td>
                        <td className="px-3 text-[#071b38]">{paper.region.name}</td>
                        <td className="px-3 text-[#071b38]">{paper.year || "-"}</td>
                        <td className="px-3 text-[#071b38]">{formatDate(paper.updatedAt)}</td>
                        <td className="px-3">
                          <div className="flex items-center justify-end gap-4">
                            <details className="relative">
                              <summary className="cursor-pointer list-none text-[#006aff] hover:underline [&::-webkit-details-marker]:hidden">修改</summary>
                              <form action={updateQuestionBankPaper} className="absolute right-0 z-50 mt-3 grid max-h-[430px] w-[430px] gap-3 overflow-auto border border-[#cdd4df] bg-white p-4 text-left shadow-xl">
                                {ownerInputs(selectedOwner)}
                                <input type="hidden" name="id" value={paper.id} />
                                <div>
                                  <label className="label">题库名称</label>
                                  <input className="input rounded-none" name="title" defaultValue={paper.title} required />
                                </div>
                                <div className="grid grid-cols-[1fr_110px] gap-3">
                                  <div>
                                    <label className="label">区域信息</label>
                                    <select className="input rounded-none" name="regionId" defaultValue={paper.regionId} required>
                                      {regionOptions.map((region) => (
                                        <option key={region.id} value={region.id}>{region.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="label">年份</label>
                                    <input className="input rounded-none" name="year" type="number" min="2000" max="2100" defaultValue={paper.year || ""} />
                                  </div>
                                </div>
                                <button className="primary-button rounded-none" type="submit">保存修改</button>
                              </form>
                            </details>
                            <CopyQuestionBankDialog
                              courseManagementHref={courseManagementHref}
                              ownerId={selectedOwner.id}
                              ownerType={selectedOwner.type}
                              paperId={paper.id}
                              paperTitle={paper.title}
                              paperYear={paper.year}
                              questionCount={paper._count.questions}
                              sourceRegionName={paper.region.name}
                              sourceRegionProvince={paper.region.province}
                              sourceStatus={paper.status}
                              targetRegions={selectedOwner.regions
                                .filter((region) => region.id !== paper.regionId)
                                .map((region) => ({ id: region.id, name: region.name, province: region.province }))}
                            />
                            <form action={toggleQuestionBankPaperStatus}>
                              {ownerInputs(selectedOwner)}
                              <input type="hidden" name="id" value={paper.id} />
                              <button
                                className={cn(
                                  "relative h-6 w-[62px] rounded-full border text-[11px] font-bold transition",
                                  isPublished ? "border-[#30bd49] bg-[#3bd949] text-white" : "border-[#adb2ba] bg-[#c6c9ce] text-[#666d75]"
                                )}
                                type="submit"
                                aria-label={isPublished ? "关闭题库" : "开启题库"}
                              >
                                <span className={cn("absolute top-0.5 grid size-5 place-items-center rounded-full border border-white/70 bg-gradient-to-b from-white to-[#d9dde2] shadow transition", isPublished ? "right-0.5" : "left-0.5")} />
                                <span className={cn("absolute top-1/2 -translate-y-1/2", isPublished ? "left-2" : "right-2")}>{isPublished ? "启用" : "停用"}</span>
                              </button>
                            </form>
                            <form id={`delete-paper-${paper.id}`} action={deleteQuestionBankPaper}>
                              {ownerInputs(selectedOwner)}
                              <input type="hidden" name="id" value={paper.id} />
                            </form>
                            <ConfirmSubmitButton
                              className="grid size-7 place-items-center text-red-500 hover:bg-red-50"
                              form={`delete-paper-${paper.id}`}
                              message="确认删除该题库？此操作不可恢复。"
                            >
                              <Trash2 size={14} />
                            </ConfirmSubmitButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <div className="flex items-center justify-end gap-4 px-2 py-5 text-sm text-[#071b38]">
              <Link
                className={cn("grid size-8 place-items-center text-slate-400", currentPage > 1 ? "hover:text-[#006aff]" : "pointer-events-none opacity-40")}
                href={ownerHref(selectedOwner, Math.max(1, currentPage - 1), selectedProvince, selectedExamType)}
              >
                <ChevronLeft size={18} />
              </Link>
              {pageNumbers.map((pageNumber) => (
                <Link
                  key={pageNumber}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg",
                    pageNumber === currentPage ? "border border-[#5d80ff] bg-white text-[#3562ff]" : "hover:bg-white hover:text-[#006aff]"
                  )}
                  href={ownerHref(selectedOwner, pageNumber, selectedProvince, selectedExamType)}
                >
                  {pageNumber}
                </Link>
              ))}
              <Link
                className={cn("grid size-8 place-items-center text-slate-600", currentPage < totalPages ? "hover:text-[#006aff]" : "pointer-events-none opacity-40")}
                href={ownerHref(selectedOwner, Math.min(totalPages, currentPage + 1), selectedProvince, selectedExamType)}
              >
                <ChevronRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
