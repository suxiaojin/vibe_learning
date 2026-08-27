import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminSyllabusTree } from "@/components/admin-syllabus-tree";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function MajorCourseDetailPage({
  params
}: {
  params: Promise<{ majorId: string; courseId: string }>;
}) {
  await requireAdmin();
  const { majorId, courseId } = await params;
  const course = await prisma.learningCourse.findFirstOrThrow({
    where: {
      id: courseId,
      majorId,
      courseType: "major"
    },
    include: {
      region: true,
      major: true,
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
        <Link className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#0869a9]" href={`/admin/majors/${majorId}/courses`}>
          <ArrowLeft size={16} />
          返回课程列表
        </Link>
        <h1 className="text-2xl font-black tracking-normal">{course.name}</h1>
        <p className="mt-2 text-sm text-slate-500">{course.region.name} / {course.major?.name || "专业课"} / 大纲体系管理</p>
      </div>

      <AdminSyllabusTree ownerType="major" ownerId={majorId} courseId={course.id} items={course.syllabusItems} />
    </main>
  );
}
