import { createChapter, updateChapterStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ChaptersPage() {
  await requireAdmin();
  const chapters = await prisma.chapter.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[360px_1fr]">
      <form action={createChapter} className="panel h-fit">
        <h1 className="text-xl font-bold">新增章节</h1>
        <label className="label mt-5">章节标题</label>
        <input className="input" name="title" required />
        <label className="label mt-4">排序</label>
        <input className="input" name="sortOrder" type="number" defaultValue={1} />
        <label className="label mt-4">状态</label>
        <select className="input" name="status" defaultValue="draft">
          <option value="draft">待审核</option>
          <option value="published">发布</option>
          <option value="archived">下架</option>
        </select>
        <button className="primary-button mt-5 w-full" type="submit">保存章节</button>
      </form>
      <section className="panel">
        <h2 className="text-xl font-bold">章节列表</h2>
        <div className="mt-5 divide-y divide-slate-100">
          {chapters.map((chapter) => (
            <div key={chapter.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">{chapter.sortOrder}. {chapter.title}</p>
                <p className="text-sm text-slate-500">{chapter.status}</p>
              </div>
              <form action={updateChapterStatus} className="flex gap-2">
                <input type="hidden" name="id" value={chapter.id} />
                <select className="input w-32" name="status" defaultValue={chapter.status}>
                  <option value="draft">待审核</option>
                  <option value="published">发布</option>
                  <option value="archived">下架</option>
                </select>
                <button className="secondary-button" type="submit">更新</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
