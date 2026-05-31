import { redirect } from "next/navigation";
import { QuizRunner } from "@/components/quiz-runner";
import { requireUser } from "@/lib/auth";
import { getSyllabusSectionQuestionsForStudent } from "@/lib/syllabus-learning";

export default async function SectionQuizPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const result = await getSyllabusSectionQuestionsForStudent(user.id, id, true);

  if (!result) {
    redirect("/learn");
  }

  return (
    <main className="h-dvh overflow-hidden bg-white">
      <QuizRunner sectionId={result.section.id} questions={result.questions} />
    </main>
  );
}
