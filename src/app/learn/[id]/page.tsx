import { redirect } from "next/navigation";
import { QuizRunner } from "@/components/quiz-runner";
import { requireUser } from "@/lib/auth";
import { getSyllabusSectionForStudent } from "@/lib/syllabus-learning";

export default async function SectionQuizPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const access = await getSyllabusSectionForStudent(user.id, id);

  if (!access || access.locked) {
    redirect("/learn");
  }

  return (
    <main className="h-dvh overflow-hidden bg-white">
      <QuizRunner sectionId={access.section.id} initialTotal={access.section.questionCount} />
    </main>
  );
}
