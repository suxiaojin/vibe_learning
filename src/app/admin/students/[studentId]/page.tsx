import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  FileText,
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
  Trash2,
  Trophy
} from "lucide-react";
import { notFound } from "next/navigation";
import { addStudentDiamonds, deleteStudentPost, resetStudentPassword, toggleStudentAccountStatus, updateStudentAdminRemark } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { listProfileBuddyPosts } from "@/lib/buddy-posts";
import { prisma } from "@/lib/prisma";
import { getMedalLevel, getMedalRule } from "@/lib/rewards";
import { getStudentLearningPath } from "@/lib/syllabus-learning";
import { cn } from "@/lib/utils";

type DetailTab = "basic" | "learning" | "portrait";

type PageProps = {
  params: Promise<{ studentId: string }>;
  searchParams?: Promise<{ diamondPage?: string; error?: string; notice?: string; postPage?: string; tab?: string }>;
};

type LearningPath = Awaited<ReturnType<typeof getStudentLearningPath>>;
type ProfilePost = Awaited<ReturnType<typeof listProfileBuddyPosts>>["items"][number];

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
    } | null;
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
const portraitPageSize = 5;

const transactionLabels: Record<string, string> = {
  register_bonus: "注册赠送",
  daily_active_bonus: "每日登录",
  daily_answer_bonus: "每日答题",
  purchase: "购买充值",
  admin_adjust: "后台调整",
  ai_consumption: "AI 消耗"
};

export default async function StudentDetailPage({ params, searchParams }: PageProps) {
  const admin = await requireAdmin();
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const activeTab = resolveTab(query?.tab);
  const diamondPage = resolvePage(query?.diamondPage);
  const postPage = resolvePage(query?.postPage);
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

  const postFetchLimit = Math.min(postPage * portraitPageSize + 1, 50);
  const [
    totalAttempts,
    gradedAttempts,
    correctAttempts,
    latestAttempt,
    sevenDayAttempts,
    recentSessions,
    wrongQuestions,
    diamondTransactionCount,
    diamondTransactions,
    userPosts,
    learningPath
  ] = await Promise.all([
    prisma.questionAttempt.count({ where: { userId: student.id } }),
    prisma.questionAttempt.count({ where: { userId: student.id, gradingStatus: "auto_graded" } }),
    prisma.questionAttempt.count({ where: { userId: student.id, gradingStatus: "auto_graded", isCorrect: true } }),
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
    prisma.diamondTransaction.count({
      where: { userId: student.id }
    }),
    prisma.diamondTransaction.findMany({
      where: { userId: student.id },
      orderBy: { createdAt: "desc" },
      skip: (diamondPage - 1) * portraitPageSize,
      take: portraitPageSize
    }),
    listProfileBuddyPosts(admin.id, student.id, { includeInteractions: true, tab: "posts", limit: postFetchLimit }),
    getStudentLearningPath(student.id)
  ]);

  const profile = student.studentProfile;
  const nickname = profile?.nickname || student.username;
  const avatarColor = avatarColors.some((item) => item.key === profile?.avatarColor) ? profile?.avatarColor || "green" : "green";
  const medal = getMedalRule(getMedalLevel(totalAttempts));
  const returnTo = `/admin/students/${student.id}?tab=${activeTab}`;
  const currentStages = getUnlockedStages(learningPath);
  const selectedSpecialty = getSelectedSpecialty(profile);
  const correctRate = gradedAttempts > 0 ? Math.round((correctAttempts / gradedAttempts) * 100) : 0;
  const passedStageCount = getPassedStageCount(learningPath);
  const weakAreas = buildWeakAreas(wrongQuestions);
  const userPostPageItems = userPosts.items.slice((postPage - 1) * portraitPageSize, postPage * portraitPageSize);
  const userPostsHasNext = userPosts.items.length > postPage * portraitPageSize;
  const portraitBasePath = `/admin/students/${student.id}`;

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
              <DiamondTransactionsTable
                basePath={portraitBasePath}
                currentPage={diamondPage}
                postPage={postPage}
                totalCount={diamondTransactionCount}
                transactions={diamondTransactions}
              />
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
            <div className="grid grid-cols-[180px_minmax(0,1fr)] border-b border-dashed border-slate-200 py-4">
              <div className="flex items-center gap-2 font-bold text-slate-700">
                <FileText size={16} />
                用户帖子
              </div>
              <UserPostsList
                basePath={portraitBasePath}
                currentPage={postPage}
                diamondPage={diamondPage}
                hasNext={userPostsHasNext}
                posts={userPostPageItems}
                returnTo={`${portraitBasePath}?tab=portrait&diamondPage=${diamondPage}&postPage=${postPage}`}
                studentId={student.id}
              />
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

function resolvePage(value?: string) {
  const page = Number(value || 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function portraitPageHref(basePath: string, pages: { diamondPage: number; postPage: number }) {
  const params = new URLSearchParams({
    tab: "portrait",
    diamondPage: String(Math.max(1, pages.diamondPage)),
    postPage: String(Math.max(1, pages.postPage))
  });
  return `${basePath}?${params.toString()}`;
}

function PaginationControls({
  currentPage,
  hasNext,
  hrefForPage
}: {
  currentPage: number;
  hasNext: boolean;
  hrefForPage: (page: number) => string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-black">
      {currentPage > 1 ? (
        <Link className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-slate-600 hover:border-teal hover:text-teal" href={hrefForPage(currentPage - 1)}>
          <ChevronLeft size={14} />
          上一页
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 rounded border border-slate-100 px-2 py-1 text-slate-300">
          <ChevronLeft size={14} />
          上一页
        </span>
      )}
      <span className="rounded bg-slate-100 px-2 py-1 text-slate-500">第 {currentPage} 页</span>
      {hasNext ? (
        <Link className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-slate-600 hover:border-teal hover:text-teal" href={hrefForPage(currentPage + 1)}>
          下一页
          <ChevronRight size={14} />
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 rounded border border-slate-100 px-2 py-1 text-slate-300">
          下一页
          <ChevronRight size={14} />
        </span>
      )}
    </div>
  );
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
            const hasScoredQuestions = session.totalCount > 0;
            const passed = !hasScoredQuestions || (session.score || 0) >= 80;
            return (
              <tr key={session.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 font-semibold text-slate-600">
                  {session.syllabusItem.course.name}：{session.syllabusItem.parent?.title ? `${session.syllabusItem.parent.title} / ` : ""}
                  {session.syllabusItem.title}
                </td>
                <td className="py-2 pr-4 font-bold text-ink">{hasScoredQuestions ? session.score ?? "-" : "不计分"}</td>
                <td className="py-2 pr-4 text-slate-600">
                  {hasScoredQuestions ? `${session.correctCount}/${session.totalCount}` : "-"}
                </td>
                <td className={cn("py-2 pr-4 font-bold", passed ? "text-teal" : "text-coral")}>
                  {!hasScoredQuestions ? "已完成" : passed ? "通过" : "未通过"}
                </td>
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
  basePath,
  currentPage,
  postPage,
  totalCount,
  transactions
}: {
  basePath: string;
  currentPage: number;
  postPage: number;
  totalCount: number;
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
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-500">暂无钻石流水。</p>
        <PaginationControls
          currentPage={currentPage}
          hasNext={false}
          hrefForPage={(page) => portraitPageHref(basePath, { diamondPage: page, postPage })}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="overflow-x-auto">
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
      <PaginationControls
        currentPage={currentPage}
        hasNext={currentPage * portraitPageSize < totalCount}
        hrefForPage={(page) => portraitPageHref(basePath, { diamondPage: page, postPage })}
      />
    </div>
  );
}

function UserPostsList({
  basePath,
  currentPage,
  diamondPage,
  hasNext,
  posts,
  returnTo,
  studentId
}: {
  basePath: string;
  currentPage: number;
  diamondPage: number;
  hasNext: boolean;
  posts: ProfilePost[];
  returnTo: string;
  studentId: string;
}) {
  if (posts.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-500">暂无帖子内容。</p>
        <PaginationControls
          currentPage={currentPage}
          hasNext={hasNext}
          hrefForPage={(page) => portraitPageHref(basePath, { diamondPage, postPage: page })}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {posts.map((post) => (
        <UserPostCard key={post.id} post={post} returnTo={returnTo} studentId={studentId} />
      ))}
      <PaginationControls
        currentPage={currentPage}
        hasNext={hasNext}
        hrefForPage={(page) => portraitPageHref(basePath, { diamondPage, postPage: page })}
      />
    </div>
  );
}

function UserPostCard({ post, returnTo, studentId }: { post: ProfilePost; returnTo: string; studentId: string }) {
  const isOwnPost = post.author.id === studentId;
  const postLabel = isOwnPost ? (post.type === "repost" ? "转帖" : "原创") : "点赞";

  return (
    <article className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="font-black text-ink">{post.author.nickname}</span>
          <span className="font-semibold text-slate-400">@{post.author.username}</span>
          <span className="font-semibold text-slate-400">· {formatDateTime(post.createdAt)}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-500">
            {postLabel}
          </span>
        </div>
        {isOwnPost ? (
          <details className="relative shrink-0">
            <summary
              aria-label="删除帖子"
              className="grid size-8 cursor-pointer list-none place-items-center rounded-full text-slate-400 transition hover:bg-coral/10 hover:text-coral [&::-webkit-details-marker]:hidden"
            >
              <Trash2 size={16} />
            </summary>
            <form action={deleteStudentPost} className="absolute right-0 z-10 mt-2 w-52 rounded border border-coral/20 bg-white p-3 shadow-lg">
              <input name="studentId" type="hidden" value={studentId} />
              <input name="postId" type="hidden" value={post.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <p className="text-xs font-bold leading-5 text-slate-600">确认删除这条{post.type === "repost" ? "转帖" : "帖子"}？</p>
              <button className="mt-2 w-full rounded bg-coral px-3 py-2 text-xs font-black text-white" type="submit">
                确认删除
              </button>
            </form>
          </details>
        ) : null}
      </div>
      {post.type === "original" ? (
        <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {post.content ? <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p> : null}
          <UserRepostSourceCard originalPost={post.originalPost} sourceState={post.sourceState} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
        <span>点赞 {post.likeCount}</span>
        <span>转帖 {post.repostCount}</span>
      </div>
    </article>
  );
}

function UserRepostSourceCard({
  depth = 0,
  originalPost,
  sourceState
}: {
  depth?: number;
  originalPost: ProfilePost["originalPost"];
  sourceState: ProfilePost["sourceState"];
}) {
  if (sourceState !== "visible" || !originalPost) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-bold text-slate-400">原内容已删除</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded border border-slate-200 bg-slate-50 p-4", depth > 0 ? "bg-white/70" : "")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-black text-ink">{originalPost.author.nickname}</span>
        <span className="font-semibold text-slate-400">@{originalPost.author.username}</span>
        <span className="font-semibold text-slate-400">· {formatDateTime(originalPost.createdAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-600">{originalPost.content}</p>
      {originalPost.type === "repost" ? (
        <div className="mt-3 border-l-2 border-slate-200 pl-3">
          <UserRepostSourceCard depth={depth + 1} originalPost={originalPost.originalPost} sourceState={originalPost.sourceState} />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
        <span>点赞 {originalPost.likeCount}</span>
        <span>转帖 {originalPost.repostCount}</span>
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

  if (item.question.knowledgePoint) {
    return {
      key: `point:${item.question.knowledgePoint.id}`,
      title: item.question.knowledgePoint.title,
      scope: item.question.knowledgePoint.chapter.title
    };
  }

  return {
    key: "unclassified",
    title: "未归类题目",
    scope: "尚未打知识点标签"
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
