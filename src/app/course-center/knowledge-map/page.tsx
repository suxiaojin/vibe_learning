import { CourseKnowledgeMap } from "@/components/course-knowledge-map";
import { StudentPageShell } from "@/components/student-page-shell";
import { requireUser } from "@/lib/auth";
import { getStudentLearningPath } from "@/lib/syllabus-learning";

export default async function CourseKnowledgeMapPage({
  searchParams
}: {
  searchParams?: Promise<{ course?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const pathState = await getStudentLearningPath(user.id, params?.course);

  return (
    <StudentPageShell active="course-center" maxWidthClassName="max-w-[1280px]">
      <CourseKnowledgeMap selectedGroup={pathState.selectedGroup} />
    </StudentPageShell>
  );
}
