import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChallengeDifficultyStars({
  compact = false,
  value
}: {
  compact?: boolean;
  value: number | null;
}) {
  const normalizedValue = value != null && Number.isFinite(value) && value >= 0.5 && value <= 5
    ? Math.round(value * 2) / 2
    : null;
  const selectedHalfSteps = normalizedValue == null ? 0 : Math.round(normalizedValue * 2);
  const ratingText = normalizedValue == null
    ? "未设置"
    : `${Number.isInteger(normalizedValue) ? normalizedValue.toFixed(0) : normalizedValue.toFixed(1)} 星`;
  const size = compact ? 16 : 20;

  return (
    <span className={cn("inline-flex items-center", compact ? "gap-0.5" : "gap-1")} role="img" aria-label={ratingText}>
      {Array.from({ length: 5 }, (_, index) => {
        const filledHalfSteps = Math.max(0, Math.min(2, selectedHalfSteps - index * 2));
        return (
          <span className="relative block shrink-0" key={index} style={{ height: size, width: size }} aria-hidden="true">
            <Star className="absolute inset-0 text-slate-300" size={size} strokeWidth={1.8} />
            {filledHalfSteps > 0 ? (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${filledHalfSteps * 50}%` }}>
                <Star className="absolute inset-0 fill-amber-400 text-amber-500" size={size} strokeWidth={1.8} />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
