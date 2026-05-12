import { redirect } from "next/navigation";
import { QuizRunner } from "@/components/quiz-runner";
import { requireUser } from "@/lib/auth";
import { canAccessKnowledgePoint } from "@/lib/learning";
import { prisma } from "@/lib/prisma";

export default async function PointPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const canAccess = await canAccessKnowledgePoint(user.id, id);
  if (!canAccess) {
    redirect("/learn");
  }

  const point = await prisma.knowledgePoint.findUnique({
    where: { id: id },
    include: {
      chapter: true,
      questions: {
        where: { status: "published" },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, stem: true, options: true, answer: true, source: true }
      }
    }
  });

  if (!point) {
    redirect("/learn");
  }

  return (
    <main className="h-dvh overflow-hidden bg-white">
      <QuizRunner pointId={point.id} questions={point.questions} />
    </main>
  );
}
