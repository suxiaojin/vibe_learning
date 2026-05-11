import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatSeconds } from "@/lib/utils";

export default async function StudentsPage() {
  await requireAdmin();
  const students = await prisma.user.findMany({
    where: { role: "student" },
    orderBy: { createdAt: "desc" },
    include: {
      progress: true,
      studyStats: true,
      _count: {
        select: {
          attempts: true,
          wrongQuestions: true
        }
      }
    }
  });

  return (
    <main className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">学生列表</h1>
          <p className="mt-1 text-sm text-slate-600">查看学生注册、闯关、答题和错题概况。</p>
        </div>
        <span className="badge bg-teal/10 text-teal">{students.length} 名学生</span>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">学生</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">注册时间</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">最后登录</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">已通过</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">答题数</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">错题数</th>
              <th className="border-b border-slate-200 py-3 font-semibold">累计学习</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const passed = student.progress.filter((item) => item.status === "passed").length;
              const totalSeconds = student.studyStats.reduce((sum, item) => sum + item.studySeconds, 0);
              return (
                <tr key={student.id} className="text-slate-700">
                  <td className="border-b border-slate-100 py-4 pr-4 font-semibold text-ink">{student.username}</td>
                  <td className="border-b border-slate-100 py-4 pr-4">{formatDate(student.createdAt)}</td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    {student.lastLoginAt ? formatDate(student.lastLoginAt) : "暂无"}
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">{passed} 关</td>
                  <td className="border-b border-slate-100 py-4 pr-4">{student._count.attempts}</td>
                  <td className="border-b border-slate-100 py-4 pr-4">{student._count.wrongQuestions}</td>
                  <td className="border-b border-slate-100 py-4">{formatSeconds(totalSeconds)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
