import { Crown, Medal, Trophy } from "lucide-react";
import type { MedalLevel } from "@/lib/rewards";
import { cn } from "@/lib/utils";

const medalIcons: Record<MedalLevel, typeof Medal> = {
  novice: Medal,
  expert: Trophy,
  scholar: Crown
};

export function SocialMedalBadge({
  className,
  gender,
  label,
  level
}: {
  className?: string;
  gender?: "male" | "female" | null;
  label: string;
  level: MedalLevel;
}) {
  const Icon = medalIcons[level];
  const colorClass = gender === "female"
    ? "bg-pink-500 text-white ring-pink-100"
    : "bg-sky-500 text-white ring-sky-100";

  return (
    <span
      aria-label={`${label}勋章`}
      className={cn("grid size-5 shrink-0 place-items-center rounded-full ring-2 shadow-sm", colorClass, className)}
      title={`${label}勋章`}
    >
      <Icon aria-hidden="true" size={12} strokeWidth={2.5} />
    </span>
  );
}
