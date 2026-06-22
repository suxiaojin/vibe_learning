import { CourseKnowledgeMap } from "@/components/course-knowledge-map";
import { StudentSidebar } from "@/components/student-sidebar";
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
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="course-center" />

      <section className="min-w-0 px-5 py-8 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-[1280px]">
          <CourseKnowledgeMap selectedGroup={pathState.selectedGroup} />
        </div>
      </section>
    </main>
  );
}
