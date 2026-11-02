import { getStudentFoundationProfile } from "@/lib/foundation";
import { prisma } from "@/lib/prisma";
import type { LearningOwnerType } from "@/lib/syllabus-learning";
import { pastExamScope } from "@/lib/past-exam-purchase";

// The student's region and chosen course are authoritative for both listing and access.
export async function getPastExams(userId: string, courseKey: LearningOwnerType, paperId?: string) {
  const profile = await getStudentFoundationProfile(userId);
  const ownerId = courseKey === "major" ? profile?.majorId : profile?.publicSubjectId;
  const ownerName = courseKey === "major" ? profile?.major?.name : profile?.publicSubject?.name;
  if (!profile?.regionId || !ownerId || !ownerName) return { ownerName: null, papers: [] };
  const papers = await prisma.examPaper.findMany({
    where: {
      ...await pastExamScope(userId, courseKey),
      ...(paperId ? { AND: [{ OR: [{ diamondPrice: 0 }, { purchases: { some: { userId } } }] }] } : {}),
      ...(paperId ? { id: paperId } : {}),
      ...(courseKey === "major" ? { majorId: ownerId } : { publicSubjectId: ownerId })
    },
    orderBy: [{ year: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, title: true, year: true, diamondPrice: true, questionTypeConfig: true,
      purchases: { where: { userId }, select: { id: true }, take: 1 },
      questions: {
        where: { question: { status: "published" } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { score: true, question: { select: {
          id: true, type: true, stem: true, options: true, answer: true, analysis: true,
          showAnalysis: true, showAiExplanation: true, fillBlankScored: true
        } } }
      }
    }
  });
  return { ownerName, papers: papers.filter((paper) => paper.questions.length > 0) };
}
