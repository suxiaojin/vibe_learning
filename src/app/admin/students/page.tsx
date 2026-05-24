import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { resetStudentPassword, toggleStudentAccountStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatSeconds } from "@/lib/utils";

const studentStatuses = ["active", "disabled"] as const;
type StudentStatus = (typeof studentStatuses)[number];

type SearchParams = {
  keyword?: string;
  status?: string;
  notice?: string;
  error?: string;
};

const statusLabels: Record<StudentStatus, string> = {
  active: "正常",
  disabled: "已禁用"
};

export default async function StudentsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const keyword = params?.keyword?.trim() || "";
  const selectedStatus = studentStatuses.includes((params?.status || "") as StudentStatus)
    ? (params?.status as StudentStatus)
    : "";

  const where: Prisma.UserWhereInput = {
    role: "student",
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(keyword ? { username: { contains: keyword, mode: "insensitive" } } : {})
  };
  const currentPath = buildStudentsPath({ keyword, status: selectedStatus });

  const [students, totalCount, activeCount, disabledCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        progress: {
          where: { status: "passed" },
          select: { id: true }
        },
        studyStats: {
          select: { studySeconds: true }
        },
        wrongQuestions: {
          where: { status: "active" },
          select: { id: true }
        },
        _count: {
          select: {
            attempts: true
          }
        }
      }
    }),
    prisma.user.count({ where: { role: "student" } }),
    prisma.user.count({ where: { role: "student", status: "active" } }),
    prisma.user.count({ where: { role: "student", status: "disabled" } })
  ]);

  return (
    <main className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">学生管理</h1>
          <p className="mt-1 text-sm text-slate-600">查看学生学习概况，处理账号禁用、启用和密码重置。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="badge bg-slate-100 text-slate-600">全部 {totalCount}</span>
          <span className="badge bg-teal/10 text-teal">正常 {activeCount}</span>
          <span className="badge bg-coral/10 text-coral">已禁用 {disabledCount}</span>
        </div>
      </div>

      {params?.notice ? <div className="mt-4 rounded-2xl bg-teal/10 p-3 text-sm font-semibold text-teal">{params.notice}</div> : null}
      {params?.error ? <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{params.error}</div> : null}

      <form className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-[1fr_180px_auto]" action="/admin/students">
        <div>
          <label className="label">搜索学生</label>
          <input className="input" name="keyword" defaultValue={keyword} placeholder="输入用户名" />
        </div>
        <div>
          <label className="label">账号状态</label>
          <select className="input" name="status" defaultValue={selectedStatus}>
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="primary-button" type="submit">筛选</button>
          <Link className="secondary-button" href="/admin/students">清空</Link>
        </div>
      </form>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">学生</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">状态</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">注册时间</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">最后登录</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">已通过</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">答题数</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">错题数</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">累计学习</th>
              <th className="border-b border-slate-200 py-3 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={9}>没有找到符合条件的学生。</td>
              </tr>
            ) : students.map((student) => {
              const totalSeconds = student.studyStats.reduce((sum, item) => sum + item.studySeconds, 0);
              return (
                <tr key={student.id} className="align-top text-slate-700">
                  <td className="border-b border-slate-100 py-4 pr-4 font-semibold text-ink">{student.username}</td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <StatusBadge status={student.status} />
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">{formatDate(student.createdAt)}</td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    {student.lastLoginAt ? formatDate(student.lastLoginAt) : "暂无"}
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">{student.progress.length} 关</td>
                  <td className="border-b border-slate-100 py-4 pr-4">{student._count.attempts}</td>
                  <td className="border-b border-slate-100 py-4 pr-4">{student.wrongQuestions.length}</td>
                  <td className="border-b border-slate-100 py-4 pr-4">{formatSeconds(totalSeconds)}</td>
                  <td className="border-b border-slate-100 py-4">
                    <div className="flex min-w-[300px] flex-wrap gap-2">
                      <Link className="secondary-button px-3 py-2 text-xs" href={`/admin/students/${student.id}`}>查看详情</Link>
                      <form action={toggleStudentAccountStatus}>
                        <input type="hidden" name="id" value={student.id} />
                        <input type="hidden" name="returnTo" value={currentPath} />
                        <button className="secondary-button px-3 py-2 text-xs" type="submit">
                          {student.status === "disabled" ? "启用" : "禁用"}
                        </button>
                      </form>
                      <details className="relative">
                        <summary className="secondary-button cursor-pointer list-none px-3 py-2 text-xs [&::-webkit-details-marker]:hidden">重置密码</summary>
                        <form action={resetStudentPassword} className="absolute right-0 z-10 mt-2 grid w-64 gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                          <input type="hidden" name="id" value={student.id} />
                          <input type="hidden" name="returnTo" value={currentPath} />
                          <label className="label">新密码</label>
                          <input className="input" name="password" type="password" minLength={6} required />
                          <button className="primary-button w-full py-2 text-xs" type="submit">确认重置</button>
                        </form>
                      </details>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function buildStudentsPath({ keyword, status }: { keyword: string; status: string }) {
  const params = new URLSearchParams();
  if (keyword) {
    params.set("keyword", keyword);
  }
  if (status) {
    params.set("status", status);
  }
  const query = params.toString();
  return query ? `/admin/students?${query}` : "/admin/students";
}

function StatusBadge({ status }: { status: StudentStatus }) {
  return (
    <span className={`badge ${status === "disabled" ? "bg-coral/10 text-coral" : "bg-teal/10 text-teal"}`}>
      {statusLabels[status]}
    </span>
  );
}

function formatDate(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai"
  });
}
