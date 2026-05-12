import Link from "next/link";
import { CalendarDays, Flame, Gem, Target, Trophy, UserRound, Zap } from "lucide-react";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export default async function MePage() {
  const user = await requireUser();
  const [stats, progress, wrongCount, attempts] = await Promise.all([
    prisma.studyStat.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 30 }),
    prisma.userProgress.findMany({ where: { userId: user.id } }),
    prisma.wrongQuestion.count({ where: { userId: user.id, status: "active" } }),
    prisma.questionAttempt.count({ where: { userId: user.id } })
  ]);

  const passed = progress.filter((item) => item.status === "passed").length;
  const streak = computeStreak(stats.map((item) => item.date));
  const totalQuestions = stats.reduce((sum, stat) => sum + stat.questionsAnswered, 0);
  const totalXp = totalQuestions * 10;
  const joinedAt = user.createdAt.toLocaleDateString("zh-CN", { year: "numeric", month: "long", timeZone: "Asia/Shanghai" });

  const achievements = [
    {
      title: "烈焰英雄",
      description: "保持 3 天连胜的战绩",
      icon: Flame,
      color: "bg-coral",
      current: Math.min(streak, 3),
      target: 3
    },
    {
      title: "先贤",
      description: "赚取 100 经验",
      icon: Gem,
      color: "bg-[#58cc02]",
      current: Math.min(totalXp, 100),
      target: 100
    },
    {
      title: "神射手",
      description: "完成 5 个知识点",
      icon: Target,
      color: "bg-[#58cc02]",
      current: Math.min(passed, 5),
      target: 5
    }
  ];

  return (
    <main className="min-h-dvh bg-white lg:grid lg:grid-cols-[240px_minmax(0,1fr)_340px]">
      <StudentSidebar active="me" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <section className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-8">
          <div>
            <h1 className="text-3xl font-black text-ink">{user.username}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-400">vibe_{user.id.slice(0, 8)}</p>
            <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-500">
              <CalendarDays size={18} />
              {joinedAt} 加入
            </p>
            <p className="mt-4 text-2xl">🇨🇳</p>
          </div>
          <div className="relative">
            <div className="grid size-32 place-items-center rounded-full bg-[#58cc02] text-6xl font-black text-white">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            <span className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-sky-400 text-white">
              <UserRound size={18} />
            </span>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-black text-ink">数据统计</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StatCard icon={<Flame className="text-orange-500" size={28} />} value={`${streak}`} label="连胜天数" />
            <StatCard icon={<Zap className="text-honey" size={28} />} value={`${totalXp}`} label="总经验" />
            <StatCard icon={<Trophy className="text-[#58cc02]" size={28} />} value={`${passed}`} label="已通过关卡" />
            <StatCard icon={<Target className="text-coral" size={28} />} value={`${wrongCount}`} label="待掌握错题" />
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-ink">成就</h2>
            <span className="text-sm font-black text-sky-500">显示全部</span>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {achievements.map((achievement, index) => {
              const Icon = achievement.icon;
              const percent = Math.round((achievement.current / achievement.target) * 100);
              return (
                <div key={achievement.title} className={cn("flex gap-5 p-5", index > 0 && "border-t border-slate-200")}>
                  <div className={`grid size-24 shrink-0 place-items-center rounded-2xl text-white ${achievement.color}`}>
                    <Icon size={38} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-black text-ink">{achievement.title}</h3>
                        <p className="mt-2 text-sm font-semibold text-slate-500">{achievement.description}</p>
                      </div>
                      <span className="text-sm font-bold text-slate-400">{achievement.current}/{achievement.target}</span>
                    </div>
                    <div className="mt-4 h-3 rounded-full bg-slate-200">
                      <div className="h-3 rounded-full bg-honey" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </section>

      <aside className="hidden border-l border-slate-100 bg-white px-5 py-8 xl:block">
        <div className="sticky top-8 space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm font-black shadow-sm">
            <span className="flex items-center gap-2"><Flame className="text-orange-500" size={22} />{streak}</span>
            <span className="flex items-center gap-2"><Gem className="text-sky-500" size={22} />{totalXp}</span>
            <span className="flex items-center gap-2"><Target className="text-coral" size={22} />{wrongCount}</span>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">学习概况</h2>
            <div className="mt-4 space-y-3 text-sm font-semibold text-slate-600">
              <p>累计答题：{attempts} 道</p>
              <p>已通过：{passed} 关</p>
              <p>待复习：{wrongCount} 道</p>
            </div>
            <Link className="primary-button mt-5 w-full bg-[#58cc02] hover:bg-[#58cc02]/90" href="/learn">继续学习</Link>
          </section>
        </div>
      </aside>
    </main>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex min-h-20 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      {icon}
      <div>
        <p className="text-xl font-black text-ink">{value}</p>
        <p className="text-sm font-semibold text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function computeStreak(dates: Date[]) {
  const set = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;

  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
