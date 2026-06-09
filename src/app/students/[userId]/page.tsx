import { ArrowLeft, UserCheck, UserPlus } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SocialPostActions } from "@/components/social-post-actions";
import { StudentSidebar } from "@/components/student-sidebar";
import { listProfileBuddyPosts } from "@/lib/buddy-posts";
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
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-black text-ink">帖子</h2>
            </div>
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
  const profileMeta = [profile.user.province, profile.user.studySystem, profile.user.majorName].filter(Boolean).join(" - ");

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
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-slate-500">
            <span>{formatJoinedMonth(profile.user.joinedAt)} 加入</span>
            <span>{profileMeta || "省份 - 学制 - 专业未填写"}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-5 text-sm">
            <StatValue label="粉丝" value={profile.stats.followerCount} />
            <StatValue label="获赞" value={profile.stats.likedCount} />
            <StatValue label="关注" value={profile.stats.followingCount} />
            <StatValue label="帖子" value={profile.stats.postCount} />
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
            <div className="mt-3 space-y-3">
              {post.content ? <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p> : null}
              <ProfileRepostSourceCard originalPost={post.originalPost} sourceState={post.sourceState} />
            </div>
          )}
          <div className="mt-4">
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
          </div>
        </div>
      </div>
    </article>
  );
}

function ProfileRepostSourceCard({
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
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-bold text-slate-400">原内容已删除</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-slate-50 p-4", depth > 0 ? "bg-white/70" : "")}>
      <div className="flex items-start gap-3">
        <a href={`/students/${originalPost.author.id}`}>
          <ProfileAvatar user={originalPost.author} size="sm" />
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a className="font-black text-ink hover:text-teal" href={`/students/${originalPost.author.id}`}>{originalPost.author.nickname}</a>
            <span className="text-xs font-semibold text-slate-400">
              {[originalPost.author.province, originalPost.author.studySystem, originalPost.author.majorName].filter(Boolean).join(" · ") || "公开帖子"} · {formatDateTime(originalPost.createdAt)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-600">{originalPost.content}</p>
          {originalPost.type === "repost" ? (
            <div className="mt-3 border-l-2 border-slate-200 pl-3">
              <ProfileRepostSourceCard depth={depth + 1} originalPost={originalPost.originalPost} sourceState={originalPost.sourceState} />
            </div>
          ) : null}
          <div className="mt-3">
            <SocialPostActions
              canLike={originalPost.canLike}
              canRepost={originalPost.canRepost}
              initialLikeCount={originalPost.likeCount}
              initialLiked={originalPost.likedByMe}
              initialRepostCount={originalPost.repostCount}
              initialReposted={originalPost.repostedByMe}
              postId={originalPost.id}
              repostSource={getPostRepostSource(originalPost)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function getPostRepostSource(post: {
  author: { nickname: string; username: string };
  canRepost: boolean;
  content: string;
  createdAt: Date;
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

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  });
}

function formatJoinedMonth(date: Date) {
  return date.toLocaleDateString("zh-CN", {
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
