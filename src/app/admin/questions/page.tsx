import { ContentStatus, QuestionType, type Prisma } from "@prisma/client";
import Link from "next/link";
import { createQuestion, updateQuestion, updateQuestionStatus } from "@/app/admin/actions";
import { AdminQuestionFields } from "@/components/admin-question-fields";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { questionBankEditableQuestionTypes, questionBankTypeDefaultLabels } from "@/lib/question-bank-types";

const contentStatuses = new Set<string>(Object.values(ContentStatus));
const questionTypes = new Set<string>(Object.values(QuestionType));

export default async function QuestionsPage({
  searchParams
}: {
  searchParams?: Promise<{ knowledgePointId?: string; status?: string; type?: string; keyword?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const selectedPointId = params?.knowledgePointId || "";
  const selectedStatus = contentStatuses.has(params?.status || "") ? params?.status || "" : "";
  const selectedType = questionTypes.has(params?.type || "") ? params?.type || "" : "";
  const keyword = params?.keyword?.trim() || "";

  const questionWhere: Prisma.QuestionWhereInput = {
    ...(selectedPointId ? { knowledgePointId: selectedPointId } : {}),
    ...(selectedStatus ? { status: selectedStatus as ContentStatus } : {}),
    ...(selectedType ? { type: selectedType as QuestionType } : {}),
    ...(keyword ? { stem: { contains: keyword, mode: "insensitive" } } : {})
  };

  const [points, questions] = await Promise.all([
    prisma.knowledgePoint.findMany({
      include: { chapter: true },
      orderBy: [{ chapter: { sortOrder: "asc" } }, { sortOrder: "asc" }]
    }),
    prisma.question.findMany({
      where: questionWhere,
      include: { knowledgePoint: { include: { chapter: true } } },
      orderBy: { createdAt: "desc" },
      take: 120
    })
  ]);

  return (
    <main className="grid gap-6 xl:grid-cols-[460px_1fr]">
      <form action={createQuestion} className="panel h-fit">
        <h1 className="text-xl font-bold">新增题目</h1>
        <label className="label mt-5">所属知识点</label>
        <select className="input" name="knowledgePointId" defaultValue={selectedPointId} required>
          {points.map((point) => (
            <option key={point.id} value={point.id}>{point.chapter.title} / {point.title}</option>
          ))}
        </select>
        <AdminQuestionFields />
        <button className="primary-button mt-5 w-full" type="submit">保存题目</button>
      </form>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">题目列表</h2>
            <p className="mt-1 text-sm text-slate-600">当前显示 {questions.length} 道题。</p>
          </div>
          <Link className="secondary-button" href="/admin/questions">清空筛选</Link>
        </div>

        <form className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]" action="/admin/questions">
          <div>
            <label className="label">所属知识点</label>
            <select className="input" name="knowledgePointId" defaultValue={selectedPointId}>
              <option value="">全部知识点</option>
              {points.map((point) => (
                <option key={point.id} value={point.id}>{point.chapter.title} / {point.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">状态</label>
            <select className="input" name="status" defaultValue={selectedStatus}>
              <option value="">全部状态</option>
              <option value="draft">待审核</option>
              <option value="published">发布</option>
              <option value="archived">下架</option>
            </select>
          </div>
          <div>
            <label className="label">题型</label>
            <select className="input" name="type" defaultValue={selectedType}>
              <option value="">全部题型</option>
              {questionBankEditableQuestionTypes.map((item) => (
                <option key={item} value={item}>{questionBankTypeDefaultLabels[item]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">关键词</label>
            <input className="input" name="keyword" defaultValue={keyword} placeholder="搜索题干" />
          </div>
          <div className="flex items-end">
            <button className="primary-button w-full" type="submit">筛选</button>
          </div>
        </form>

        <div className="mt-5 space-y-4">
          {questions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              没有找到符合条件的题目。
            </div>
          ) : questions.map((question) => (
            <article key={question.id} className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                {question.knowledgePoint
                  ? `${question.knowledgePoint.chapter.title} / ${question.knowledgePoint.title}`
                  : "未归类"}
              </p>
              <h3 className="mt-1 line-clamp-2 font-semibold">{question.stem}</h3>
              <p className="mt-2 text-sm text-slate-600">{question.source} · {question.type} · {question.status}</p>

              <form action={updateQuestionStatus} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={question.id} />
                <select className="input w-32" name="status" defaultValue={question.status}>
                  <option value="draft">待审核</option>
                  <option value="published">发布</option>
                  <option value="archived">下架</option>
                </select>
                <button className="secondary-button" type="submit">更新状态</button>
              </form>

              <details className="mt-4 rounded-2xl bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-teal">编辑题目内容</summary>
                <form action={updateQuestion} className="mt-4">
                  <input type="hidden" name="id" value={question.id} />
                  <label className="label">所属知识点</label>
                  <select className="input" name="knowledgePointId" defaultValue={question.knowledgePointId || ""} required>
                    <option value="" disabled>请选择知识点</option>
                    {points.map((point) => (
                      <option key={point.id} value={point.id}>{point.chapter.title} / {point.title}</option>
                    ))}
                  </select>
                  <AdminQuestionFields
                    defaultType={question.type}
                    defaultDifficulty={question.difficulty}
                    defaultStatus={question.status}
                    defaultSource={question.source}
                    defaultStem={question.stem}
                    defaultAnalysis={question.analysis}
                    options={question.options}
                    answer={question.answer}
                  />
                  <button className="primary-button mt-5 w-full" type="submit">保存修改</button>
                </form>
              </details>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
