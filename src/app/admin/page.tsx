import Link from "next/link";
import { BookMarked, FileQuestion, Layers3, UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  await requireAdmin();
  const [chapters, points, questions, users] = await Promise.all([
    prisma.chapter.count(),
    prisma.knowledgePoint.count(),
    prisma.question.count(),
    prisma.user.count({ where: { role: "student" } })
  ]);

  const cards = [
    { label: "章节", value: chapters, href: "/admin/chapters", icon: Layers3 },
    { label: "知识点", value: points, href: "/admin/knowledge-points", icon: BookMarked },
    { label: "题目", value: questions, href: "/admin/questions", icon: FileQuestion },
    { label: "学生", value: users, href: "/admin", icon: UsersRound }
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal">内容审核后台</p>
          <h1 className="mt-1 text-3xl font-bold text-ink">江苏专转本计算机</h1>
        </div>
        <div className="flex gap-2">
          <Link className="secondary-button" href="/admin/chapters">章节</Link>
          <Link className="secondary-button" href="/admin/knowledge-points">知识点</Link>
          <Link className="primary-button" href="/admin/questions">题目</Link>
        </div>
      </div>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="panel transition hover:-translate-y-0.5 hover:border-teal">
              <Icon className="text-teal" size={24} />
              <p className="mt-5 text-3xl font-bold">{card.value}</p>
              <p className="text-sm text-slate-600">{card.label}</p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
