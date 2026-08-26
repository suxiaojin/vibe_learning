import { redirect } from "next/navigation";
import { QuizRunner } from "@/components/quiz-runner";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isQuestionBankAutoGradedQuestionType } from "@/lib/question-bank-types";
import {
  getNextChapterChallengeVersion,
  getSyllabusSectionForStudent,
  getSyllabusSectionQuestionsForStudent,
  recordSyllabusSectionProgress
} from "@/lib/syllabus-learning";

export default async function SectionQuizPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ fromSessionId?: string; restart?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const access = await getSyllabusSectionForStudent(user.id, id);

  if (!access || access.locked || !access.section.challengeVersionId) {
    redirect("/learn");
  }

  const shouldRestart = query?.restart === "1";
  if (shouldRestart) {
    const sourceSession = query?.fromSessionId
      ? await prisma.quizSession.findFirst({
          where: {
            id: query.fromSessionId,
            userId: user.id,
            syllabusItemId: id,
            status: "completed",
            chapterChallengeVersionId: { not: null }
          },
          select: { chapterChallengeVersionId: true }
        })
      : null;
    const nextChallenge = sourceSession?.chapterChallengeVersionId
      ? await getNextChapterChallengeVersion(id, sourceSession.chapterChallengeVersionId)
      : null;

    await prisma.quizSession.create({
      data: {
        userId: user.id,
        syllabusItemId: id,
        chapterChallengeVersionId: nextChallenge?.id || access.section.challengeVersionId
      }
    });
    redirect(`/learn/${id}`);
  }

  let session = await prisma.quizSession.findFirst({
    where: {
      userId: user.id,
      syllabusItemId: id,
      chapterChallengeVersionId: { not: null },
      status: "in_progress"
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!session) {
    const latestCompleted = await prisma.quizSession.findFirst({
      where: {
        userId: user.id,
        syllabusItemId: id,
        chapterChallengeVersionId: { not: null },
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
        syllabusItemId: id,
        chapterChallengeVersionId: access.section.challengeVersionId
      }
    });
  }

  const questionResult = await getSyllabusSectionQuestionsForStudent(user.id, id, false, session.id);
  const questions = questionResult?.questions || [];

  const attempts = await prisma.questionAttempt.findMany({
    where: {
      sessionId: session.id,
      userId: user.id
    },
    select: {
      id: true,
      questionId: true,
      isCorrect: true,
      gradingStatus: true
    }
  });
  const recordedByQuestionId = new Map(attempts.map((attempt) => [attempt.questionId, attempt]));
  const firstUnansweredIndex = questions.findIndex((question) => !recordedByQuestionId.has(question.id));

  if (questions.length > 0 && firstUnansweredIndex === -1) {
    const scoredAttempts = attempts.filter((attempt) => attempt.gradingStatus === "auto_graded");
    const scoredTotal = scoredAttempts.length;
    const correctCount = scoredAttempts.filter((attempt) => attempt.isCorrect).length;
    const score = scoredTotal > 0 ? Math.round((correctCount / scoredTotal) * 100) : null;
    const passed = scoredTotal === 0 || (score || 0) >= 80;
    await recordSyllabusSectionProgress(user.id, id, score, passed);
    const completedSession = await prisma.quizSession.update({
      where: { id: session.id },
      data: {
        status: "completed",
        completedAt: session.completedAt || new Date(),
        currentIndex: questions.length,
        score,
        correctCount,
        totalCount: scoredTotal
      }
    });
    redirect(`/learn/${id}/result?sessionId=${completedSession.id}`);
  }

  const initialIndex = Math.max(0, firstUnansweredIndex);
  const initialRecordedAttempts = Object.fromEntries(attempts.map((attempt) => [attempt.questionId, attempt.id]));
  const initialCorrectCount = attempts.filter((attempt) => attempt.gradingStatus === "auto_graded" && attempt.isCorrect).length;
  const initialScoredTotal = questions.filter((question) => isQuestionBankAutoGradedQuestionType(question.type)).length;

  return (
    <main className="h-dvh overflow-hidden bg-white">
      <QuizRunner
        initialCorrectCount={initialCorrectCount}
        initialIndex={initialIndex}
        initialRecordedAttempts={initialRecordedAttempts}
        initialScoredTotal={initialScoredTotal}
        initialTotal={questions.length}
        sectionId={access.section.id}
        sessionId={session.id}
      />
    </main>
  );
}
