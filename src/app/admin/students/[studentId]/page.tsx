import Link from "next/link";
import { notFound } from "next/navigation";
import { resetStudentPassword, toggleStudentAccountStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatSeconds } from "@/lib/utils";

type PageProps = {
  params: Promise<{ studentId: string }>;
  searchParams?: Promise<{ notice?: string; error?: string }>;
};

const progressLabels = {
  locked: "锁定",
  unlocked: "可学习",
  passed: "已通过"
};

export default async function StudentDetailPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const [{ studentId }, messages] = await Promise.all([params, searchParams]);
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student" },
    select: {
      id: true,
      username: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      disabledAt: true,
      disabledReason: true
    }
  });

  if (!student) {
    notFound();
  }

  const [progress, wrongQuestions, activeWrongCount, totalAttempts, correctAttempts, studySeconds] = await Promise.all([
    prisma.userProgress.findMany({
      where: { userId: student.id },
      include: {
        knowledgePoint: {
          include: { chapter: true }
        }
      },
      orderBy: [
        { knowledgePoint: { chapter: { sortOrder: "asc" } } },
        { knowledgePoint: { sortOrder: "asc" } },
        { updatedAt: "desc" }
      ]
    }),
    prisma.wrongQuestion.findMany({
      where: { userId: student.id, status: "active" },
      include: {
        question: {
          include: {
            knowledgePoint: {
              include: { chapter: true }
            }
          }
        }
      },
      orderBy: [{ lastWrongAt: "desc" }, { wrongCount: "desc" }],
      take: 20
    }),
    prisma.wrongQuestion.count({ where: { userId: student.id, status: "active" } }),
    prisma.questionAttempt.count({ where: { userId: student.id } }),
    prisma.questionAttempt.count({ where: { userId: student.id, isCorrect: true } }),
    prisma.studyStat.aggregate({
      where: { userId: student.id },
      _sum: { studySeconds: true }
    })
  ]);

  const passed = progress.filter((item) => item.status === "passed").length;
  const correctRate = totalAttempts ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
  const returnTo = `/admin/students/${student.id}`;

  return (
    <main className="space-y-6">
      <section className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link className="text-sm font-semibold text-teal" href="/admin/students">返回学生列表</Link>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-ink">{student.username}</h1>
              <StatusBadge status={student.status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">注册于 {formatDateTime(student.createdAt)}，最后登录：{student.lastLoginAt ? formatDateTime(student.lastLoginAt) : "暂无"}</p>
            {student.status === "disabled" ? (
              <p className="mt-2 text-sm text-coral">
                禁用时间：{student.disabledAt ? formatDateTime(student.disabledAt) : "暂无"}；原因：{student.disabledReason || "后台手动禁用"}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={toggleStudentAccountStatus}>
              <input type="hidden" name="id" value={student.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button className="secondary-button" type="submit">{student.status === "disabled" ? "启用账号" : "禁用账号"}</button>
            </form>
            <details className="relative">
              <summary className="secondary-button cursor-pointer list-none [&::-webkit-details-marker]:hidden">重置密码</summary>
              <form action={resetStudentPassword} className="absolute right-0 z-10 mt-2 grid w-72 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl">
                <input type="hidden" name="id" value={student.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label className="label">新密码</label>
                <input className="input" name="password" type="password" minLength={6} required />
                <button className="primary-button w-full" type="submit">确认重置</button>
              </form>
            </details>
          </div>
        </div>

        {messages?.notice ? <div className="mt-4 rounded-2xl bg-teal/10 p-3 text-sm font-semibold text-teal">{messages.notice}</div> : null}
        {messages?.error ? <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{messages.error}</div> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="已通过关卡" value={`${passed}`} />
        <StatCard label="累计答题" value={`${totalAttempts}`} />
        <StatCard label="正确率" value={`${correctRate}%`} />
        <StatCard label="待掌握错题" value={`${activeWrongCount}`} />
        <StatCard label="累计学习" value={formatSeconds(studySeconds._sum.studySeconds || 0)} />
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">进度明细</h2>
            <p className="mt-1 text-sm text-slate-600">按知识点查看闯关状态、最高分和通过时间。</p>
          </div>
          <span className="badge bg-slate-100 text-slate-600">{progress.length} 条进度</span>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">知识点</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">状态</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">最高分</th>
                <th className="border-b border-slate-200 py-3 font-semibold">通过时间</th>
              </tr>
            </thead>
            <tbody>
              {progress.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={4}>暂无学习进度。</td>
                </tr>
              ) : progress.map((item) => (
                <tr key={item.id} className="text-slate-700">
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <p className="font-semibold text-ink">{item.knowledgePoint.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.knowledgePoint.chapter.title}</p>
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">{progressLabels[item.status]}</td>
                  <td className="border-b border-slate-100 py-4 pr-4">{item.bestScore} 分</td>
                  <td className="border-b border-slate-100 py-4">{item.passedAt ? formatDateTime(item.passedAt) : "未通过"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">错题概况</h2>
            <p className="mt-1 text-sm text-slate-600">展示最近 20 道待掌握错题。</p>
          </div>
          <span className="badge bg-coral/10 text-coral">{activeWrongCount} 道待掌握</span>
        </div>
        <div className="mt-5 space-y-3">
          {wrongQuestions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">暂无待掌握错题。</div>
          ) : wrongQuestions.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-teal">
                    {item.question.knowledgePoint.chapter.title} / {item.question.knowledgePoint.title}
                  </p>
                  <h3 className="mt-2 line-clamp-2 font-semibold text-ink">{item.question.stem}</h3>
                </div>
                <span className="badge bg-slate-100 text-slate-600">错 {item.wrongCount} 次</span>
              </div>
              <p className="mt-3 text-sm text-slate-500">最近答错：{formatDateTime(item.lastWrongAt)}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: "active" | "disabled" }) {
  return (
    <span className={`badge ${status === "disabled" ? "bg-coral/10 text-coral" : "bg-teal/10 text-teal"}`}>
      {status === "disabled" ? "已禁用" : "正常"}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
    </div>
  );
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  });
}
