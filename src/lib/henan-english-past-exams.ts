import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const henanEnglishRegion = { province: "河南", studySystem: "三年制" };
const henanEnglishSubjectName = "公共英语";

export function isHenanThreeYearEnglish(region: { province: string; studySystem: string }, subjectName?: string) {
  return region.province === henanEnglishRegion.province &&
    region.studySystem === henanEnglishRegion.studySystem &&
    subjectName === henanEnglishSubjectName;
}

export function henanEnglishPastExamScope(userId: string): Prisma.ExamPaperWhereInput {
  return {
    ownerType: "public_subject",
    status: "published",
    region: { ...henanEnglishRegion, studentProfiles: { some: { userId } } },
    publicSubject: { name: henanEnglishSubjectName, studentProfiles: { some: { userId } } },
    questions: { some: { question: { status: "published" } } }
  };
}

export function getHenanEnglishPastExam(userId: string, paperId: string) {
  return prisma.examPaper.findFirst({
    where: {
      ...henanEnglishPastExamScope(userId),
      id: paperId,
      OR: [{ diamondPrice: 0 }, { purchases: { some: { userId } } }]
    },
    include: {
      questions: {
        where: { question: { status: "published" } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { question: true }
      }
    }
  });
}
