import Link from "next/link";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  ListFilter,
  Trash2
} from "lucide-react";
import { createQuestionBankPaper, deleteQuestionBankPaper, toggleQuestionBankPaperStatus, updateQuestionBankPaper } from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { QuestionBankAiGenerationDialog } from "@/components/question-bank-ai-generation-dialog";
import { QuestionBankImportDialog } from "@/components/question-bank-import-dialog";
import { QuestionBankSidebar } from "@/components/question-bank-sidebar";
import { requireAdmin } from "@/lib/auth";
import { ensureDefaultQuestionBankCatalog, type QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type SearchParams = {
  type?: string;
  id?: string;
  page?: string;
};

type RegionOption = {
  id: string;
  name: string;
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

function ownerHref(owner: OwnerOption, page = 1) {
  return `/admin/question-banks?type=${owner.type}&id=${encodeURIComponent(owner.id)}&page=${page}`;
}

function ownerKnowledgeMapHref(owner: OwnerOption) {
  return `/admin/question-banks/knowledge-points?type=${owner.type}&id=${encodeURIComponent(owner.id)}`;
}

function ownerStatisticsHref(owner: OwnerOption) {
  return `/admin/question-banks/statistics?type=${owner.type}&id=${encodeURIComponent(owner.id)}`;
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
      select: { id: true, name: true }
    }),
    prisma.publicSubject.findMany({
      include: {
        regions: {
          include: { region: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    prisma.major.findMany({
      include: {
        regions: {
          include: { region: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    })
  ]);

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
  ].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.type !== b.type) {
      return a.type === "public_subject" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  const requestedType = isOwnerType(params?.type) ? params.type : undefined;
  const selectedOwner = owners.find((owner) => owner.type === requestedType && owner.id === params?.id) || owners[0];
  const regionOptions = selectedOwner?.regions.length ? selectedOwner.regions : regions;

  if (!selectedOwner) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5f9] text-sm text-slate-500">
        暂无可管理的专业或公共课。
      </main>
    );
  }

  const paperWhere = {
    course: {
      courseType: selectedOwner.type,
      ...(selectedOwner.type === "public_subject" ? { publicSubjectId: selectedOwner.id } : { majorId: selectedOwner.id })
    }
  };
  const totalPapers = await prisma.examPaper.count({ where: paperWhere });
  const totalPages = Math.max(1, Math.ceil(totalPapers / pageSize));
  const requestedPage = Math.max(1, Number(params?.page || 1) || 1);
  const currentPage = Math.min(requestedPage, totalPages);
  const [papers, selectedPaperNames] = await Promise.all([
    prisma.examPaper.findMany({
      where: paperWhere,
      include: {
        course: {
          include: {
            region: true
          }
        },
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

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-[#081a33]">
      <header className="grid h-[51px] grid-cols-[1fr_auto] border-b border-[#d6dbe4] bg-[#f7f8fb]">
        <nav className="flex" aria-label="内容管理">
          {[
            { label: "题库", href: "/admin/question-banks", active: true },
            { label: "知识点题目统计", href: ownerStatisticsHref(selectedOwner), active: false },
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

      <section className="grid h-[calc(100vh-51px)] grid-cols-[346px_minmax(0,1fr)]">
        <QuestionBankSidebar
          owners={owners}
          selectedOwnerKey={`${selectedOwner.type}:${selectedOwner.id}`}
          selectedPapers={selectedPaperNames}
          regions={regions}
        />

        <section className="min-w-0 overflow-auto bg-[#f3f5f9] px-5 pb-10 pt-12">
          <div className="mx-auto max-w-[1535px]">
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

              <QuestionBankImportDialog
                selectedOwner={{ type: selectedOwner.type, id: selectedOwner.id, name: selectedOwner.name, regions: selectedOwner.regions }}
                regions={regions}
              />

              <QuestionBankAiGenerationDialog
                selectedOwner={{ type: selectedOwner.type, id: selectedOwner.id, name: selectedOwner.name, regions: selectedOwner.regions }}
                regions={regions}
                referencePapers={selectedPaperNames.map((paper) => ({ id: paper.id, title: paper.title, questionCount: paper._count.questions }))}
              />
            </div>

            <section className="overflow-visible rounded-t-lg bg-white">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-[#f0f1f4] text-[#030712]">
                  <tr className="h-11">
                    <th className="border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("题库名称")}</th>
                    <th className="w-[90px] border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("题数")}</th>
                    <th className="w-[205px] border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("区域信息")}</th>
                    <th className="w-[110px] border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("年份")}</th>
                    <th className="w-[185px] border-r border-[#e0e3e8] px-3 font-bold">{headerLabel("更新时间")}</th>
                    <th className="w-[190px] px-3 font-bold"></th>
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
                      <tr key={paper.id} className={cn("h-[61px] border-b border-[#e5e7eb]", index === 0 ? "bg-[#e0e3e8]" : "bg-[#fbfbfc]")}>
                        <td className="px-3 font-medium text-[#071b38]">
                          <Link className="text-[#071b38] hover:text-[#006aff] hover:underline" href={`/admin/question-banks/${paper.id}`}>
                            {paper.title}
                          </Link>
                        </td>
                        <td className="px-3 text-[#071b38]">{paper._count.questions}</td>
                        <td className="px-3 text-[#071b38]">{paper.course.region.name}</td>
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
                                    <select className="input rounded-none" name="regionId" defaultValue={paper.course.regionId} required>
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
                href={ownerHref(selectedOwner, Math.max(1, currentPage - 1))}
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
                  href={ownerHref(selectedOwner, pageNumber)}
                >
                  {pageNumber}
                </Link>
              ))}
              <Link
                className={cn("grid size-8 place-items-center text-slate-600", currentPage < totalPages ? "hover:text-[#006aff]" : "pointer-events-none opacity-40")}
                href={ownerHref(selectedOwner, Math.min(totalPages, currentPage + 1))}
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
