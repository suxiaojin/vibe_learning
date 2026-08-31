import type { ReactNode } from "react";
import { CheckCircle2, Flame, Gem, Trophy, XCircle } from "lucide-react";
import type { BuddyShareCard } from "@/lib/buddy-share-cards";
import { cn } from "@/lib/utils";

const heatmapLevelClasses = [
  "border-slate-200 bg-slate-100",
  "border-emerald-100 bg-emerald-100",
  "border-emerald-200 bg-emerald-300",
  "border-emerald-500 bg-emerald-500",
  "border-emerald-700 bg-emerald-700"
];

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekdayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

export function BuddyShareCardView({ card, compact = false }: { card?: BuddyShareCard | null; compact?: boolean }) {
  if (!card) {
    return null;
  }

  if (card.type === "question_card") {
    return <QuestionShareCard card={card} compact={compact} />;
  }

  if (card.type === "quiz_result_card") {
    return <QuizResultShareCard card={card} compact={compact} />;
  }

  return <ActiveLearningShareCard card={card} compact={compact} />;
}

function QuestionShareCard({ card, compact }: { card: Extract<BuddyShareCard, { type: "question_card" }>; compact: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={cn("border-l-4 p-4", card.wasCorrect ? "border-[#58cc02] bg-[#58cc02]/10" : "border-coral bg-coral/10")}>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black", card.wasCorrect ? "bg-[#58cc02]/15 text-[#45a000]" : "bg-coral/15 text-coral")}>
            {card.wasCorrect ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {card.wasCorrect ? "已掌握" : "求助讨论"}
          </span>
        </div>
        <h4 className={cn("mt-3 font-black leading-relaxed text-ink", compact ? "text-base" : "text-lg")}>{card.title}</h4>
        {card.sourceTitle ? <p className="mt-2 truncate text-xs font-semibold text-slate-500">题库：{card.sourceTitle}</p> : null}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <AnswerBox label="我的答案" tone={card.wasCorrect ? "success" : "danger"} value={card.selectedAnswer} />
        <AnswerBox label="正确答案" tone="teal" value={card.correctAnswer} />
      </div>
    </div>
  );
}

function QuizResultShareCard({ card, compact }: { card: Extract<BuddyShareCard, { type: "quiz_result_card" }>; compact: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-white shadow-sm", card.passed ? "border-[#58cc02]" : "border-coral")}>
      <div className={cn("p-5 text-white", card.passed ? "bg-[#58cc02]" : "bg-coral")}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-white/80">{card.courseTitle} / {card.chapterTitle}</p>
            <h4 className={cn("mt-2 font-black", compact ? "text-2xl" : "text-3xl")}>{card.passed ? "闯关成功" : "闯关复盘"}</h4>
            <p className="mt-1 truncate text-sm font-semibold text-white/90">{card.sectionTitle}</p>
          </div>
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 border-white/20 bg-white/15">
            <Trophy size={30} />
          </span>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <Metric icon={<CheckCircle2 size={20} />} label="正确题数" value={`${card.correct}/${card.total}`} />
        <Metric icon={<Gem size={20} />} label="获得钻石" value={`+${card.diamondRewardAmount}`} />
        <Metric icon={<Flame size={20} />} label="本关得分" value={`${card.score} 分`} />
      </div>
      {card.submittedAtLabel ? <p className="border-t border-slate-100 px-4 py-3 text-xs font-semibold text-slate-400">完成时间：{card.submittedAtLabel}</p> : null}
    </div>
  );
}

function ActiveLearningShareCard({ card, compact }: { card: Extract<BuddyShareCard, { type: "active_learning_card" }>; compact: boolean }) {
  const metrics = [
    { label: "累计答题", value: `${card.totalAttempts} 道` },
    { label: "本月答题", value: `${card.monthAttemptCount} 道` },
    { label: "峰值答题数", value: formatOptionalMetric(card.peakDailyAttemptCount, "道") },
    { label: "当前连续天数", value: formatOptionalMetric(card.currentStreakDays, "天") },
    { label: "最长连续天数", value: formatOptionalMetric(card.longestStreakDays, "天") }
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-600">Active Learning</p>
          <h4 className={cn("mt-1 font-black text-ink", compact ? "text-lg" : "text-2xl")}>我的学习活跃度</h4>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-5">
        {metrics.map((item) => (
          <div key={item.label} className="min-w-0 bg-white px-2 py-3 text-center last:col-span-2 sm:px-3 sm:last:col-span-1">
            <p className="truncate text-base font-black tabular-nums text-ink" title={item.value}>{item.value}</p>
            <p className="mt-0.5 text-xs font-bold text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden px-4 pb-2 pt-4">
        <div className="sm:hidden">
          <ActiveLearningHeatmapGrid weeks={card.weeks.slice(-18)} compact />
        </div>
        <div className="hidden sm:block">
          <ActiveLearningHeatmapGrid weeks={card.weeks.slice(-40)} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 px-4 pb-4 text-[11px] font-bold text-slate-400">
        <span>Less</span>
        {heatmapLevelClasses.map((levelClass) => (
          <span key={levelClass} className={cn("size-3 rounded-[3px] border", levelClass)} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function ActiveLearningHeatmapGrid({
  compact = false,
  weeks
}: {
  compact?: boolean;
  weeks: Extract<BuddyShareCard, { type: "active_learning_card" }>["weeks"];
}) {
  return (
    <div className={cn("grid gap-y-1", compact ? "grid-cols-[1.5rem_auto] gap-x-1.5" : "grid-cols-[2rem_auto] gap-x-2")}>
      <span aria-hidden="true" />
      <div className={cn("flex font-bold text-slate-400", compact ? "h-3 gap-0.5 text-[9px]" : "h-3.5 gap-0.5 text-[9px]")}>
        {weeks.map((week, weekIndex) => (
          <span key={weekIndex} className={cn("relative block shrink-0", compact ? "size-2" : "size-2.5")}>
            {getMonthLabel(week, weekIndex) ? <span className="absolute left-0 top-0">{getMonthLabel(week, weekIndex)}</span> : null}
          </span>
        ))}
      </div>
      <div className={cn("grid grid-rows-7 gap-0.5 text-right text-[9px] font-bold text-slate-400", compact ? "leading-2" : "leading-[10px]")}>
        {weekdayLabels.map((label, index) => <span key={index}>{label}</span>)}
      </div>
      <div className="flex gap-0.5">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-rows-7 gap-0.5">
            {week.map((day, dayIndex) => (
              <span
                key={`${day.key}-${weekIndex}-${dayIndex}`}
                aria-label={day.key ? `${day.key} 答题 ${day.count} 道` : undefined}
                className={cn(
                  "block shrink-0 border",
                  compact ? "size-2 rounded-[2px]" : "size-2.5 rounded-[2px]",
                  day.future ? "border-transparent bg-transparent" : heatmapLevelClasses[day.level] || heatmapLevelClasses[0]
                )}
                title={day.key ? `${day.key}：${day.count} 道` : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatOptionalMetric(value: number | undefined, unit: string) {
  return value === undefined ? "—" : `${value} ${unit}`;
}

function getMonthLabel(
  week: Extract<BuddyShareCard, { type: "active_learning_card" }>["weeks"][number],
  weekIndex: number
) {
  const labeledDay = week.find((day) => day.key && new Date(`${day.key}T00:00:00Z`).getUTCDate() === 1)
    || (weekIndex === 0 ? week.find((day) => day.key) : undefined);

  if (!labeledDay?.key) {
    return "";
  }

  return monthLabels[new Date(`${labeledDay.key}T00:00:00Z`).getUTCMonth()] || "";
}

function AnswerBox({ label, tone, value }: { label: string; tone: "danger" | "success" | "teal"; value: string }) {
  const toneClass = {
    danger: "bg-coral/10 text-coral",
    success: "bg-[#58cc02]/10 text-[#45a000]",
    teal: "bg-teal/10 text-teal"
  }[tone];

  return (
    <div className={cn("rounded-2xl p-3", toneClass)}>
      <p className="text-xs font-semibold opacity-80">{label}</p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  );
}

function Metric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <p className="text-xs font-bold">{label}</p>
      </div>
      <p className="mt-1 text-base font-black text-ink">{value}</p>
    </div>
  );
}
