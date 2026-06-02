import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Crown,
  Gem,
  Info,
  KeyRound,
  ListChecks,
  Mail,
  Medal,
  MessageSquare,
  Percent,
  Phone,
  Plus,
  ShieldCheck,
  Trophy
} from "lucide-react";
import { notFound } from "next/navigation";
import { addStudentDiamonds, resetStudentPassword, toggleStudentAccountStatus, updateStudentAdminRemark } from "@/app/admin/actions";
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

type StudentDetailProfile = {
  publicSubject?: { name: string } | null;
  major?: { name: string } | null;
} | null;

type RecentQuizSession = {
  id: string;
  score: number | null;
  correctCount: number;
  totalCount: number;
  completedAt: Date | null;
  syllabusItem: {
    title: string;
    parent: { title: string } | null;
    course: { name: string };
  };
};

type WeakSyllabusItem = {
  id: string;
  title: string;
  parent: { title: string } | null;
  course: { name: string };
};

type WeakQuestionSource = Array<{
  wrongCount: number;
  lastWrongAt: Date;
  question: {
    knowledgePoint: {
      id: string;
      title: string;
      chapter: { title: string };
    };
    syllabusItem: WeakSyllabusItem | null;
    knowledgeTags: Array<{ syllabusItem: WeakSyllabusItem }>;
  };
}>;

type WeakArea = {
  key: string;
  title: string;
  scope: string;
  wrongCount: number;
  questionCount: number;
  lastWrongAt: Date;
};

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

const dayMs = 24 * 60 * 60 * 1000;

const transactionLabels: Record<string, string> = {
  register_bonus: "注册赠送",
  daily_active_bonus: "每日登录",
  daily_answer_bonus: "每日答题",
  purchase: "购买充值",
  admin_adjust: "后台调整",
  ai_consumption: "AI 消耗"
};

export default async function StudentDetailPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const activeTab = resolveTab(query?.tab);
  const sevenDaysAgo = new Date(Date.now() - 7 * dayMs);
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student" },
    include: {
      studentProfile: {
        include: {
          region: true,
          publicSubject: true,
          major: true
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

  const [totalAttempts, correctAttempts, latestAttempt, sevenDayAttempts, recentSessions, wrongQuestions, diamondTransactions, learningPath] = await Promise.all([
    prisma.questionAttempt.count({ where: { userId: student.id } }),
    prisma.questionAttempt.count({ where: { userId: student.id, isCorrect: true } }),
    prisma.questionAttempt.findFirst({
      where: { userId: student.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    }),
    prisma.questionAttempt.count({ where: { userId: student.id, createdAt: { gte: sevenDaysAgo } } }),
    prisma.quizSession.findMany({
      where: { userId: student.id, status: "completed" },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      take: 5,
      select: {
        id: true,
        score: true,
        correctCount: true,
        totalCount: true,
        completedAt: true,
        syllabusItem: {
          select: {
            title: true,
            parent: { select: { title: true } },
            course: { select: { name: true } }
          }
        }
      }
    }),
    prisma.wrongQuestion.findMany({
      where: { userId: student.id, status: "active" },
      orderBy: [{ wrongCount: "desc" }, { lastWrongAt: "desc" }],
      take: 100,
      select: {
        id: true,
        wrongCount: true,
        lastWrongAt: true,
        question: {
          select: {
            knowledgePoint: {
              select: {
                id: true,
                title: true,
                chapter: { select: { title: true } }
              }
            },
            syllabusItem: {
              select: {
                id: true,
                title: true,
                parent: { select: { title: true } },
                course: { select: { name: true } }
              }
            },
            knowledgeTags: {
              select: {
                syllabusItem: {
                  select: {
                    id: true,
                    title: true,
                    parent: { select: { title: true } },
                    course: { select: { name: true } }
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.diamondTransaction.findMany({
      where: { userId: student.id },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    getStudentLearningPath(student.id)
  ]);

  const profile = student.studentProfile;
  const nickname = profile?.nickname || student.username;
  const avatarColor = avatarColors.some((item) => item.key === profile?.avatarColor) ? profile?.avatarColor || "green" : "green";
  const medal = getMedalRule(getMedalLevel(totalAttempts));
  const returnTo = `/admin/students/${student.id}?tab=${activeTab}`;
  const currentStages = getUnlockedStages(learningPath);
  const selectedSpecialty = getSelectedSpecialty(profile);
  const correctRate = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
  const passedStageCount = getPassedStageCount(learningPath);
  const weakAreas = buildWeakAreas(wrongQuestions);

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
            <DetailRow label="已选专业" value={selectedSpecialty} />
            <DetailRow icon={<Phone size={15} />} label="手机号" value={student.phoneNumber || "未填写"} />
            <DetailRow icon={<Mail size={15} />} label="邮箱地址" value={student.email || "未填写"} />
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
          <div className="space-y-6 px-8 py-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard icon={<ListChecks size={18} />} label="累计答题数" value={`${totalAttempts} 道`} />
              <MetricCard icon={<Percent size={18} />} label="正确率" value={`${correctRate}%`} />
              <MetricCard icon={<CheckCircle2 size={18} />} label="通过关卡数" value={`${passedStageCount} 个`} />
              <MetricCard icon={<Clock size={18} />} label="最近一次做题" value={latestAttempt ? formatDateTime(latestAttempt.createdAt) : "暂无"} />
              <MetricCard icon={<Activity size={18} />} label="近 7 天答题量" value={`${sevenDayAttempts} 道`} />
            </div>

            <DetailSubsection title="当前关卡">
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
            </DetailSubsection>

            <DetailSubsection title="最近答题记录">
              <RecentQuizSessionsTable sessions={recentSessions} />
            </DetailSubsection>

            <DetailSubsection title="薄弱知识点/章节">
              <WeakAreasList areas={weakAreas} />
            </DetailSubsection>
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
            <div className="grid grid-cols-[180px_minmax(0,1fr)] border-b border-dashed border-slate-200 py-4">
              <div className="font-bold text-slate-700">钻石流水</div>
              <DiamondTransactionsTable transactions={diamondTransactions} />
            </div>
            <div className="grid grid-cols-[180px_minmax(0,1fr)] border-b border-dashed border-slate-200 py-4">
              <div className="flex items-center gap-2 font-bold text-slate-700">
                <MessageSquare size={16} />
                后台备注
              </div>
              <form action={updateStudentAdminRemark} className="min-w-0 space-y-3">
                <input type="hidden" name="id" value={student.id} />
                <input type="hidden" name="returnTo" value={`/admin/students/${student.id}?tab=portrait`} />
                <textarea
                  className="input min-h-28 rounded-none py-3"
                  maxLength={1000}
                  name="adminRemark"
                  defaultValue={student.adminRemark || ""}
                  placeholder="记录运营跟进、特殊情况或学习服务备注"
                />
                <button className="secondary-button rounded-none" type="submit">保存备注</button>
              </form>
            </div>
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

function DetailSubsection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="border-t border-slate-200 pt-4">
      <h2 className="mb-3 text-sm font-black text-ink">{title}</h2>
      {children}
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-black text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-xl font-black text-ink">{value}</p>
    </div>
  );
}

function RecentQuizSessionsTable({ sessions }: { sessions: RecentQuizSession[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm font-semibold text-slate-500">暂无已完成的答题记录。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-black text-slate-400">
            <th className="py-2 pr-4">关卡</th>
            <th className="py-2 pr-4">分数</th>
            <th className="py-2 pr-4">正确题数</th>
            <th className="py-2 pr-4">是否通过</th>
            <th className="py-2">完成时间</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const passed = (session.score || 0) >= 80;
            return (
              <tr key={session.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 font-semibold text-slate-600">
                  {session.syllabusItem.course.name}：{session.syllabusItem.parent?.title ? `${session.syllabusItem.parent.title} / ` : ""}
                  {session.syllabusItem.title}
                </td>
                <td className="py-2 pr-4 font-bold text-ink">{session.score ?? "-"}</td>
                <td className="py-2 pr-4 text-slate-600">
                  {session.correctCount}/{session.totalCount}
                </td>
                <td className={cn("py-2 pr-4 font-bold", passed ? "text-teal" : "text-coral")}>{passed ? "通过" : "未通过"}</td>
                <td className="py-2 text-slate-500">{session.completedAt ? formatDateTime(session.completedAt) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WeakAreasList({ areas }: { areas: WeakArea[] }) {
  if (areas.length === 0) {
    return <p className="text-sm font-semibold text-slate-500">暂无活跃错题，暂未形成薄弱点。</p>;
  }

  return (
    <div className="grid gap-2">
      {areas.slice(0, 5).map((area) => (
        <div key={area.key} className="grid gap-2 rounded border border-slate-200 bg-white px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-black text-ink">
              <AlertTriangle className="text-honey" size={16} />
              <span className="truncate">{area.title}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">{area.scope}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-500">
            <span className="rounded-full bg-coral/10 px-2 py-1 text-coral">错 {area.wrongCount} 次</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">{area.questionCount} 道题</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">
              最近 {formatDateTime(area.lastWrongAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiamondTransactionsTable({
  transactions
}: {
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: Date;
  }>;
}) {
  if (transactions.length === 0) {
    return <p className="text-sm font-semibold text-slate-500">暂无钻石流水。</p>;
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-black text-slate-400">
            <th className="py-2 pr-4">时间</th>
            <th className="py-2 pr-4">类型</th>
            <th className="py-2 pr-4">数量</th>
            <th className="py-2 pr-4">余额</th>
            <th className="py-2">说明</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-4 font-semibold text-slate-500">{formatDateTime(item.createdAt)}</td>
              <td className="py-2 pr-4 font-bold text-ink">{transactionLabels[item.type] || item.type}</td>
              <td className={cn("py-2 pr-4 font-black", item.amount >= 0 ? "text-[#58cc02]" : "text-coral")}>
                {formatSignedNumber(item.amount)}
              </td>
              <td className="py-2 pr-4 font-semibold text-slate-600">{item.balanceAfter}</td>
              <td className="py-2 text-slate-500">{item.note || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function getPassedStageCount(path: LearningPath) {
  return path.groups.reduce(
    (total, group) =>
      total +
      group.courses.reduce(
        (courseTotal, course) =>
          courseTotal +
          course.chapters.reduce((chapterTotal, chapter) => chapterTotal + chapter.sections.filter((section) => section.status === "passed").length, 0),
        0
      ),
    0
  );
}

function getSelectedSpecialty(profile: StudentDetailProfile) {
  const names = [profile?.publicSubject?.name, profile?.major?.name].filter(Boolean);
  return names.length > 0 ? names.join(" / ") : "未选择";
}

function buildWeakAreas(wrongQuestions: WeakQuestionSource): WeakArea[] {
  const areaByKey = new Map<string, WeakArea>();

  for (const item of wrongQuestions) {
    const target = getWeakAreaTarget(item);
    const current = areaByKey.get(target.key);
    if (current) {
      current.wrongCount += item.wrongCount;
      current.questionCount += 1;
      current.lastWrongAt = current.lastWrongAt > item.lastWrongAt ? current.lastWrongAt : item.lastWrongAt;
      continue;
    }
    areaByKey.set(target.key, {
      ...target,
      wrongCount: item.wrongCount,
      questionCount: 1,
      lastWrongAt: item.lastWrongAt
    });
  }

  return Array.from(areaByKey.values()).sort(
    (left, right) =>
      right.wrongCount - left.wrongCount ||
      right.questionCount - left.questionCount ||
      right.lastWrongAt.getTime() - left.lastWrongAt.getTime()
  );
}

function getWeakAreaTarget(item: WeakQuestionSource[number]) {
  const taggedItem = item.question.knowledgeTags[0]?.syllabusItem || item.question.syllabusItem;
  if (taggedItem) {
    return {
      key: `syllabus:${taggedItem.id}`,
      title: taggedItem.title,
      scope: `${taggedItem.course.name}${taggedItem.parent?.title ? ` / ${taggedItem.parent.title}` : ""}`
    };
  }

  return {
    key: `point:${item.question.knowledgePoint.id}`,
    title: item.question.knowledgePoint.title,
    scope: item.question.knowledgePoint.chapter.title
  };
}

function formatSignedNumber(value: number) {
  return value >= 0 ? `+${value}` : String(value);
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
