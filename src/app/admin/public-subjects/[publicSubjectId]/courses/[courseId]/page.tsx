import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminSyllabusTree } from "@/components/admin-syllabus-tree";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PublicSubjectCourseDetailPage({
  params
}: {
  params: Promise<{ publicSubjectId: string; courseId: string }>;
}) {
  await requireAdmin();
  const { publicSubjectId, courseId } = await params;
  const course = await prisma.learningCourse.findFirstOrThrow({
    where: {
      id: courseId,
      publicSubjectId,
      courseType: "public_subject"
    },
    include: {
      region: true,
      publicSubject: true,
      syllabusItems: {
        where: { checkpointScope: null },
        include: {
          knowledgePoints: {
            include: {
              _count: { select: { questions: true } }
            },
            orderBy: { sortOrder: "asc" }
          },
          _count: {
            select: {
              children: true,
              knowledgePoints: true,
              questions: true
            }
          }
        },
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }]
      },
      chapters: {
        orderBy: { sortOrder: "asc" }
      }
    }
  });

  return (
    <main>
      <div className="mb-7">
        <Link className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#0869a9]" href={`/admin/public-subjects/${publicSubjectId}/courses`}>
          <ArrowLeft size={16} />
          返回课程列表
        </Link>
        <h1 className="text-2xl font-black tracking-normal">{course.name}</h1>
        <p className="mt-2 text-sm text-slate-500">{course.region.name} / {course.publicSubject?.name || "公共课"} / 大纲体系管理</p>
      </div>

      <AdminSyllabusTree ownerType="public_subject" ownerId={publicSubjectId} courseId={course.id} items={course.syllabusItems} />
    </main>
  );
}
