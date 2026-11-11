import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PastExamList } from "@/app/mock-tests/special/past-exam-list";
import { StudentPageShell } from "@/components/student-page-shell";
import { requireUser } from "@/lib/auth";
import { henanEnglishPastExamScope } from "@/lib/henan-english-past-exams";
import { prisma } from "@/lib/prisma";

export default async function EnglishPastExamsPage() {
  const user = await requireUser();
  const papers = await prisma.examPaper.findMany({
    where: henanEnglishPastExamScope(user.id),
    orderBy: [{ year: { sort: "desc", nulls: "last" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      diamondPrice: true,
      purchases: { where: { userId: user.id }, select: { id: true }, take: 1 },
      questions: {
        where: { question: { status: "published" } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { questionId: true }
      }
    }
  });

  return (
    <StudentPageShell active="course-center" maxWidthClassName="max-w-[1440px]">
      <Link href="/course-center" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25">
        <ArrowLeft size={22} />返回课程中心
      </Link>
      <div className="mt-7 overflow-x-auto">
        <div className="min-w-[875px]">
          <PastExamList
            userId={user.id}
            courseKey="public_subject"
            henanEnglish
            papers={papers.map((paper) => ({
              id: paper.id,
              title: paper.title,
              diamondPrice: paper.diamondPrice,
              purchased: paper.purchases.length > 0,
              questionIds: paper.questions.map(({ questionId }) => questionId)
            }))}
          />
        </div>
      </div>
    </StudentPageShell>
  );
}
