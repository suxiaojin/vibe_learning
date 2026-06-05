import type { ReactNode } from "react";
import bcrypt from "bcryptjs";
import { CalendarDays, CheckCircle2, Crown, Gem, KeyRound, Mail, Medal, Pencil, Phone, School, Search, Trophy, UserRound, UsersRound } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AvatarUploadForm } from "@/components/avatar-upload-form";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { formatBuddyError, getBuddyList, searchBuddyCandidates, type BuddySearchFilters } from "@/lib/buddies";
import { prisma } from "@/lib/prisma";
import { getMedalLevel, getMedalRule, medalRules } from "@/lib/rewards";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const avatarColors = [
  { key: "green", className: "bg-[#58cc02]" },
  { key: "sky", className: "bg-sky-500" },
  { key: "coral", className: "bg-coral" },
  { key: "honey", className: "bg-honey" },
  { key: "violet", className: "bg-violet-500" }
];

const avatarMaxBytes = 800 * 1024;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const meSectionClass = "rounded-2xl border border-slate-200/70 bg-transparent shadow-none";
const dayMs = 24 * 60 * 60 * 1000;
const heatmapWeekCount = 26;
const chinaDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric"
});
const heatmapLevelClasses = [
  "border-slate-200 bg-slate-100",
  "border-emerald-100 bg-emerald-100",
  "border-emerald-200 bg-emerald-300",
  "border-emerald-500 bg-emerald-500",
  "border-emerald-700 bg-emerald-700"
];
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const transactionLabels: Record<string, string> = {
  register_bonus: "注册赠送",
  daily_active_bonus: "每日登录",
  daily_answer_bonus: "每日答题",
  purchase: "购买充值",
  admin_adjust: "后台调整",
  ai_consumption: "AI 消耗"
};

type MeTab = "profile" | "medals" | "diamonds" | "buddies";

const meTabs: Array<{ key: MeTab; label: string }> = [
  { key: "profile", label: "我的信息" },
  { key: "medals", label: "我的勋章" },
  { key: "diamonds", label: "我的钻石" },
  { key: "buddies", label: "我的搭子" }
];

type BuddyList = Awaited<ReturnType<typeof getBuddyList>>;
type BuddySearchResult = Awaited<ReturnType<typeof searchBuddyCandidates>>;
type BuddySearchError = {
  code: string;
  details?: unknown;
  message: string;
  status: number;
} | null;

export default async function MePage({
  searchParams
}: {
  searchParams?: Promise<{
    profile?: string;
    password?: string;
    tab?: string;
    error?: string;
    birthYear?: string;
    birthMonth?: string;
    gender?: string;
    schoolId?: string;
    majorId?: string;
    province?: string;
    studySystem?: string;
  }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const activeTab = getActiveMeTab(query?.tab);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const heatmapStart = new Date(Date.now() - (heatmapWeekCount * 7 + 7) * dayMs);
  const [fullUser, transactions, totalAttempts, recentAttempts, schools, majors, regions, buddies] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      include: { studentProfile: { include: { schoolOption: true } } }
    }),
    prisma.diamondTransaction.findMany({
      where: { userId: user.id, createdAt: { gte: oneWeekAgo } },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.questionAttempt.count({ where: { userId: user.id } }),
    prisma.questionAttempt.findMany({
      where: { userId: user.id, createdAt: { gte: heatmapStart } },
      select: { createdAt: true }
    }),
    prisma.school.findMany({
      where: { status: "published" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.major.findMany({
      where: { status: "published" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.region.findMany({
      where: { status: "active" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    activeTab === "buddies" ? getBuddyList(user.id) : Promise.resolve([])
  ]);

  if (!fullUser) {
    redirect("/login");
  }

  const nickname = fullUser.studentProfile?.nickname || fullUser.username;
  const avatarColor = avatarColors.some((item) => item.key === fullUser.studentProfile?.avatarColor)
    ? fullUser.studentProfile?.avatarColor || "green"
    : "green";
  const avatarImage = fullUser.studentProfile?.avatarImage || "";
  const medalLevel = getMedalLevel(totalAttempts);
  const currentMedal = getMedalRule(medalLevel);
  const dailyAttempts = summarizeDailyAttempts(recentAttempts);
  const joinedAt = fullUser.createdAt.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Shanghai"
  });
  const buddySearchFilters = getBuddySearchFilters(query);
  const buddySearchState = activeTab === "buddies" && hasBuddySearchFilters(buddySearchFilters)
    ? await runBuddySearch(user.id, buddySearchFilters)
    : { result: null, error: null };

  return (
    <main className="min-h-dvh bg-mist/60 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="me" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="border-b border-slate-200 bg-white px-6 py-6">
            <div className="flex items-center gap-5">
              <Avatar name={nickname} color={avatarColor} image={avatarImage} size="header" />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-3">
                  <h1 className="truncate text-3xl font-black text-ink">{nickname}</h1>
                  <CurrentMedalBadge gender={fullUser.studentProfile?.gender || ""} level={currentMedal.level} label={currentMedal.label} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-slate-500">
                  <span className="whitespace-nowrap">用户名：{fullUser.username}</span>
                  <span className="text-slate-300">|</span>
                  <span className="whitespace-nowrap">{joinedAt} 加入</span>
                </div>
              </div>
            </div>
          </header>

          <ProfileTabs activeTab={activeTab} />

          <Message type={query?.profile} successText="资料已保存" />
          <Message type={query?.password} successText="密码已更新" />

          {activeTab === "profile" ? (
            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <ProfilePanel
                username={fullUser.username}
                nickname={nickname}
                avatarColor={avatarColor}
                avatarImage={avatarImage}
                profileStatus={query?.profile}
                gender={fullUser.studentProfile?.gender || ""}
                school={fullUser.studentProfile?.school || ""}
                schoolId={fullUser.studentProfile?.schoolId || ""}
                schools={schools}
                birthYear={fullUser.studentProfile?.birthYear || ""}
                birthMonth={fullUser.studentProfile?.birthMonth || ""}
                phoneNumber={fullUser.phoneNumber || ""}
                email={fullUser.email || ""}
              />
              <PasswordPanel status={query?.password} />
            </section>
          ) : null}

          {activeTab === "medals" ? (
            <MedalTrack
              dailyAttempts={dailyAttempts}
              gender={fullUser.studentProfile?.gender || ""}
              totalAttempts={totalAttempts}
            />
          ) : null}

          {activeTab === "diamonds" ? <DiamondPanel transactions={transactions} /> : null}

          {activeTab === "buddies" ? (
            <BuddyPanel
              buddies={buddies}
              errorCode={query?.error}
              filters={buddySearchFilters}
              majors={majors}
              regions={regions}
              schools={schools}
              searchError={buddySearchState.error}
              searchResult={buddySearchState.result}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function getActiveMeTab(tab?: string): MeTab {
  return meTabs.some((item) => item.key === tab) ? (tab as MeTab) : "profile";
}

function getBuddySearchFilters(query?: {
  birthYear?: string;
  birthMonth?: string;
  gender?: string;
  schoolId?: string;
  majorId?: string;
  province?: string;
  studySystem?: string;
}): BuddySearchFilters {
  return {
    birthYear: parseInteger(query?.birthYear),
    birthMonth: parseInteger(query?.birthMonth),
    gender: query?.gender === "male" || query?.gender === "female" ? query.gender : undefined,
    schoolId: query?.schoolId?.trim() || undefined,
    majorId: query?.majorId?.trim() || undefined,
    province: query?.province?.trim() || undefined,
    studySystem: query?.studySystem?.trim() || undefined
  };
}

function hasBuddySearchFilters(filters: BuddySearchFilters) {
  return Boolean(
    (filters.birthYear && filters.birthMonth)
      || filters.gender
      || filters.schoolId
      || filters.majorId
      || filters.province
      || filters.studySystem
  );
}

async function runBuddySearch(userId: string, filters: BuddySearchFilters): Promise<{ result: BuddySearchResult | null; error: BuddySearchError }> {
  try {
    return { result: await searchBuddyCandidates(userId, filters), error: null };
  } catch (error) {
    return { result: null, error: formatBuddyError(error) || { code: "UNKNOWN", message: "搜索失败，请稍后再试。", status: 500 } };
  }
}

function relationshipLabel(action: string) {
  const labels: Record<string, string> = {
    none: "查看主页",
    outgoing_pending: "等待处理",
    incoming_pending: "待你处理",
    outgoing_withdraw_cooldown: "冷却中",
    active: "已是搭子",
    terminated: "无法添加",
    self: "自己"
  };
  return labels[action] || "查看主页";
}

function parseInteger(value?: string) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function SectionFrame({
  bodyClassName,
  children,
  icon,
  title
}: {
  bodyClassName?: string;
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className={meSectionClass}>
      <div className="flex items-center gap-3 border-b border-slate-200/80 px-5 py-4">
        {icon}
        <h2 className="text-lg font-black text-ink">{title}</h2>
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

function ProfileTabs({ activeTab }: { activeTab: MeTab }) {
  return (
    <nav aria-label="个人档案功能" className="border-b border-slate-200">
      <div className="flex min-h-16 gap-7 overflow-x-auto px-1">
        {meTabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <a
              key={tab.key}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center border-b-2 px-1 pt-1 text-sm font-black transition",
                active
                  ? "border-teal text-ink"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-ink"
              )}
              href={`/me?tab=${tab.key}`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function ProfilePanel({
  username,
  nickname,
  avatarColor,
  avatarImage,
  profileStatus,
  gender,
  school,
  schoolId,
  schools,
  birthYear,
  birthMonth,
  phoneNumber,
  email
}: {
  username: string;
  nickname: string;
  avatarColor: string;
  avatarImage: string;
  profileStatus?: string;
  gender: string;
  school: string;
  schoolId: string;
  schools: Array<{ id: string; name: string; province: string }>;
  birthYear: number | "";
  birthMonth: number | "";
  phoneNumber: string;
  email: string;
}) {
  const avatarError =
    profileStatus === "avatar_size"
      ? "上传失败，大小不超过 800KB"
      : profileStatus === "avatar_type"
        ? "上传失败，仅支持 JPG、PNG、WebP"
        : null;

  return (
    <SectionFrame icon={<UserRound className="text-teal" size={22} />} title="我的信息">
      <div>
        <span className="label">头像</span>
        <AvatarUploadForm action={updateAvatar} errorText={avatarError}>
          <Avatar name={nickname} color={avatarColor} image={avatarImage} size="md" />
        </AvatarUploadForm>
      </div>

      <form action={updateProfile} className="mt-5 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="label">昵称</span>
            <input className="input" name="nickname" defaultValue={nickname} maxLength={30} />
          </label>
          <div>
            <span className="label">用户名</span>
            <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">
              {username}
            </div>
          </div>
        </div>

        <fieldset>
          <legend className="label">性别</legend>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: "不选择" },
              { value: "male", label: "男" },
              { value: "female", label: "女" }
            ].map((item) => (
              <label key={item.value || "unset"} className="cursor-pointer">
                <input className="peer sr-only" name="gender" type="radio" value={item.value} defaultChecked={gender === item.value} />
                <span className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition peer-checked:border-teal peer-checked:bg-teal peer-checked:text-white">
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="label">出生年份</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input className="input pl-10" name="birthYear" defaultValue={birthYear} inputMode="numeric" maxLength={4} placeholder="例如 2006" />
            </div>
          </label>
          <label>
            <span className="label">出生月份</span>
            <select className="input" name="birthMonth" defaultValue={birthMonth}>
              <option value="">不选择</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>{month} 月</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span className="label">学校</span>
          <div className="relative">
            <School className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input className="input pl-10" name="school" defaultValue={school} list="school-options" maxLength={80} placeholder="填写或选择学校名称" />
            <input name="schoolId" type="hidden" value={schoolId} />
            <datalist id="school-options">
              {schools.map((item) => (
                <option key={item.id} value={item.name}>{item.province}</option>
              ))}
            </datalist>
          </div>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="label">手机号</span>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input className="input pl-10" name="phoneNumber" defaultValue={phoneNumber} maxLength={30} placeholder="填写手机号" />
            </div>
          </label>
          <label>
            <span className="label">邮箱地址</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input className="input pl-10" name="email" defaultValue={email} maxLength={120} placeholder="填写邮箱地址" />
            </div>
          </label>
        </div>

        <button className="primary-button" type="submit">
          <Pencil size={18} />
          保存资料
        </button>
      </form>
    </SectionFrame>
  );
}

function PasswordPanel({ status }: { status?: string }) {
  const errorText =
    status === "invalid"
      ? "当前密码不正确"
      : status === "mismatch"
        ? "两次新密码不一致"
        : status === "short"
          ? "新密码至少 6 个字符"
          : null;

  return (
    <SectionFrame icon={<KeyRound className="text-teal" size={22} />} title="修改密码">
      {errorText ? <p className="mt-4 rounded-xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">{errorText}</p> : null}
      <form action={changePassword} className="mt-5 space-y-4">
        <label>
          <span className="label">当前密码</span>
          <input className="input" name="currentPassword" type="password" autoComplete="current-password" />
        </label>
        <label>
          <span className="label">新密码</span>
          <input className="input" name="newPassword" type="password" autoComplete="new-password" />
        </label>
        <label>
          <span className="label">确认新密码</span>
          <input className="input" name="confirmPassword" type="password" autoComplete="new-password" />
        </label>
        <button className="secondary-button w-full" type="submit">
          更新密码
        </button>
      </form>
    </SectionFrame>
  );
}

function DiamondPanel({
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
  return (
    <SectionFrame icon={<Gem className="text-sky-500" size={22} />} title="我的钻石">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.72fr)_280px] xl:items-start">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-black text-slate-400">
                <th className="py-3 pr-4">时间</th>
                <th className="py-3 pr-4">类型</th>
                <th className="py-3 pr-4">数量</th>
                <th className="py-3 pr-4">余额</th>
                <th className="py-3">说明</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td className="py-6 text-center text-sm font-semibold text-slate-400" colSpan={5}>
                    暂无钻石记录
                  </td>
                </tr>
              ) : (
                transactions.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-slate-500">{formatDateTime(item.createdAt)}</td>
                    <td className="py-3 pr-4 font-bold text-ink">{transactionLabels[item.type] || item.type}</td>
                    <td className={cn("py-3 pr-4 font-black", item.amount >= 0 ? "text-[#58cc02]" : "text-coral")}>
                      {item.amount >= 0 ? "+" : ""}
                      {item.amount}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-slate-600">{item.balanceAfter}</td>
                    <td className="py-3 text-slate-500">{item.note || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <aside className="rounded-2xl border border-slate-200/70 bg-sky-50/50 p-5">
          <h3 className="text-lg font-black text-ink">钻石充值</h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">充值功能即将上线，敬请关注~</p>
        </aside>
      </div>
    </SectionFrame>
  );
}

function BuddyPanel({
  buddies,
  errorCode,
  filters,
  majors,
  regions,
  schools,
  searchError,
  searchResult
}: {
  buddies: BuddyList;
  errorCode?: string;
  filters: BuddySearchFilters;
  majors: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; province: string; studySystem: string }>;
  schools: Array<{ id: string; name: string; province: string }>;
  searchError: BuddySearchError;
  searchResult: BuddySearchResult | null;
}) {
  const provinces = Array.from(new Set(regions.map((region) => region.province))).filter(Boolean);
  const studySystems = Array.from(new Set(regions.map((region) => region.studySystem))).filter(Boolean);
  const actionErrorText: Record<string, string> = {
    BUDDY_REQUEST_PENDING: "申请已发送，等待对方处理。",
    BUDDY_REQUEST_REVERSED_PENDING: "对方已经申请你为搭子，请进入个人主页处理申请。",
    BUDDY_RELATIONSHIP_TERMINATED: "双方已经不能再次建立搭子关系。",
    BUDDY_REQUEST_WITHDRAW_COOLDOWN: "撤回申请后 30 天内不能再次申请该用户。",
    BUDDY_REQUEST_NOT_ACTIONABLE: "该申请当前不能处理。",
    UNKNOWN: "操作失败，请稍后再试。"
  };

  return (
    <section className="space-y-6">
      {errorCode ? (
        <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
          {actionErrorText[errorCode] || actionErrorText.UNKNOWN}
        </p>
      ) : null}

      <SectionFrame icon={<UsersRound className="text-teal" size={22} />} title="我的搭子">
        {buddies.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            还没有搭子。可以在下方按条件搜索同学。
          </p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {buddies.map((buddy) => (
              <a key={buddy.pairId} className="group w-24 shrink-0 text-center" href={`/students/${buddy.user.id}`}>
                <div className="mx-auto w-fit transition group-hover:scale-105">
                  <Avatar name={buddy.user.nickname} color={buddy.user.avatarColor} image={buddy.user.avatarImage} size="md" />
                </div>
                <p className="mt-2 truncate text-sm font-black text-ink group-hover:text-teal">{buddy.user.nickname}</p>
              </a>
            ))}
          </div>
        )}
      </SectionFrame>

      <SectionFrame icon={<Search className="text-sky-500" size={22} />} title="搜索搭子">
        <form className="grid gap-4 md:grid-cols-3" method="get">
          <input name="tab" type="hidden" value="buddies" />
          <label>
            <span className="label">出生年份</span>
            <input className="input" name="birthYear" defaultValue={filters.birthYear || ""} inputMode="numeric" placeholder="2006" />
          </label>
          <label>
            <span className="label">出生月份</span>
            <select className="input" name="birthMonth" defaultValue={filters.birthMonth || ""}>
              <option value="">不限</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>{month} 月</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">性别</span>
            <select className="input" name="gender" defaultValue={filters.gender || ""}>
              <option value="">不限</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </label>
          <label>
            <span className="label">学校</span>
            <select className="input" name="schoolId" defaultValue={filters.schoolId || ""}>
              <option value="">不限</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">专业</span>
            <select className="input" name="majorId" defaultValue={filters.majorId || ""}>
              <option value="">不限</option>
              {majors.map((major) => (
                <option key={major.id} value={major.id}>{major.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">省份</span>
            <select className="input" name="province" defaultValue={filters.province || ""}>
              <option value="">不限</option>
              {provinces.map((province) => (
                <option key={province} value={province}>{province}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">学制</span>
            <select className="input" name="studySystem" defaultValue={filters.studySystem || ""}>
              <option value="">不限</option>
              {studySystems.map((studySystem) => (
                <option key={studySystem} value={studySystem}>{studySystem}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 md:col-span-2">
            <button className="primary-button" type="submit">
              <Search size={18} />
              搜索
            </button>
            <a className="secondary-button" href="/me?tab=buddies">清空</a>
          </div>
        </form>

        {searchError ? (
          <p className="mt-4 rounded-xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
            {searchError.message}
            {typeof searchError.details === "object" && searchError.details && "missingFields" in searchError.details
              ? ` 缺少：${(searchError.details as { missingFields?: string[] }).missingFields?.join("、") || ""}`
              : ""}
          </p>
        ) : null}

        {searchResult ? (
          <div className="mt-6 space-y-3">
            {searchResult.items.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">没有找到符合条件的用户。</p>
            ) : (
              searchResult.items.map((item) => (
                <a
                  key={item.user.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-teal/40 hover:bg-teal/5"
                  href={`/students/${item.user.id}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={item.user.nickname} color={item.user.avatarColor} image={item.user.avatarImage} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-ink">{item.user.nickname}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                        {[item.user.schoolName, item.user.majorName, item.user.province, item.user.studySystem].filter(Boolean).join(" · ") || "资料未公开"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-black text-teal">{relationshipLabel(item.relationship.action)}</span>
                </a>
              ))
            )}
          </div>
        ) : null}
      </SectionFrame>
    </section>
  );
}

function MedalTrack({
  dailyAttempts,
  gender,
  totalAttempts
}: {
  dailyAttempts: Record<string, number>;
  gender: string;
  totalAttempts: number;
}) {
  const expertTarget = medalRules.find((rule) => rule.level === "expert")?.minAttempts || 400;
  const scholarTarget = medalRules.find((rule) => rule.level === "scholar")?.minAttempts || 600;
  const nextRule = medalRules.find((rule) => rule.minAttempts > totalAttempts);
  const remaining = nextRule ? Math.max(0, nextRule.minAttempts - totalAttempts) : 0;
  const progress =
    totalAttempts >= scholarTarget
      ? 100
      : totalAttempts >= expertTarget
        ? 50 + ((totalAttempts - expertTarget) / (scholarTarget - expertTarget)) * 50
        : (totalAttempts / expertTarget) * 50;
  const progressPercent = Math.max(0, Math.min(100, progress));
  const nodes = [
    { label: "小白", threshold: 0, position: 0, icon: Medal },
    { label: "达人", threshold: expertTarget, position: 50, icon: Trophy },
    { label: "学霸", threshold: scholarTarget, position: 100, icon: Crown }
  ];
  const medalColor = gender === "female" ? "bg-pink-500" : "bg-sky-500";

  return (
    <SectionFrame icon={<Medal className="text-teal" size={22} />} title="我的勋章">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,520px)_minmax(320px,1fr)] xl:items-start">
        <div className="min-w-0">
          <div className="rounded-2xl border border-slate-200/70 bg-transparent px-4 py-5">
            <div className="relative w-full max-w-[520px] px-2 pb-14 pt-8 text-xs">
              <div className="absolute left-2 right-2 top-[62px] h-1.5 rounded-full bg-slate-200" />
              <div className="absolute left-2 top-[62px] h-1.5 rounded-full bg-honey" style={{ width: `calc((100% - 16px) * ${progressPercent / 100})` }} />
              <div className="absolute top-[57px] z-20 size-4 rounded-full border-2 border-white bg-teal shadow-soft" style={{ left: `calc(8px + (100% - 16px) * ${progressPercent / 100})`, transform: "translateX(-50%)" }} />

              {nodes.map((node) => {
                const reached = totalAttempts >= node.threshold;
                const Icon = node.icon;
                return (
                  <div key={node.label} className="absolute top-0 z-10 w-20" style={{ left: `calc(8px + (100% - 16px) * ${node.position / 100})`, transform: nodeTransform(node.position) }}>
                    <p className="mb-4 text-center text-xs font-black text-ink">{node.label}</p>
                    <span className={cn("mx-auto grid size-9 place-items-center rounded-full border-2 border-white shadow-soft", reached ? `${medalColor} text-white` : "bg-slate-200 text-slate-400")}>
                      <Icon size={18} />
                    </span>
                    <p className="mt-2 text-center text-[11px] font-black text-slate-400">{node.threshold === 0 ? "默认" : `${node.threshold} 道`}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200/70 pt-3 text-xs font-semibold">
              <span className="text-slate-500">
                当前进度：<strong className="text-sky-600">{totalAttempts}</strong> 道
              </span>
              <span className="text-slate-500">
                {nextRule ? (
                  <>
                    距离{nextRule.label}还差 <strong className="text-coral">{remaining}</strong> 道题
                  </>
                ) : (
                  <strong className="text-teal">已获得最高勋章</strong>
                )}
              </span>
            </div>
          </div>
        </div>

        <AnswerHeatmap dailyAttempts={dailyAttempts} />
      </div>
    </SectionFrame>
  );
}

function nodeTransform(position: number) {
  if (position === 0) {
    return "translateX(0)";
  }
  if (position === 100) {
    return "translateX(-100%)";
  }
  return "translateX(-50%)";
}

function AnswerHeatmap({ dailyAttempts }: { dailyAttempts: Record<string, number> }) {
  const weeks = buildHeatmapWeeks(dailyAttempts);
  const monthAttemptCount = getCurrentMonthAttemptCount(dailyAttempts);
  const monthHeaders = weeks.map((week, weekIndex) => getWeekMonthLabel(week, weekIndex));

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-transparent px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-ink">Active Learning</h3>
        <span className="text-xs font-semibold text-slate-500">本月 {monthAttemptCount} 题</span>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="grid min-w-max grid-cols-[2rem_auto] gap-x-2 gap-y-1">
          <div />
          <div className="flex gap-1 text-[10px] font-semibold leading-3 text-slate-400">
            {monthHeaders.map((label, index) => (
              <span key={`${label}-${index}`} className="h-3 w-3 shrink-0 overflow-visible whitespace-nowrap">
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-rows-7 gap-1 text-right text-[10px] font-semibold leading-3 text-slate-400">
            {["", "Mon", "", "Wed", "", "Fri", ""].map((label, index) => (
              <span key={`${label}-${index}`} className="h-3">
                {label}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-rows-7 gap-1">
                {week.map((day) => (
                  <span
                    key={day.key}
                    aria-label={`${day.key} 答题 ${day.count} 道`}
                    className={cn(
                      "block size-3 rounded-[3px] border",
                      day.future ? "border-transparent bg-transparent" : heatmapLevelClasses[day.level]
                    )}
                    title={`${day.key}：${day.count} 道`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-[11px] font-semibold text-slate-400">
        <span>Less</span>
        {heatmapLevelClasses.map((levelClass) => (
          <span key={levelClass} className={cn("size-3 rounded-[3px] border", levelClass)} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function summarizeDailyAttempts(attempts: Array<{ createdAt: Date }>) {
  return attempts.reduce<Record<string, number>>((result, attempt) => {
    const key = getChinaDateKey(attempt.createdAt);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function getCurrentMonthAttemptCount(dailyAttempts: Record<string, number>) {
  const currentMonth = getChinaDateKey(new Date()).slice(0, 7);
  return Object.entries(dailyAttempts).reduce((total, [key, count]) => (key.startsWith(currentMonth) ? total + count : total), 0);
}

function getWeekMonthLabel(week: Array<{ key: string }>, weekIndex: number) {
  const firstOfMonth = week.find((day) => parseDateKey(day.key).getUTCDate() === 1);
  if (firstOfMonth) {
    return monthLabels[parseDateKey(firstOfMonth.key).getUTCMonth()];
  }
  if (weekIndex === 0 && week[0]) {
    return monthLabels[parseDateKey(week[0].key).getUTCMonth()];
  }
  return "";
}

function buildHeatmapWeeks(dailyAttempts: Record<string, number>) {
  const today = parseDateKey(getChinaDateKey(new Date()));
  const gridEnd = new Date(today.getTime() + (6 - today.getUTCDay()) * dayMs);
  const gridStart = new Date(gridEnd.getTime() - (heatmapWeekCount * 7 - 1) * dayMs);

  return Array.from({ length: heatmapWeekCount }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(gridStart.getTime() + (weekIndex * 7 + dayIndex) * dayMs);
      const key = formatDateKey(date);
      const future = date.getTime() > today.getTime();
      const count = future ? 0 : dailyAttempts[key] || 0;
      return {
        count,
        future,
        key,
        level: getHeatmapLevel(count)
      };
    })
  );
}

function getHeatmapLevel(count: number) {
  if (count >= 30) {
    return 4;
  }
  if (count >= 20) {
    return 3;
  }
  if (count >= 10) {
    return 2;
  }
  if (count >= 1) {
    return 1;
  }
  return 0;
}

function getChinaDateKey(date: Date) {
  const parts = chinaDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CurrentMedalBadge({ gender, level, label }: { gender: string; level: string; label: string }) {
  const Icon = level === "scholar" ? Crown : level === "expert" ? Trophy : Medal;
  const colorClass = gender === "female" ? "bg-pink-500 text-white ring-pink-100" : "bg-sky-500 text-white ring-sky-100";

  return (
    <span
      aria-label={`${label}勋章`}
      className={cn("inline-grid size-8 shrink-0 place-items-center rounded-full ring-4 shadow-sm", colorClass)}
      title={`${label}勋章`}
    >
      <Icon size={17} />
    </span>
  );
}

function Message({ type, successText, errors = {} }: { type?: string; successText: string; errors?: Record<string, string> }) {
  if (type !== "updated") {
    const errorText = type ? errors[type] : null;
    return errorText ? <p className="rounded-2xl border border-coral/20 bg-coral/10 px-4 py-3 text-sm font-bold text-coral">{errorText}</p> : null;
  }

  return (
    <p className="flex items-center gap-2 rounded-2xl border border-teal/20 bg-teal/10 px-4 py-3 text-sm font-bold text-teal">
      <CheckCircle2 size={18} />
      {successText}
    </p>
  );
}

function Avatar({ name, color, image, size }: { name: string; color: string; image?: string; size: "header" | "md" | "lg" }) {
  const colorClass = avatarColors.find((item) => item.key === color)?.className || avatarColors[0].className;
  const sizeClass =
    size === "lg"
      ? "size-28 text-5xl font-black"
      : size === "header"
        ? "size-20 text-3xl font-black"
        : "size-24 text-4xl font-black";

  if (image) {
    return (
      <img
        alt={`${name} 的头像`}
        className={cn("shrink-0 rounded-full object-cover shadow-soft", sizeClass)}
        src={image}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-white shadow-soft",
        colorClass,
        sizeClass
      )}
    >
      {name.slice(0, 1).toUpperCase()}
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

async function updateProfile(formData: FormData) {
  "use server";

  const user = await requireUser();
  const nicknameInput = String(formData.get("nickname") || "").trim();
  const nickname = nicknameInput.slice(0, 30) || user.username;
  const genderInput = String(formData.get("gender") || "");
  const gender = genderInput === "male" || genderInput === "female" ? genderInput : null;
  const schoolInput = String(formData.get("school") || "").trim();
  const school = schoolInput ? schoolInput.slice(0, 80) : null;
  const schoolRecord = school ? await findOrCreateSchoolByName(school) : null;
  const birthYearInput = String(formData.get("birthYear") || "").trim();
  const birthMonthInput = String(formData.get("birthMonth") || "").trim();
  const parsedBirthYear = Number(birthYearInput);
  const parsedBirthMonth = Number(birthMonthInput);
  const hasBirthYear = birthYearInput.length > 0 && Number.isInteger(parsedBirthYear) && parsedBirthYear >= 1900;
  const hasBirthMonth = birthMonthInput.length > 0 && Number.isInteger(parsedBirthMonth) && parsedBirthMonth >= 1 && parsedBirthMonth <= 12;
  const birthYear = hasBirthYear && hasBirthMonth ? parsedBirthYear : null;
  const birthMonth = hasBirthYear && hasBirthMonth ? parsedBirthMonth : null;
  const phoneInput = String(formData.get("phoneNumber") || "").trim();
  const phoneNumber = phoneInput ? phoneInput.slice(0, 30) : null;
  const emailInput = String(formData.get("email") || "").trim();
  const email = emailInput ? emailInput.toLowerCase().slice(0, 120) : null;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        phoneNumber,
        email
      }
    }),
    prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: {
        nickname,
        gender,
        school,
        schoolId: schoolRecord?.id || null,
        birthYear,
        birthMonth
      },
      create: {
        userId: user.id,
        nickname,
        gender,
        school,
        schoolId: schoolRecord?.id || null,
        birthYear,
        birthMonth
      }
    })
  ]);

  revalidatePath("/me");
  redirect("/me?tab=profile&profile=updated");
}

async function findOrCreateSchoolByName(name: string) {
  const normalized = name.trim().slice(0, 80);
  if (!normalized) {
    return null;
  }
  const existing = await prisma.school.findFirst({
    where: { name: normalized, status: "published" },
    orderBy: [{ province: "asc" }, { sortOrder: "asc" }]
  });
  if (existing) {
    return existing;
  }
  return prisma.school.upsert({
    where: {
      province_name: {
        province: "未设置",
        name: normalized
      }
    },
    update: { status: "published" },
    create: {
      name: normalized,
      province: "未设置",
      status: "published"
    }
  });
}

async function updateAvatar(formData: FormData) {
  "use server";

  const user = await requireUser();
  const avatarImage = await readAvatarImage(formData.get("avatarImage"));

  if (!avatarImage) {
    redirect("/me?tab=profile");
  }

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: { avatarImage },
    create: {
      userId: user.id,
      nickname: user.username,
      avatarImage
    }
  });

  revalidatePath("/me");
  redirect("/me?tab=profile&profile=updated");
}

async function readAvatarImage(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (value.size > avatarMaxBytes) {
    redirect("/me?tab=profile&profile=avatar_size");
  }

  if (!allowedAvatarTypes.has(value.type)) {
    redirect("/me?tab=profile&profile=avatar_type");
  }

  const bytes = Buffer.from(await value.arrayBuffer());
  return `data:${value.type};base64,${bytes.toString("base64")}`;
}

async function changePassword(formData: FormData) {
  "use server";

  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword.length < 6) {
    redirect("/me?tab=profile&password=short");
  }
  if (newPassword !== confirmPassword) {
    redirect("/me?tab=profile&password=mismatch");
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true }
  });

  if (!fullUser || !(await bcrypt.compare(currentPassword, fullUser.passwordHash))) {
    redirect("/me?tab=profile&password=invalid");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) }
    }),
    prisma.passwordChangeLog.create({
      data: {
        userId: user.id,
        actorUserId: user.id,
        source: "student_self",
        note: "学生自行修改密码"
      }
    })
  ]);

  revalidatePath("/me");
  redirect("/me?tab=profile&password=updated");
}
