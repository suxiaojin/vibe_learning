import { redirect } from "next/navigation";
import { QuizRunner } from "@/components/quiz-runner";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSyllabusSectionForStudent, getSyllabusSectionQuestionsForStudent } from "@/lib/syllabus-learning";

export default async function SectionQuizPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ restart?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const [access, questionResult] = await Promise.all([
    getSyllabusSectionForStudent(user.id, id),
    getSyllabusSectionQuestionsForStudent(user.id, id)
  ]);

  if (!access || access.locked) {
    redirect("/learn");
  }

  const questions = questionResult?.questions || [];
  const shouldRestart = query?.restart === "1";
  let session = shouldRestart
    ? await prisma.quizSession.create({
        data: {
          userId: user.id,
          syllabusItemId: id
        }
      })
    : await prisma.quizSession.findFirst({
        where: {
          userId: user.id,
          syllabusItemId: id,
          status: "in_progress"
        },
        orderBy: { updatedAt: "desc" }
      });

  if (!session && !shouldRestart) {
    const latestCompleted = await prisma.quizSession.findFirst({
      where: {
        userId: user.id,
        syllabusItemId: id,
        status: "completed"
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }]
    });

    if (latestCompleted) {
      redirect(`/learn/${id}/result?sessionId=${latestCompleted.id}`);
    }
  }

  if (!session) {
    session = await prisma.quizSession.create({
      data: {
        userId: user.id,
        syllabusItemId: id
      }
    });
  }

  const attempts = await prisma.questionAttempt.findMany({
    where: {
      sessionId: session.id,
      userId: user.id
    },
    select: {
      id: true,
      questionId: true,
      isCorrect: true
    }
  });
  const recordedByQuestionId = new Map(attempts.map((attempt) => [attempt.questionId, attempt]));
  const firstUnansweredIndex = questions.findIndex((question) => !recordedByQuestionId.has(question.id));

  if (questions.length > 0 && firstUnansweredIndex === -1) {
    const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
    const score = Math.round((correctCount / questions.length) * 100);
    const completedSession = await prisma.quizSession.update({
      where: { id: session.id },
      data: {
        status: "completed",
        completedAt: session.completedAt || new Date(),
        currentIndex: questions.length,
        score,
        correctCount,
        totalCount: questions.length
      }
    });
    redirect(`/learn/${id}/result?sessionId=${completedSession.id}`);
  }

  const initialIndex = Math.max(0, firstUnansweredIndex);
  const initialRecordedAttempts = Object.fromEntries(attempts.map((attempt) => [attempt.questionId, attempt.id]));
  const initialCorrectCount = attempts.filter((attempt) => attempt.isCorrect).length;

  return (
    <main className="h-dvh overflow-hidden bg-white">
      <QuizRunner
        initialCorrectCount={initialCorrectCount}
        initialIndex={initialIndex}
        initialRecordedAttempts={initialRecordedAttempts}
        initialTotal={access.section.questionCount}
        sectionId={access.section.id}
        sessionId={session.id}
      />
    </main>
  );
}
