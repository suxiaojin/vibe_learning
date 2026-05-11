import { CalendarCheck, Clock3, Target } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatSeconds } from "@/lib/utils";

export default async function MePage() {
  const user = await requireUser();
  const [stats, progress, wrongCount] = await Promise.all([
    prisma.studyStat.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 30 }),
    prisma.userProgress.findMany({ where: { userId: user.id } }),
    prisma.wrongQuestion.count({ where: { userId: user.id, status: "active" } })
  ]);

  const totalSeconds = stats.reduce((sum, stat) => sum + stat.studySeconds, 0);
  const passed = progress.filter((item) => item.status === "passed").length;
  const streak = computeStreak(stats.map((item) => item.date));

  const cards = [
    { label: "连续学习", value: `${streak} 天`, icon: CalendarCheck },
    { label: "累计学习", value: formatSeconds(totalSeconds), icon: Clock3 },
    { label: "已通过", value: `${passed} 关`, icon: Target }
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className="panel">
        <p className="text-sm font-semibold text-teal">我的</p>
        <h1 className="mt-1 text-3xl font-bold">{user.username}</h1>
        <p className="mt-2 text-slate-600">保持一点点推进，比临时冲刺更稳。</p>
      </section>
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="panel">
              <Icon className="text-teal" size={24} />
              <p className="mt-5 text-2xl font-bold">{card.value}</p>
              <p className="text-sm text-slate-600">{card.label}</p>
            </div>
          );
        })}
      </section>
      <section className="panel mt-6">
        <h2 className="text-xl font-bold">学习记录</h2>
        <p className="mt-2 text-sm text-slate-600">当前待掌握错题 {wrongCount} 道。</p>
        <div className="mt-4 divide-y divide-slate-100">
          {stats.map((stat) => (
            <div key={stat.id} className="flex items-center justify-between py-3 text-sm">
              <span>{stat.date.toISOString().slice(0, 10)}</span>
              <span className="text-slate-600">{stat.questionsAnswered} 题 · {formatSeconds(stat.studySeconds)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
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
