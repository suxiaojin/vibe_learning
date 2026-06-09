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
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-600">Active Learning</p>
          <h4 className={cn("mt-1 font-black text-ink", compact ? "text-lg" : "text-2xl")}>我的学习活跃度</h4>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">本月 {card.monthAttemptCount} 题</span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <Metric label="累计刷题" value={`${card.totalAttempts} 道`} />
        <Metric label="活跃天数" value={`${card.activeDays} 天`} />
        <Metric label={card.nextLabel ? `距离${card.nextLabel}` : "勋章进度"} value={card.nextLabel ? `${card.remaining} 道` : "最高勋章"} />
      </div>
      <div className="overflow-x-auto px-4 pb-4">
        <div className="flex min-w-max gap-1">
          {card.weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-rows-7 gap-1">
              {week.map((day, dayIndex) => (
                <span
                  key={`${day.key}-${weekIndex}-${dayIndex}`}
                  className={cn(
                    "block size-3 rounded-[3px] border",
                    day.future ? "border-transparent bg-transparent" : heatmapLevelClasses[day.level] || heatmapLevelClasses[0]
                  )}
                  title={day.key ? `${day.key}：${day.count} 道` : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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
