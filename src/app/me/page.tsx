import type { ReactNode } from "react";
import bcrypt from "bcryptjs";
import { CheckCircle2, Crown, Gem, KeyRound, Mail, Medal, Pencil, Phone, School, Trash2, Trophy, UserRound } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AutoDismissMessage } from "@/components/auto-dismiss-message";
import { AvatarUploadForm } from "@/components/avatar-upload-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { HomeProfileEditor } from "@/components/home-profile-editor";
import { ShareToBuddyButton, type ShareCopySuggestion } from "@/components/share-to-buddy-button";
import { SocialPostCard, type SocialPostNode } from "@/components/social-post-card";
import { SocialMedalBadge } from "@/components/social-medal-badge";
import { SocialPostActions } from "@/components/social-post-actions";
import { StudentPageShell } from "@/components/student-page-shell";
import { SurfaceCard, TabNav } from "@/components/student-ui";
import { requireUser } from "@/lib/auth";
import type { BuddyShareCard } from "@/lib/buddy-share-cards";
import { deleteBuddyPost, likeBuddyPost, listProfileBuddyPosts, repostBuddyPost, unlikeBuddyPost, unrepostBuddyPost } from "@/lib/buddy-posts";
import { isDefaultAvatarSrc } from "@/lib/default-avatars";
import { prisma } from "@/lib/prisma";
import { medalRules } from "@/lib/rewards";
import { getSocialProfile } from "@/lib/social";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const avatarColors = [
  { key: "green", className: "bg-success" },
  { key: "sky", className: "bg-sky-500" },
  { key: "coral", className: "bg-coral" },
  { key: "honey", className: "bg-honey" },
  { key: "violet", className: "bg-violet-500" }
];

const avatarMaxBytes = 800 * 1024;
const coverMaxBytes = 2 * 1024 * 1024;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
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

type MeTab = "profile" | "medals" | "diamonds" | "homepage";

const meTabs: Array<{ key: MeTab; label: string }> = [
  { key: "homepage", label: "我的主页" },
  { key: "profile", label: "我的信息" },
  { key: "medals", label: "我的勋章" },
  { key: "diamonds", label: "我的钻石" }
];

type SocialProfile = Awaited<ReturnType<typeof getSocialProfile>>;
type ProfilePost = Awaited<ReturnType<typeof listProfileBuddyPosts>>["items"][number];

export default async function MePage({
  searchParams
}: {
  searchParams?: Promise<{
    profile?: string;
    password?: string;
    tab?: string;
  }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const activeTab = getActiveMeTab(query?.tab);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const heatmapStart = new Date(Date.now() - (heatmapWeekCount * 7 + 7) * dayMs);
  const [fullUser, transactions, totalAttempts, recentAttempts, schools, homeProfile, homePosts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      include: { studentProfile: { include: { region: true, schoolOption: true } } }
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
    activeTab === "homepage" ? getSocialProfile(user.id, user.id) : Promise.resolve(null),
    activeTab === "homepage" ? listProfileBuddyPosts(user.id, user.id, { includeInteractions: true, tab: "posts", limit: 30 }) : Promise.resolve({ items: [], nextCursor: null })
  ]);

  if (!fullUser) {
    redirect("/login");
  }

  const nickname = fullUser.studentProfile?.nickname || fullUser.username;
  const avatarColor = avatarColors.some((item) => item.key === fullUser.studentProfile?.avatarColor)
    ? fullUser.studentProfile?.avatarColor || "green"
    : "green";
  const avatarImage = fullUser.studentProfile?.avatarImage || "";
  const dailyAttempts = summarizeDailyAttempts(recentAttempts);

  return (
    <StudentPageShell active="me" contentClassName="xl:px-8">
      <div className="space-y-6">
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

        {activeTab === "homepage" && homeProfile ? (
          <MyHomePagePanel
            posts={homePosts.items}
            profile={homeProfile}
            profileStatus={query?.profile}
          />
        ) : null}
      </div>
    </StudentPageShell>
  );
}

function getActiveMeTab(tab?: string): MeTab {
  return meTabs.some((item) => item.key === tab) ? (tab as MeTab) : "homepage";
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
    <SurfaceCard className="overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-slate-200/80 px-5 py-4">
        {icon}
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </SurfaceCard>
  );
}

function ProfileTabs({ activeTab }: { activeTab: MeTab }) {
  return <TabNav activeKey={activeTab} ariaLabel="个人档案功能" items={meTabs.map((tab) => ({ ...tab, href: `/me?tab=${tab.key}` }))} />;
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
        <AvatarUploadForm action={updateAvatar} currentAvatarImage={avatarImage} errorText={avatarError}>
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
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-400">
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
                    <td className={cn("py-3 pr-4 font-semibold", item.amount >= 0 ? "text-success-strong" : "text-coral")}>
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
          <h3 className="text-lg font-semibold text-ink">钻石充值</h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">充值功能即将上线，敬请关注~</p>
        </aside>
      </div>
    </SectionFrame>
  );
}

function MyHomePagePanel({
  posts,
  profile,
  profileStatus
}: {
  posts: ProfilePost[];
  profile: SocialProfile;
  profileStatus?: string;
}) {
  const profileErrorText: Record<string, string> = {
    avatar_size: "头像大小不能超过 800KB",
    avatar_type: "头像仅支持 JPG、PNG、WebP",
    cover_size: "背景图大小不能超过 2MB",
    cover_type: "背景图仅支持 JPG、PNG、WebP"
  };
  const editModalId = "home-profile-editor";
  const openEditor = Boolean(profileStatus && profileStatus !== "updated" && profileErrorText[profileStatus]);
  const profileMeta = [profile.user.province, profile.user.studySystem, profile.user.majorName].filter(Boolean).join(" - ");

  return (
    <section className="space-y-5">
      {profileStatus && profileStatus !== "updated" && profileErrorText[profileStatus] ? (
        <AutoDismissMessage className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
          {profileErrorText[profileStatus]}
        </AutoDismissMessage>
      ) : null}

      <section className="surface-card overflow-hidden p-0">
        <div
          className="h-48 bg-slate-200 bg-cover bg-center md:h-64"
          style={profile.user.coverImage ? { backgroundImage: `url(${profile.user.coverImage})` } : undefined}
        />
        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
            <Avatar name={profile.user.nickname} color={profile.user.avatarColor} image={profile.user.avatarImage} size="lg" />
            <label className="secondary-button cursor-pointer" htmlFor={editModalId}>
              <Pencil size={17} />
              编辑个人资料
            </label>
          </div>

          <div className="mt-4">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="truncate text-[32px] font-bold leading-tight text-ink">{profile.user.nickname}</h2>
              <SocialMedalBadge gender={profile.user.gender} label={profile.user.medalLabel} level={profile.user.medalLevel} />
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-500">@{profile.user.username}</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-slate-500">
              <span>{formatJoinedMonth(profile.user.joinedAt)} 加入</span>
              <span>{profileMeta || "省份 - 学制 - 专业未填写"}</span>
            </div>
            {profile.user.bio ? <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-600">{profile.user.bio}</p> : null}
            <div className="mt-5 flex flex-wrap gap-5 text-sm">
              <StatValue label="粉丝" value={profile.stats.followerCount} />
              <StatValue label="获赞" value={profile.stats.likedCount} />
              <StatValue label="关注" value={profile.stats.followingCount} />
              <StatValue label="帖子" value={profile.stats.postCount} />
            </div>
          </div>
        </div>
      </section>

      <HomeProfileEditor
        action={updateHomeProfile}
        avatarColor={profile.user.avatarColor}
        avatarImage={profile.user.avatarImage}
        bio={profile.user.bio}
        coverImage={profile.user.coverImage}
        modalId={editModalId}
        name={profile.user.nickname}
        openInitially={openEditor}
      />

      <section className="surface-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-ink">我的帖子</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {posts.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm font-semibold text-slate-500">这里暂时还没有内容。</p>
          ) : (
            posts.map((post) => <HomePostCard key={post.id} post={post} />)
          )}
        </div>
      </section>
    </section>
  );
}

function StatValue({ label, value }: { label: string; value: number }) {
  return (
    <span className="font-semibold text-slate-500">
      <strong className="mr-1 text-base text-ink">{value}</strong>{label}
    </span>
  );
}

function HomePostCard({ post }: { post: ProfilePost }) {
  const deleteFormId = `home-post-delete-${post.id}`;

  return (
    <SocialPostCard
      actionMenu={post.canDelete ? (
        <form id={deleteFormId} action={deleteHomePost}>
          <input name="postId" type="hidden" value={post.id} />
          <ConfirmSubmitButton
            aria-label="删除帖子"
            className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-coral/10 hover:text-coral"
            form={deleteFormId}
            message="确认删除这条帖子？删除后不可恢复。"
          >
            <Trash2 size={17} />
          </ConfirmSubmitButton>
        </form>
      ) : null}
      embedded
      getDateLabel={formatDateTime}
      id={`post-${post.id}`}
      post={post as SocialPostNode}
      renderActions={(targetPost) => <HomePostActions post={targetPost} />}
    />
  );
}

function HomePostActions({ post }: { post: SocialPostNode }) {
  return (
    <SocialPostActions
      canLike={post.canLike}
      canRepost={post.canRepost}
      initialLikeCount={post.likeCount}
      initialLiked={post.likedByMe}
      initialRepostCount={post.repostCount}
      initialReposted={post.repostedByMe}
      postId={post.id}
      repostSource={getPostRepostSource(post)}
    />
  );
}

function getPostRepostSource(post: {
  author: { nickname: string; username: string };
  canRepost: boolean;
  content: string;
  createdAt: Date | string;
  originalPost?: { content: string } | null;
}) {
  return post.canRepost
    ? {
        authorName: post.author.nickname,
        content: post.content || post.originalPost?.content || "",
        createdAtLabel: formatDateTime(post.createdAt),
        username: post.author.username
      }
    : undefined;
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
  const monthAttemptCount = getCurrentMonthAttemptCount(dailyAttempts);
  const activeDays = Object.values(dailyAttempts).filter((count) => count > 0).length;
  const activeLearningShareContent = "晒一下最近的学习节奏，继续冲。";
  const activeLearningShareSuggestions = getActiveLearningShareSuggestions();
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
                    <p className="mb-4 text-center text-xs font-semibold text-ink">{node.label}</p>
                    <span className={cn("mx-auto grid size-9 place-items-center rounded-full border-2 border-white shadow-soft", reached ? `${medalColor} text-white` : "bg-slate-200 text-slate-400")}>
                      <Icon size={18} />
                    </span>
                    <p className="mt-2 text-center text-[11px] font-semibold text-slate-400">{node.threshold === 0 ? "默认" : `${node.threshold} 道`}</p>
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

        <AnswerHeatmap
          activeDays={activeDays}
          dailyAttempts={dailyAttempts}
          monthAttemptCount={monthAttemptCount}
          nextLabel={nextRule?.label}
          remaining={remaining}
          shareContent={activeLearningShareContent}
          shareSuggestions={activeLearningShareSuggestions}
          totalAttempts={totalAttempts}
        />
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

function getActiveLearningShareSuggestions(): ShareCopySuggestion[] {
  return [
    { label: "学习节奏", content: "晒一下最近的学习节奏，继续冲。" },
    { label: "坚持打卡", content: "把学习活跃度发出来，给自己一个继续坚持的理由。" },
    { label: "搭子监督", content: "今天也在认真刷题，欢迎搭子们监督我。" }
  ];
}

function AnswerHeatmap({
  activeDays,
  dailyAttempts,
  monthAttemptCount,
  nextLabel,
  remaining,
  shareContent,
  shareSuggestions,
  totalAttempts
}: {
  activeDays: number;
  dailyAttempts: Record<string, number>;
  monthAttemptCount: number;
  nextLabel?: string;
  remaining: number;
  shareContent: string;
  shareSuggestions: ShareCopySuggestion[];
  totalAttempts: number;
}) {
  const weeks = buildHeatmapWeeks(dailyAttempts);
  const monthHeaders = weeks.map((week, weekIndex) => getWeekMonthLabel(week, weekIndex));
  const activeLearningShareCard: BuddyShareCard = {
    type: "active_learning_card",
    activeDays,
    monthAttemptCount,
    nextLabel,
    remaining,
    totalAttempts,
    weeks
  };

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-transparent px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">学习活跃度</h3>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs font-semibold text-slate-500">本月 {monthAttemptCount} 题</span>
          <ShareToBuddyButton
            buttonClassName="min-h-8 rounded-xl px-3 py-1 text-xs"
            buttonLabel="分享"
            contentSuggestions={shareSuggestions}
            copyContext="active_learning"
            defaultContent={shareContent}
            shareCard={activeLearningShareCard}
            sourceLabel="学习活跃度"
          />
        </div>
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

function Message({ type, successText, errors = {} }: { type?: string; successText: string; errors?: Record<string, string> }) {
  if (type !== "updated") {
    const errorText = type ? errors[type] : null;
    return errorText ? (
      <AutoDismissMessage className="rounded-2xl border border-coral/20 bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
        {errorText}
      </AutoDismissMessage>
    ) : null;
  }

  return (
    <AutoDismissMessage className="flex items-center gap-2 rounded-2xl border border-teal/20 bg-teal/10 px-4 py-3 text-sm font-bold text-teal">
      <CheckCircle2 size={18} />
      {successText}
    </AutoDismissMessage>
  );
}

function Avatar({ name, color, image, size }: { name: string; color: string; image?: string; size: "header" | "md" | "lg" | "sm" }) {
  const colorClass = avatarColors.find((item) => item.key === color)?.className || avatarColors[0].className;
  const sizeClass =
    size === "lg"
      ? "size-28 text-5xl font-bold"
      : size === "header"
        ? "size-20 text-3xl font-bold"
        : size === "sm"
          ? "size-12 text-lg font-bold"
          : "size-24 text-4xl font-bold";

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

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai"
  });
}

function formatJoinedMonth(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Shanghai"
  });
}

async function updateHomeProfile(formData: FormData) {
  "use server";

  const user = await requireUser();
  const nicknameInput = String(formData.get("nickname") || "").trim();
  const nickname = nicknameInput.slice(0, 30) || user.username;
  const bioInput = String(formData.get("bio") || "").trim();
  const bio = bioInput ? bioInput.slice(0, 300) : null;
  const uploadedAvatarImage = await readUploadedImage(formData.get("avatarImage"), {
    maxBytes: avatarMaxBytes,
    sizeRedirect: "/me?tab=homepage&profile=avatar_size",
    typeRedirect: "/me?tab=homepage&profile=avatar_type"
  });
  const presetAvatarImage = uploadedAvatarImage
    ? null
    : readPresetAvatarImage(formData.get("presetAvatarImage"), "/me?tab=homepage&profile=avatar_type");
  const avatarImage = uploadedAvatarImage || presetAvatarImage;
  const coverImage = await readUploadedImage(formData.get("coverImage"), {
    maxBytes: coverMaxBytes,
    sizeRedirect: "/me?tab=homepage&profile=cover_size",
    typeRedirect: "/me?tab=homepage&profile=cover_type"
  });
  const imageData: { avatarImage?: string; coverImage?: string } = {};
  if (avatarImage) {
    imageData.avatarImage = avatarImage;
  }
  if (coverImage) {
    imageData.coverImage = coverImage;
  }

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: {
      nickname,
      bio,
      ...imageData
    },
    create: {
      userId: user.id,
      nickname,
      bio,
      ...imageData
    }
  });

  revalidatePath("/me");
  revalidatePath(`/students/${user.id}`);
  redirect("/me?tab=homepage&profile=updated");
}

async function deleteHomePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  await deleteBuddyPost(user.id, String(formData.get("postId") || ""));
  revalidatePath("/me");
  revalidatePath("/buddy-circle");
  redirect("/me?tab=homepage");
}

async function likeHomePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  await likeBuddyPost(user.id, String(formData.get("postId") || ""));
  revalidatePath("/me");
  revalidatePath("/buddy-circle");
  redirect("/me?tab=homepage");
}

async function unlikeHomePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  await unlikeBuddyPost(user.id, String(formData.get("postId") || ""));
  revalidatePath("/me");
  revalidatePath("/buddy-circle");
  redirect("/me?tab=homepage");
}

async function repostHomePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  await repostBuddyPost(user.id, String(formData.get("postId") || ""), String(formData.get("content") || ""));
  revalidatePath("/me");
  revalidatePath("/buddy-circle");
  redirect("/me?tab=homepage");
}

async function unrepostHomePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  await unrepostBuddyPost(user.id, String(formData.get("postId") || ""));
  revalidatePath("/me");
  revalidatePath("/buddy-circle");
  redirect("/me?tab=homepage");
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
        schoolId: schoolRecord?.id || null
      },
      create: {
        userId: user.id,
        nickname,
        gender,
        school,
        schoolId: schoolRecord?.id || null
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
  const uploadedAvatarImage = await readAvatarImage(formData.get("avatarImage"));
  const presetAvatarImage = uploadedAvatarImage
    ? null
    : readPresetAvatarImage(formData.get("presetAvatarImage"), "/me?tab=profile&profile=avatar_type");
  const avatarImage = uploadedAvatarImage || presetAvatarImage;

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
  revalidatePath(`/students/${user.id}`);
  redirect("/me?tab=profile&profile=updated");
}

async function readAvatarImage(value: FormDataEntryValue | null) {
  return readUploadedImage(value, {
    maxBytes: avatarMaxBytes,
    sizeRedirect: "/me?tab=profile&profile=avatar_size",
    typeRedirect: "/me?tab=profile&profile=avatar_type"
  });
}

function readPresetAvatarImage(value: FormDataEntryValue | null, typeRedirect: string) {
  const avatarImage = String(value || "").trim();
  if (!avatarImage) {
    return null;
  }

  if (!isDefaultAvatarSrc(avatarImage)) {
    redirect(typeRedirect);
  }

  return avatarImage;
}

async function readUploadedImage(
  value: FormDataEntryValue | null,
  options: { maxBytes: number; sizeRedirect: string; typeRedirect: string }
) {
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (value.size > options.maxBytes) {
    redirect(options.sizeRedirect);
  }

  if (!allowedAvatarTypes.has(value.type)) {
    redirect(options.typeRedirect);
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
