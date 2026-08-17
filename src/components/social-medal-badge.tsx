import Image from "next/image";
import { Crown, Medal, Trophy } from "lucide-react";
import type { MedalLevel } from "@/lib/rewards";
import { cn } from "@/lib/utils";

const medalIcons: Record<MedalLevel, typeof Medal> = {
  novice: Medal,
  expert: Trophy,
  scholar: Crown
};

const medalColorClasses: Record<MedalLevel, string> = {
  novice: "bg-[#B87333] text-white ring-[#F0D0B4]",
  expert: "bg-[#94A3B8] text-white ring-[#E2E8F0]",
  scholar: "bg-[#D4A017] text-white ring-[#FDE68A]"
};

export function SocialMedalBadge({
  className,
  label,
  level
}: {
  className?: string;
  gender?: "male" | "female" | null;
  label: string;
  level: MedalLevel;
}) {
  const Icon = medalIcons[level];

  if (level === "expert") {
    return (
      <span
        aria-label={`${label}勋章`}
        className={cn("grid size-5 shrink-0 place-items-center", className)}
        title={`${label}勋章`}
      >
        <Image
          alt=""
          aria-hidden="true"
          className="size-full object-contain"
          height={20}
          src="/assets/medals/expert-silver-trophy.png"
          width={20}
        />
      </span>
    );
  }

  return (
    <span
      aria-label={`${label}勋章`}
      className={cn("grid size-5 shrink-0 place-items-center rounded-full ring-2 shadow-sm", medalColorClasses[level], className)}
      title={`${label}勋章`}
    >
      <Icon aria-hidden="true" size={12} strokeWidth={2.5} />
    </span>
  );
}
