import { ArrowLeft, MessageCircle, UserCheck, UserPlus } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SocialMedalBadge } from "@/components/social-medal-badge";
import { SocialAvatar, SocialPostCard, type SocialPostNode } from "@/components/social-post-card";
import { SocialPostActions } from "@/components/social-post-actions";
import { StudentPageShell } from "@/components/student-page-shell";
import { EmptyState, SurfaceCard } from "@/components/student-ui";
import { listProfileBuddyPosts } from "@/lib/buddy-posts";
import { formatBuddyError } from "@/lib/buddies";
import { requireUser } from "@/lib/auth";
import { followUser, getSocialProfile, unfollowUser } from "@/lib/social";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  searchParams?: Promise<{ error?: string }>;
}) {
  const currentUser = await requireUser();
  if (currentUser.role !== "student") {
    redirect("/admin");
  }
  const { userId } = await params;
  const query = await searchParams;
  const [profile, posts] = await Promise.all([
    getSocialProfile(currentUser.id, userId),
    listProfileBuddyPosts(currentUser.id, userId, { tab: "posts", limit: 30 })
  ]);

  return (
    <StudentPageShell active="buddy-circle" maxWidthClassName="max-w-5xl">
      <div className="space-y-5">
        <a className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-teal" href="/buddy-circle">
          <ArrowLeft size={17} />
          返回搭子圈
        </a>

        {query?.error ? (
          <p className="rounded-card bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
            {errorText[query.error] || errorText.UNKNOWN}
          </p>
        ) : null}

        <ProfileHero profile={profile} />

        <SurfaceCard className="overflow-hidden p-0">
          <div className="border-b border-border-soft/80 px-5 py-4">
            <h2 className="text-base font-semibold text-ink">帖子</h2>
          </div>
          {posts.items.length === 0 ? (
            <EmptyState description="这里暂时还没有内容。" icon={<MessageCircle size={22} />} title="还没有公开帖子" />
          ) : (
            <div className="divide-y divide-border-soft/80">
              {posts.items.map((post) => (
                <SocialPostCard
                  key={post.id}
                  embedded
                  getDateLabel={formatDateTime}
                  id={`post-${post.id}`}
                  post={post as SocialPostNode}
                  renderActions={renderPostActions}
                />
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>
    </StudentPageShell>
  );
}

function ProfileHero({ profile }: { profile: SocialProfile }) {
  const profileMeta = [profile.user.province, profile.user.studySystem, profile.user.majorName].filter(Boolean).join(" - ");

  return (
    <SurfaceCard className="overflow-hidden p-0">
      <div
        className="h-44 bg-surface-muted bg-cover bg-center md:h-60"
        style={profile.user.coverImage ? { backgroundImage: `url(${profile.user.coverImage})` } : undefined}
      />
      <div className="px-5 pb-6 md:px-6">
        <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
          <SocialAvatar className="size-28 text-5xl ring-4 ring-white" size="lg" user={profile.user} />
          <ProfileAction profile={profile} />
        </div>

        <div className="mt-4">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-3xl font-bold leading-tight text-ink md:text-[32px]">{profile.user.nickname}</h1>
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
    </SurfaceCard>
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

function renderPostActions(post: SocialPostNode) {
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

function getPostRepostSource(post: SocialPostNode) {
  return post.canRepost
    ? {
        authorName: post.author.nickname,
        content: post.content || post.originalPost?.content || "",
        createdAtLabel: formatDateTime(post.createdAt),
        username: post.author.username
      }
    : undefined;
}

function StatValue({ label, value }: { label: string; value: number }) {
  return (
    <span className="font-semibold text-slate-500">
      <strong className="mr-1 text-base text-ink">{value}</strong>{label}
    </span>
  );
}

function formatDateTime(date: Date | string) {
  return new Date(date).toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  });
}

function formatJoinedMonth(date: Date | string) {
  return new Date(date).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Shanghai"
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
