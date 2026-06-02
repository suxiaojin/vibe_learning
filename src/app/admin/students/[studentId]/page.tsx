import Link from "next/link";
import {
  ArrowLeft,
  BookOpenCheck,
  Crown,
  Gem,
  Info,
  KeyRound,
  Medal,
  Plus,
  ShieldCheck,
  Trophy
} from "lucide-react";
import { notFound } from "next/navigation";
import { addStudentDiamonds, resetStudentPassword, toggleStudentAccountStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMedalLevel, getMedalRule } from "@/lib/rewards";
import { getStudentLearningPath } from "@/lib/syllabus-learning";
import { cn } from "@/lib/utils";

type DetailTab = "basic" | "learning" | "portrait";

type PageProps = {
  params: Promise<{ studentId: string }>;
  searchParams?: Promise<{ error?: string; notice?: string; tab?: string }>;
};

type LearningPath = Awaited<ReturnType<typeof getStudentLearningPath>>;

const avatarColors = [
  { key: "green", className: "bg-[#58cc02]" },
  { key: "sky", className: "bg-sky-500" },
  { key: "coral", className: "bg-coral" },
  { key: "honey", className: "bg-honey" },
  { key: "violet", className: "bg-violet-500" }
];

const genderLabels: Record<string, string> = {
  male: "男",
  female: "女"
};

const passwordChangeLabels = {
  student_self: "学生自行修改",
  admin_reset: "后台重置"
};

const tabs: Array<{ key: DetailTab; label: string }> = [
  { key: "basic", label: "基本信息" },
  { key: "learning", label: "学习画像" },
  { key: "portrait", label: "用户画像" }
];

export default async function StudentDetailPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const activeTab = resolveTab(query?.tab);
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student" },
    include: {
      studentProfile: {
        include: {
          region: true
        }
      },
      diamondAccount: true,
      passwordChangeLogs: {
        include: {
          actor: {
            select: {
              username: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  if (!student) {
    notFound();
  }

  const [totalAttempts, learningPath] = await Promise.all([
    prisma.questionAttempt.count({ where: { userId: student.id } }),
    getStudentLearningPath(student.id)
  ]);

  const profile = student.studentProfile;
  const nickname = profile?.nickname || student.username;
  const avatarColor = avatarColors.some((item) => item.key === profile?.avatarColor) ? profile?.avatarColor || "green" : "green";
  const medal = getMedalRule(getMedalLevel(totalAttempts));
  const returnTo = `/admin/students/${student.id}?tab=${activeTab}`;
  const currentStages = getUnlockedStages(learningPath);

  return (
    <main className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link className="grid size-9 shrink-0 place-items-center text-slate-600 hover:text-teal" href="/admin/students" aria-label="返回学生列表">
            <ArrowLeft size={22} />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-xl font-black text-ink">用户：{nickname}</h1>
              <StatusBadge status={student.status} />
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">{student.username}</p>
          </div>
        </div>

        <form action={toggleStudentAccountStatus}>
          <input type="hidden" name="id" value={student.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button className="secondary-button" type="submit">{student.status === "disabled" ? "启用账号" : "禁用账号"}</button>
        </form>
      </header>

      <nav className="flex gap-8 border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="学生详情导航">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            className={cn(
              "border-b-2 px-0 py-3 transition hover:border-teal hover:text-teal",
              activeTab === tab.key ? "border-teal text-ink" : "border-transparent"
            )}
            href={`/admin/students/${student.id}?tab=${tab.key}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {query?.notice ? <div className="rounded border border-teal/20 bg-teal/10 p-3 text-sm font-semibold text-teal">{query.notice}</div> : null}
      {query?.error ? <div className="rounded border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{query.error}</div> : null}

      {activeTab === "basic" ? (
        <DetailSection icon={<Info size={17} />} title="基本信息">
          <div className="grid justify-items-center px-6 py-6">
            <Avatar name={nickname} color={avatarColor} image={profile?.avatarImage || ""} />
          </div>
          <div className="px-8 pb-6">
            <DetailRow label="用户ID" value={student.id} />
            <DetailRow label="昵称" value={nickname} />
            <DetailRow label="用户名" value={student.username} />
            <DetailRow label="性别" value={genderLabels[profile?.gender || ""] || "未选择"} />
            <DetailRow label="学校" value={profile?.school || "未填写"} />
            <DetailRow label="地区" value={profile?.region?.province || profile?.region?.name || "未选择"} />
            <DetailRow label="学制" value={profile?.region?.studySystem || "未选择"} />
            <DetailRow label="注册日期" value={formatDateTime(student.createdAt)} />
            <DetailRow label="最后登录日期" value={student.lastLoginAt ? formatDateTime(student.lastLoginAt) : "暂无"} />
            <PasswordRow studentId={student.id} returnTo={`/admin/students/${student.id}?tab=basic`} />
            <PasswordChangeLogRow logs={student.passwordChangeLogs} />
          </div>
        </DetailSection>
      ) : null}

      {activeTab === "learning" ? (
        <DetailSection icon={<BookOpenCheck size={17} />} title="学习画像">
          <div className="px-8 pb-6 pt-2">
            <DetailRow label="总答题数" value={`${totalAttempts} 道`} />
            <DetailRow label="AI 使用次数" value="暂不实现" />
            <div className="grid grid-cols-[180px_minmax(0,1fr)] border-b border-dashed border-slate-200 py-4">
              <div className="font-bold text-slate-700">当前关卡</div>
              <div className="min-w-0">
                {!learningPath.completed ? (
                  <p className="text-sm font-semibold text-slate-500">学生尚未完成地区、公共课、专业课选择。</p>
                ) : currentStages.length === 0 ? (
                  <p className="text-sm font-semibold text-slate-500">暂无正在闯关的关卡。</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {currentStages.map((stage) => (
                      <span key={stage.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-[#1f3b57]">
                        {stage.courseTitle}：{stage.chapterTitle} / {stage.sectionTitle}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DetailSection>
      ) : null}

      {activeTab === "portrait" ? (
        <DetailSection icon={<ShieldCheck size={17} />} title="用户画像">
          <div className="px-8 pb-6 pt-2">
            <div className="grid grid-cols-[180px_minmax(0,1fr)] border-b border-dashed border-slate-200 py-4">
              <div className="font-bold text-slate-700">当前勋章等级</div>
              <div className="flex items-center gap-3 font-semibold text-slate-700">
                <MedalIcon gender={profile?.gender || ""} level={medal.level} />
                {medal.label}
              </div>
            </div>
            <div className="grid grid-cols-[180px_minmax(0,1fr)] border-b border-dashed border-slate-200 py-4">
              <div className="font-bold text-slate-700">钻石数</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold text-slate-700">
                  <Gem className="text-sky-500" size={17} />
                  {student.diamondAccount?.balance || 0} 颗
                </div>
                <form action={addStudentDiamonds} className="mt-3 flex max-w-2xl flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={student.id} />
                  <input type="hidden" name="returnTo" value={`/admin/students/${student.id}?tab=portrait`} />
                  <label className="w-40">
                    <span className="label">添加数量</span>
                    <input className="input rounded-none" name="amount" type="number" min={1} step={1} required />
                  </label>
                  <label className="min-w-64 flex-1">
                    <span className="label">说明</span>
                    <input className="input rounded-none" name="note" placeholder="例如 后台活动奖励" />
                  </label>
                  <button className="primary-button rounded-none" type="submit">
                    <Plus size={17} />
                    添加钻石
                  </button>
                </form>
              </div>
            </div>
            <DetailRow label="钻石充值记录" value="暂不实现" />
          </div>
        </DetailSection>
      ) : null}
    </main>
  );
}

function resolveTab(value?: string): DetailTab {
  return value === "learning" || value === "portrait" ? value : "basic";
}

function PasswordRow({ returnTo, studentId }: { returnTo: string; studentId: string }) {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] border-b border-dashed border-slate-200 py-4">
      <div className="flex items-center gap-2 font-bold text-slate-700">
        <KeyRound size={16} />
        用户密码
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-500">不可查看，仅支持后台重置。</p>
        <form action={resetStudentPassword} className="mt-3 flex max-w-xl flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={studentId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="min-w-64 flex-1">
            <span className="label">新密码</span>
            <input className="input rounded-none" name="password" type="password" minLength={6} autoComplete="new-password" required />
          </label>
          <button className="primary-button rounded-none" type="submit">确定重置</button>
        </form>
      </div>
    </div>
  );
}

function PasswordChangeLogRow({
  logs
}: {
  logs: Array<{
    id: string;
    source: "student_self" | "admin_reset";
    note: string | null;
    createdAt: Date;
    actor: { username: string; role: string } | null;
  }>;
}) {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] border-b border-dashed border-slate-200 py-4">
      <div className="font-bold text-slate-700">修改记录</div>
      <div className="min-w-0">
        {logs.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500">暂无密码修改记录。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-black text-slate-400">
                  <th className="py-2 pr-4">时间</th>
                  <th className="py-2 pr-4">方式</th>
                  <th className="py-2 pr-4">操作者</th>
                  <th className="py-2">备注</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-semibold text-slate-600">{formatDateTime(log.createdAt)}</td>
                    <td className="py-2 pr-4 font-bold text-ink">{passwordChangeLabels[log.source]}</td>
                    <td className="py-2 pr-4 text-slate-600">{log.actor ? `${log.actor.username}（${log.actor.role === "admin" ? "管理员" : "学生"}）` : "-"}</td>
                    <td className="py-2 text-slate-500">{log.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function getUnlockedStages(path: LearningPath) {
  return path.groups.flatMap((group) =>
    group.courses.flatMap((course) =>
      course.chapters.flatMap((chapter) =>
        chapter.sections
          .filter((section) => section.status === "unlocked")
          .map((section) => ({
            id: section.id,
            courseTitle: course.title,
            chapterTitle: chapter.title,
            sectionTitle: section.title
          }))
      )
    )
  );
}

function DetailSection({ children, icon, title }: { children: React.ReactNode; icon: React.ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-black text-ink">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function DetailRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] border-b border-dashed border-slate-200 py-4">
      <div className="font-bold text-slate-700">{label}</div>
      <div className="flex min-w-0 items-center gap-2 break-words font-semibold text-slate-700">
        {icon}
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "disabled" }) {
  return (
    <span className={`badge ${status === "disabled" ? "bg-coral/10 text-coral" : "bg-teal/10 text-teal"}`}>
      {status === "disabled" ? "已禁用" : "正常"}
    </span>
  );
}

function MedalIcon({ gender, level }: { gender: string; level: string }) {
  const Icon = level === "scholar" ? Crown : level === "expert" ? Trophy : Medal;
  const colorClass = gender === "female" ? "bg-pink-500 text-white ring-pink-100" : "bg-sky-500 text-white ring-sky-100";
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full ring-2 shadow-sm", colorClass)}>
      <Icon size={17} />
    </span>
  );
}

function Avatar({ color, image, name }: { color: string; image: string; name: string }) {
  const colorClass = avatarColors.find((item) => item.key === color)?.className || avatarColors[0].className;

  if (image) {
    return <img alt={`${name} 的头像`} className="size-16 rounded-full object-cover shadow-sm" src={image} />;
  }

  return (
    <span className={cn("grid size-16 place-items-center rounded-full text-2xl font-black text-white shadow-sm", colorClass)}>
      {name.slice(0, 1).toUpperCase()}
    </span>
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
