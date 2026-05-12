import { redirect } from "next/navigation";
import { QuizRunner } from "@/components/quiz-runner";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PointPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const point = await prisma.knowledgePoint.findUnique({
    where: { id: id },
    include: {
      chapter: true,
      questions: {
        where: { status: "published" },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, stem: true, options: true, answer: true, source: true }
      },
      progress: { where: { userId: user.id } }
    }
  });

  if (!point || point.status !== "published") {
    redirect("/learn");
  }
  const status = point.progress[0]?.status;
  if (status === "locked") {
    redirect("/learn");
  }

  return (
    <main className="h-dvh overflow-hidden bg-white">
      <QuizRunner pointId={point.id} questions={point.questions} />
    </main>
  );
}
