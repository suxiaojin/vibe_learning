import { SocialMedalBadge } from "@/components/social-medal-badge";
import type { MedalLevel } from "@/lib/rewards";
import { cn } from "@/lib/utils";

type SocialPostAuthor = {
  id: string;
  username: string;
  nickname: string;
  gender?: "male" | "female" | null;
  province?: string | null;
  studySystem?: string | null;
  majorName?: string | null;
  medalLevel: MedalLevel;
  medalLabel: string;
};

export function SocialPostAuthorHeader({
  author,
  className,
  dateLabel
}: {
  author: SocialPostAuthor;
  className?: string;
  dateLabel: string;
}) {
  const profileLabel = [author.province, author.studySystem, author.majorName].filter(Boolean).join(" · ") || "资料未完善";

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        <SocialMedalBadge gender={author.gender} label={author.medalLabel} level={author.medalLevel} />
        <a className="font-black text-ink hover:text-teal" href={`/students/${author.id}`}>
          {author.nickname}
        </a>
        <span className="font-semibold text-slate-400">@{author.username}</span>
      </div>
      <p className="mt-0.5 text-xs font-semibold text-slate-400">
        {profileLabel} · {dateLabel}
      </p>
    </div>
  );
}
