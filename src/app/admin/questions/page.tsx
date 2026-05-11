import type { Prisma } from "@prisma/client";
import { createQuestion, updateQuestion, updateQuestionStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const optionKeys = ["A", "B", "C", "D"] as const;

type OptionValue = {
  key: string;
  text: string;
};

function optionText(options: Prisma.JsonValue, key: string) {
  if (!Array.isArray(options)) {
    return "";
  }
  const option = options.find((item) => {
    if (typeof item !== "object" || item === null || !("key" in item)) {
      return false;
    }
    return String((item as { key?: unknown }).key) === key;
  }) as OptionValue | undefined;
  return option?.text || "";
}

function answerHas(answer: Prisma.JsonValue, key: string) {
  return Array.isArray(answer) && answer.map(String).includes(key);
}

function QuestionFields({
  defaultType = "single_choice",
  defaultDifficulty = "medium",
  defaultStatus = "draft",
  defaultSource = "人工录入",
  defaultStem = "",
  defaultAnalysis = "",
  options,
  answer
}: {
  defaultType?: string;
  defaultDifficulty?: string;
  defaultStatus?: string;
  defaultSource?: string;
  defaultStem?: string;
  defaultAnalysis?: string;
  options?: Prisma.JsonValue;
  answer?: Prisma.JsonValue;
}) {
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label">题型</label>
          <select className="input" name="type" defaultValue={defaultType}>
            <option value="single_choice">单选</option>
            <option value="multiple_choice">多选</option>
            <option value="true_false">判断</option>
          </select>
        </div>
        <div>
          <label className="label">难度</label>
          <select className="input" name="difficulty" defaultValue={defaultDifficulty}>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
        </div>
      </div>

      <label className="label mt-4">题干</label>
      <textarea className="input min-h-24" name="stem" defaultValue={defaultStem} required />

      <div className="mt-4 rounded-2xl bg-mist p-4">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-semibold text-slate-700">选项与答案</label>
          <p className="text-xs text-slate-500">单选/判断只勾一个，多选可勾多个</p>
        </div>
        <div className="mt-3 grid gap-3">
          {optionKeys.map((key) => (
            <div key={key} className="grid grid-cols-[48px_1fr_72px] items-center gap-2">
              <span className="font-semibold text-slate-700">{key}</span>
              <input
                className="input"
                name={`option${key}`}
                placeholder={key === "A" && defaultType === "true_false" ? "正确" : key === "B" && defaultType === "true_false" ? "错误" : `选项 ${key}`}
                defaultValue={options ? optionText(options, key) : key === "A" && defaultType === "true_false" ? "正确" : key === "B" && defaultType === "true_false" ? "错误" : ""}
              />
              <label className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm">
                <input name="answer" type="checkbox" value={key} defaultChecked={answer ? answerHas(answer, key) : key === "A"} />
                答案
              </label>
            </div>
          ))}
        </div>
      </div>

      <label className="label mt-4">解析</label>
      <textarea className="input min-h-24" name="analysis" defaultValue={defaultAnalysis} required />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label">来源</label>
          <input className="input" name="source" defaultValue={defaultSource} />
        </div>
        <div>
          <label className="label">状态</label>
          <select className="input" name="status" defaultValue={defaultStatus}>
            <option value="draft">待审核</option>
            <option value="published">发布</option>
            <option value="archived">下架</option>
          </select>
        </div>
      </div>
    </>
  );
}

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
        <QuestionFields />
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
                <button className="secondary-button" type="submit">更新状态</button>
              </form>

              <details className="mt-4 rounded-2xl bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-teal">编辑题目内容</summary>
                <form action={updateQuestion} className="mt-4">
                  <input type="hidden" name="id" value={question.id} />
                  <label className="label">所属知识点</label>
                  <select className="input" name="knowledgePointId" defaultValue={question.knowledgePointId} required>
                    {points.map((point) => (
                      <option key={point.id} value={point.id}>{point.chapter.title} / {point.title}</option>
                    ))}
                  </select>
                  <QuestionFields
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
