import { ArrowLeft, Gem, Heart, Medal, Repeat2, UserCheck, UserPlus } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student-sidebar";
import { listProfileBuddyPosts, type ProfilePostTab } from "@/lib/buddy-posts";
import { formatBuddyError } from "@/lib/buddies";
import { requireUser } from "@/lib/auth";
import { followUser, getSocialProfile, unfollowUser } from "@/lib/social";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProfilePost = Awaited<ReturnType<typeof listProfileBuddyPosts>>["items"][number];
type SocialProfile = Awaited<ReturnType<typeof getSocialProfile>>;

const errorText: Record<string, string> = {
  SOCIAL_FOLLOW_SELF_NOT_ALLOWED: "不能关注自己。",
  SOCIAL_PROFILE_NOT_FOUND: "用户不存在或暂不可访问。",
  UNKNOWN: "操作失败，请稍后再试。"
};

export default async function StudentProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<{ error?: string; homeTab?: string }>;
}) {
  const currentUser = await requireUser();
  if (currentUser.role !== "student") {
    redirect("/admin");
  }
  const { userId } = await params;
  const query = await searchParams;
  const activeTab = getProfilePostTab(query?.homeTab);
  const [profile, posts] = await Promise.all([
    getSocialProfile(currentUser.id, userId),
    listProfileBuddyPosts(currentUser.id, userId, { tab: activeTab, limit: 30 })
  ]);

  return (
    <main className="min-h-dvh bg-mist/60 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="buddy-circle" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <a className="inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-teal" href="/buddy-circle">
            <ArrowLeft size={17} />
            返回搭子圈
          </a>

          {query?.error ? (
            <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
              {errorText[query.error] || errorText.UNKNOWN}
            </p>
          ) : null}

          <ProfileHero profile={profile} />

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
            <ProfileTabs activeTab={activeTab} targetId={profile.user.id} />
            <div className="divide-y divide-slate-100">
              {posts.items.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm font-semibold text-slate-500">这里暂时还没有内容。</p>
              ) : (
                posts.items.map((post) => <ProfilePostCard key={post.id} post={post} />)
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function ProfileHero({ profile }: { profile: SocialProfile }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
      <div
        className="h-48 bg-slate-200 bg-cover bg-center md:h-64"
        style={profile.user.coverImage ? { backgroundImage: `url(${profile.user.coverImage})` } : undefined}
      />
      <div className="px-6 pb-6">
        <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
          <ProfileAvatar user={profile.user} size="lg" />
          <ProfileAction profile={profile} />
        </div>

        <div className="mt-4">
          <h1 className="text-3xl font-black text-ink">{profile.user.nickname}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">@{profile.user.username}</p>
          <p className="mt-4 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-700">
            {profile.user.bio || "这个用户还没有填写简介。"}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-slate-500">
            <span>{formatDateTime(profile.user.joinedAt)} 加入</span>
            <span>{profile.user.province || "省份未填写"}</span>
            <span className="flex items-center gap-1"><Gem size={16} className="text-sky-500" />{profile.user.diamondBalance} 钻石</span>
            <span className="flex items-center gap-1"><Medal size={16} className="text-honey" />{profile.user.medalLabel}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-5 text-sm">
            <StatValue label="粉丝" value={profile.stats.followerCount} />
            <StatValue label="获赞" value={profile.stats.likedCount} />
            <StatValue label="关注" value={profile.stats.followingCount} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileAction({ profile }: { profile: SocialProfile }) {
  if (profile.relationship.isSelf) {
    return (
      <a className="secondary-button" href="/me?tab=homepage">
        编辑我的主页
      </a>
    );
  }

  return (
    <form action={profile.relationship.isFollowing ? unfollowFromProfile : followFromProfile}>
      <input name="targetId" type="hidden" value={profile.user.id} />
      <button className={profile.relationship.isFollowing ? "secondary-button" : "primary-button"} type="submit">
        {profile.relationship.isFollowing ? <UserCheck size={18} /> : <UserPlus size={18} />}
        {profile.relationship.isFollowing ? "已关注" : "关注"}
      </button>
    </form>
  );
}

function ProfileTabs({ activeTab, targetId }: { activeTab: ProfilePostTab; targetId: string }) {
  const tabs: Array<{ key: ProfilePostTab; label: string }> = [
    { key: "posts", label: "帖子" },
    { key: "likes", label: "点赞" },
    { key: "reposts", label: "转帖" }
  ];
  return (
    <nav className="grid border-b border-slate-100 md:grid-cols-3" aria-label="主页帖子分类">
      {tabs.map((tab) => (
        <a
          key={tab.key}
          aria-current={activeTab === tab.key ? "page" : undefined}
          className={cn(
            "relative grid min-h-14 place-items-center text-sm font-black transition",
            activeTab === tab.key ? "text-ink" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
          )}
          href={`/students/${targetId}?homeTab=${tab.key}`}
        >
          {tab.label}
          {activeTab === tab.key ? <span className="absolute bottom-0 h-1 w-14 rounded-full bg-sky-500" /> : null}
        </a>
      ))}
    </nav>
  );
}

function ProfilePostCard({ post }: { post: ProfilePost }) {
  return (
    <article className="p-5">
      <div className="flex items-start gap-3">
        <ProfileAvatar user={post.author} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a className="font-black text-ink hover:text-teal" href={`/students/${post.author.id}`}>{post.author.nickname}</a>
            <span className="font-semibold text-slate-400">@{post.author.username}</span>
            <span className="font-semibold text-slate-400">· {formatDateTime(post.createdAt)}</span>
          </div>
          {post.type === "original" ? (
            <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p>
          ) : (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {post.sourceState === "visible" && post.originalPost ? (
                <>
                  <p className="text-xs font-bold text-slate-400">转帖自 {post.originalPost.author.nickname}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-600">{post.originalPost.content}</p>
                </>
              ) : (
                <p className="text-sm font-bold text-slate-400">原内容已删除</p>
              )}
            </div>
          )}
          <div className="mt-4 flex gap-5 text-xs font-bold text-slate-400">
            <span className="inline-flex items-center gap-1"><Heart size={15} />{post.likeCount}</span>
            {post.type === "original" ? <span className="inline-flex items-center gap-1"><Repeat2 size={15} />可转帖</span> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ProfileAvatar({
  size,
  user
}: {
  size: "lg" | "sm";
  user: { avatarImage?: string; nickname: string };
}) {
  const sizeClass = size === "lg" ? "size-28 text-5xl" : "size-12 text-lg";
  if (user.avatarImage) {
    return <img alt={`${user.nickname} 的头像`} className={cn("shrink-0 rounded-full object-cover shadow-sm", sizeClass)} src={user.avatarImage} />;
  }
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-[#58cc02] font-black text-white shadow-sm", sizeClass)}>
      {user.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}

function StatValue({ label, value }: { label: string; value: number }) {
  return (
    <span className="font-semibold text-slate-500">
      <strong className="mr-1 text-base text-ink">{value}</strong>{label}
    </span>
  );
}

function getProfilePostTab(tab?: string): ProfilePostTab {
  return tab === "likes" || tab === "reposts" ? tab : "posts";
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  });
}

async function followFromProfile(formData: FormData) {
  "use server";
  const user = await requireUser();
  const targetId = String(formData.get("targetId") || "");
  try {
    await followUser(user.id, targetId);
  } catch (error) {
    redirectWithError(targetId, error);
  }
  revalidatePath(`/students/${targetId}`);
  revalidatePath("/buddy-circle");
  redirect(`/students/${targetId}`);
}

async function unfollowFromProfile(formData: FormData) {
  "use server";
  const user = await requireUser();
  const targetId = String(formData.get("targetId") || "");
  try {
    await unfollowUser(user.id, targetId);
  } catch (error) {
    redirectWithError(targetId, error);
  }
  revalidatePath(`/students/${targetId}`);
  revalidatePath("/buddy-circle");
  redirect(`/students/${targetId}`);
}

function redirectWithError(targetId: string, error: unknown): never {
  const buddyError = formatBuddyError(error);
  redirect(`/students/${targetId}?error=${buddyError?.code || "UNKNOWN"}`);
}
