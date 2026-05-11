import { createKnowledgePoint, updateKnowledgePoint, updateKnowledgePointStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function KnowledgePointsPage() {
  await requireAdmin();
  const [chapters, points] = await Promise.all([
    prisma.chapter.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.knowledgePoint.findMany({
      include: { chapter: true, _count: { select: { questions: true } } },
      orderBy: [{ chapter: { sortOrder: "asc" } }, { sortOrder: "asc" }]
    })
  ]);

  return (
    <main className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form action={createKnowledgePoint} className="panel h-fit">
        <h1 className="text-xl font-bold">新增知识点</h1>
        <label className="label mt-5">所属章节</label>
        <select className="input" name="chapterId" required>
          {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
        </select>
        <label className="label mt-4">标题</label>
        <input className="input" name="title" required />
        <label className="label mt-4">一句话摘要</label>
        <input className="input" name="summary" required />
        <label className="label mt-4">复习正文</label>
        <textarea className="input min-h-40" name="content" required />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">排序</label>
            <input className="input" name="sortOrder" type="number" defaultValue={1} />
          </div>
          <div>
            <label className="label">预计分钟</label>
            <input className="input" name="estimatedMinutes" type="number" defaultValue={8} />
          </div>
        </div>
        <label className="label mt-4">状态</label>
        <select className="input" name="status" defaultValue="draft">
          <option value="draft">待审核</option>
          <option value="published">发布</option>
          <option value="archived">下架</option>
        </select>
        <button className="primary-button mt-5 w-full" type="submit">保存知识点</button>
      </form>
      <section className="panel">
        <h2 className="text-xl font-bold">知识点列表</h2>
        <div className="mt-5 space-y-4">
          {points.map((point) => (
            <article key={point.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">{point.chapter.title}</p>
                  <h3 className="font-semibold">{point.sortOrder}. {point.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{point.summary}</p>
                  <p className="mt-2 text-xs text-slate-500">{point._count.questions} 道题 · {point.status}</p>
                </div>
                <form action={updateKnowledgePointStatus} className="flex h-fit gap-2">
                  <input type="hidden" name="id" value={point.id} />
                  <select className="input w-32" name="status" defaultValue={point.status}>
                    <option value="draft">待审核</option>
                    <option value="published">发布</option>
                    <option value="archived">下架</option>
                  </select>
                  <button className="secondary-button" type="submit">更新</button>
                </form>
              </div>
              <details className="mt-4 rounded-2xl bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-teal">编辑知识点内容</summary>
                <form action={updateKnowledgePoint} className="mt-4">
                  <input type="hidden" name="id" value={point.id} />
                  <label className="label">所属章节</label>
                  <select className="input" name="chapterId" defaultValue={point.chapterId} required>
                    {chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
                    ))}
                  </select>
                  <label className="label mt-4">标题</label>
                  <input className="input" name="title" defaultValue={point.title} required />
                  <label className="label mt-4">一句话摘要</label>
                  <input className="input" name="summary" defaultValue={point.summary} required />
                  <label className="label mt-4">复习正文</label>
                  <textarea className="input min-h-40" name="content" defaultValue={point.content} required />
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label">排序</label>
                      <input className="input" name="sortOrder" type="number" defaultValue={point.sortOrder} />
                    </div>
                    <div>
                      <label className="label">预计分钟</label>
                      <input className="input" name="estimatedMinutes" type="number" defaultValue={point.estimatedMinutes} />
                    </div>
                    <div>
                      <label className="label">状态</label>
                      <select className="input" name="status" defaultValue={point.status}>
                        <option value="draft">待审核</option>
                        <option value="published">发布</option>
                        <option value="archived">下架</option>
                      </select>
                    </div>
                  </div>
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
