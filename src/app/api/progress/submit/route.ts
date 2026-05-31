import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { answersEqual, bumpStudyStat } from "@/lib/learning";
import { recordSyllabusSectionProgress, getSyllabusSectionQuestionsForStudent } from "@/lib/syllabus-learning";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as { sectionId?: string; answers?: Record<string, string[]> } | null;
  if (!body?.sectionId || !body.answers) {
    return apiError("Invalid payload", 400, "INVALID_PROGRESS_SUBMISSION");
  }

  const result = await getSyllabusSectionQuestionsForStudent(user.id, body.sectionId, true);
  if (!result) {
    return apiError("Syllabus section is locked or unavailable", 403, "SYLLABUS_SECTION_LOCKED");
  }

  const submittedAt = new Date();
  let correct = 0;
  const wrongAttemptIds: string[] = [];
  const questions = result.questions as Array<(typeof result.questions)[number] & { answer: unknown }>;

  for (const question of questions) {
    const selected = body.answers[question.id] || [];
    const isCorrect = answersEqual(selected, question.answer);
    if (isCorrect) {
      correct += 1;
    }

    const attempt = await prisma.questionAttempt.create({
      data: {
        userId: user.id,
        questionId: question.id,
        selectedAnswer: selected,
        isCorrect
      }
    });

    if (!isCorrect) {
      wrongAttemptIds.push(attempt.id);
      await prisma.wrongQuestion.upsert({
        where: { userId_questionId: { userId: user.id, questionId: question.id } },
        update: { wrongCount: { increment: 1 }, lastWrongAt: new Date(), status: "active" },
        create: { userId: user.id, questionId: question.id, status: "active" }
      });
    }
  }

  const total = questions.length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  const passed = score >= 80;

  const newlyPassed = await recordSyllabusSectionProgress(user.id, body.sectionId, score, passed);
  await bumpStudyStat(user.id, {
    questionsAnswered: total,
    pointsPassed: newlyPassed ? 1 : 0,
    studySeconds: 60
  });

  const resultPath = `/learn/${body.sectionId}/result?attemptIds=${wrongAttemptIds.join(",")}&score=${score}&correct=${correct}&total=${total}&submittedAt=${encodeURIComponent(submittedAt.toISOString())}`;
  return apiOk({ score, passed, correct, total, wrongAttemptIds, resultPath });
}
