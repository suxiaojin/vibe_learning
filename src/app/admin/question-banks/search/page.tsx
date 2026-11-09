import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { type?: string; id?: string; province?: string; examType?: string; q?: string; page?: string; view?: string };
type Result = { paperId: string; paperTitle: string; paperQuestionId: string; questionId: string; number: bigint; stem: string; options: unknown; answer: unknown; analysis: string; aiDoubtAnswer: string | null };
const pageSize = 20;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

function excerpt(value: string, keyword: string) {
  const index = value.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());
  if (index < 0) return null;
  const start = Math.max(0, index - 45);
  const end = Math.min(value.length, index + keyword.length + 45);
  return <>{start ? "…" : ""}{value.slice(start, index)}<mark className="bg-yellow-200">{value.slice(index, index + keyword.length)}</mark>{value.slice(index + keyword.length, end)}{end < value.length ? "…" : ""}</>;
}

export default async function QuestionBankSearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const { type = "", id = "", province = "", examType = "", view = "" } = params;
  const keyword = (params.q || "").trim().slice(0, 100);
  const requestedPage = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));
  const validType = type === "major" || type === "public_subject";
  const regions = await prisma.region.findMany({ where: { province, studySystem: examType }, select: { id: true } });
  const regionIds = regions.map((region) => region.id);
  let ownerName: string | undefined;
  if (validType && id && regionIds.length) {
    if (type === "major") {
      const major = await prisma.major.findFirst({ where: { id, regions: { some: { regionId: { in: regionIds } } } }, select: { name: true, regions: { where: { regionId: { in: regionIds } }, select: { displayName: true }, take: 1 } } });
      ownerName = major ? major.regions[0]?.displayName || major.name : undefined;
    } else {
      const subject = await prisma.publicSubject.findFirst({ where: { id, regions: { some: { regionId: { in: regionIds } } } }, select: { name: true } });
      ownerName = subject?.name;
    }
  }
  const base = new URLSearchParams({ type, id, province, examType });
  if (view === "other") base.set("view", view);
  const backHref = `/admin/question-banks?${base.toString()}`;
  const queryFor = (page: number) => {
    const query = new URLSearchParams(base);
    query.set("q", keyword);
    query.set("page", String(page));
    return `/admin/question-banks/search?${query.toString()}`;
  };
  let results: Result[] = [];
  let total = 0;
  let currentPage = 1;
  if (ownerName && keyword) {
    const ownerCondition = type === "major" ? Prisma.sql`p."majorId" = ${id}` : Prisma.sql`p."publicSubjectId" = ${id}`;
    const matching = Prisma.sql`
      FROM exam_paper_questions epq
      JOIN exam_papers p ON p.id = epq."paperId"
      JOIN questions q ON q.id = epq."questionId"
      WHERE p."regionId" IN (${Prisma.join(regionIds)}) AND p."ownerType"::text = ${type} AND ${ownerCondition}
        AND (position(lower(${keyword}) in lower(q.stem)) > 0
          OR position(lower(${keyword}) in lower(q.analysis)) > 0
          OR position(lower(${keyword}) in lower(coalesce(q."aiDoubtAnswer", ''))) > 0
          OR EXISTS (SELECT 1 FROM jsonb_path_query(q.options::jsonb, '$.** ? (@.type() == "string")') v WHERE position(lower(${keyword}) in lower(v #>> '{}')) > 0)
          OR EXISTS (SELECT 1 FROM jsonb_path_query(q.answer::jsonb, '$.** ? (@.type() == "string")') v WHERE position(lower(${keyword}) in lower(v #>> '{}')) > 0))`;
    const counts = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total ${matching}`);
    total = Number(counts[0]?.total || 0);
    currentPage = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    results = await prisma.$queryRaw<Result[]>(Prisma.sql`
      SELECT p.id AS "paperId", p.title AS "paperTitle", epq.id AS "paperQuestionId", q.id AS "questionId",
        (SELECT count(*) FROM exam_paper_questions n WHERE n."paperId" = epq."paperId"
          AND (n."sortOrder", n."createdAt", n.id) <= (epq."sortOrder", epq."createdAt", epq.id)) AS number,
        q.stem, q.options, q.answer, q.analysis, q."aiDoubtAnswer"
      ${matching}
      ORDER BY p.title, p.id, epq."sortOrder", epq."createdAt", epq.id
      LIMIT ${pageSize} OFFSET ${(currentPage - 1) * pageSize}`);
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return <main className="min-h-screen bg-[#f3f5f9] px-6 py-8 text-[#081a33]">
    <div className="mx-auto max-w-5xl">
      <Link className="text-sm text-blue-700 hover:underline" href={backHref}>← 返回题库管理</Link>
      <h1 className="mt-5 text-2xl font-bold">题库关键词搜索</h1>
      {!ownerName ? <p className="mt-6 rounded bg-white p-5 text-red-700">当前搜索范围无效，请返回题库管理重新选择。</p> : <>
        <p className="mt-3 text-sm text-slate-600">当前范围：{province} / {examType} / {ownerName}（包含普通题库和其它题库）</p>
        <form className="mt-5 flex gap-2" action="/admin/question-banks/search">
          {Array.from(base.entries()).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <input aria-label="搜索关键词" className="input max-w-xl bg-white" name="q" defaultValue={keyword} maxLength={100} placeholder="输入要查找的关键词，例如：小红书" required />
          <button className="primary-button" type="submit">搜索</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">搜索题干、选项、答案、解析和 AI答疑；按输入文字精确包含匹配，英文字母不区分大小写。</p>
        {keyword && <section className="mt-6">
          <p className="mb-3 text-sm text-slate-600">找到 {total} 个题目位置{total ? `，第 ${currentPage} / ${totalPages} 页` : ""}。同一道题出现在多个题库时会分别列出；编辑共用题目会影响所有引用它的题库。</p>
          {results.length === 0 ? <div className="bg-white p-8 text-center text-sm text-slate-500">当前范围没有找到匹配内容。</div> : <div className="space-y-3">{results.map((result) => {
            const fields = [["题干", [result.stem]], ["选项", strings(result.options)], ["答案", strings(result.answer)], ["解析", [result.analysis]], ["AI答疑", result.aiDoubtAnswer ? [result.aiDoubtAnswer] : []]] as const;
            const questionQuery = new URLSearchParams({ province, examType, question: result.paperQuestionId });
            return <article key={result.paperQuestionId} className="rounded border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{result.paperTitle} · 第 {String(result.number)} 题</h2><Link className="text-sm font-medium text-blue-700 hover:underline" href={`/admin/question-banks/${encodeURIComponent(result.paperId)}?${questionQuery.toString()}`}>查看并编辑 →</Link></div>
              <div className="mt-2 space-y-1 text-sm text-slate-600">{fields.flatMap(([label, values]) => values.map((value, index) => {
                const content = excerpt(value, keyword);
                return content ? <p key={`${label}-${index}`} className="break-all"><span className="font-medium text-slate-800">{label}：</span>{content}</p> : null;
              }))}</div>
            </article>;
          })}</div>}
          {totalPages > 1 && <div className="mt-5 flex items-center justify-center gap-4 text-sm">{currentPage > 1 && <Link className="text-blue-700" href={queryFor(currentPage - 1)}>上一页</Link>}<span>{currentPage} / {totalPages}</span>{currentPage < totalPages && <Link className="text-blue-700" href={queryFor(currentPage + 1)}>下一页</Link>}</div>}
        </section>}
      </>}
    </div>
  </main>;
}
