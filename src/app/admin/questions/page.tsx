import { createQuestion, updateQuestionStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function QuestionsPage() {
  await requireAdmin();
  const [points, questions] = await Promise.all([
    prisma.knowledgePoint.findMany({
      include: { chapter: true },
      orderBy: [{ chapter: { sortOrder: "asc" } }, { sortOrder: "asc" }]
    }),
    prisma.question.findMany({
      include: { knowledgePoint: { include: { chapter: true } } },
      orderBy: { createdAt: "desc" },
      take: 80
    })
  ]);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[460px_1fr]">
      <form action={createQuestion} className="panel h-fit">
        <h1 className="text-xl font-bold">新增题目</h1>
        <label className="label mt-5">所属知识点</label>
        <select className="input" name="knowledgePointId" required>
          {points.map((point) => (
            <option key={point.id} value={point.id}>{point.chapter.title} / {point.title}</option>
          ))}
        </select>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">题型</label>
            <select className="input" name="type" defaultValue="single_choice">
              <option value="single_choice">单选</option>
              <option value="multiple_choice">多选</option>
              <option value="true_false">判断</option>
            </select>
          </div>
          <div>
            <label className="label">难度</label>
            <select className="input" name="difficulty" defaultValue="medium">
              <option value="easy">简单</option>
              <option value="medium">中等</option>
              <option value="hard">困难</option>
            </select>
          </div>
        </div>
        <label className="label mt-4">题干</label>
        <textarea className="input min-h-24" name="stem" required />
        <label className="label mt-4">选项 JSON</label>
        <textarea className="input min-h-24 font-mono" name="options" defaultValue={'[{"key":"A","text":"选项A"},{"key":"B","text":"选项B"}]'} />
        <label className="label mt-4">答案 JSON</label>
        <input className="input font-mono" name="answer" defaultValue={'["A"]'} />
        <label className="label mt-4">解析</label>
        <textarea className="input min-h-24" name="analysis" required />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">来源</label>
            <input className="input" name="source" defaultValue="人工录入" />
          </div>
          <div>
            <label className="label">状态</label>
            <select className="input" name="status" defaultValue="draft">
              <option value="draft">待审核</option>
              <option value="published">发布</option>
              <option value="archived">下架</option>
            </select>
          </div>
        </div>
        <button className="primary-button mt-5 w-full" type="submit">保存题目</button>
      </form>
      <section className="panel">
        <h2 className="text-xl font-bold">最近题目</h2>
        <div className="mt-5 space-y-4">
          {questions.map((question) => (
            <article key={question.id} className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">{question.knowledgePoint.chapter.title} / {question.knowledgePoint.title}</p>
              <h3 className="mt-1 line-clamp-2 font-semibold">{question.stem}</h3>
              <p className="mt-2 text-sm text-slate-600">{question.source} · {question.type} · {question.status}</p>
              <form action={updateQuestionStatus} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={question.id} />
                <select className="input w-32" name="status" defaultValue={question.status}>
                  <option value="draft">待审核</option>
                  <option value="published">发布</option>
                  <option value="archived">下架</option>
                </select>
                <button className="secondary-button" type="submit">更新</button>
              </form>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
