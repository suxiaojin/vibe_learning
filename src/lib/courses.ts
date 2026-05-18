import { getStudentFoundationProfile } from "@/lib/foundation";
import { prisma } from "@/lib/prisma";

type StudentCourseSelection = {
  regionId: string;
  publicSubjectId: string | null;
  majorId: string | null;
};

function studentCourseWhere(profile: StudentCourseSelection) {
  return {
    regionId: profile.regionId,
    status: "published" as const,
    OR: [
      {
        courseType: "public_subject" as const,
        publicSubjectId: profile.publicSubjectId
      },
      {
        courseType: "major" as const,
        majorId: profile.majorId
      }
    ]
  };
}

export async function getAvailableLearningCoursesForStudent(userId: string) {
  const profile = await getStudentFoundationProfile(userId);

  if (!profile?.regionId) {
    return [];
  }
  const selection = {
    regionId: profile.regionId,
    publicSubjectId: profile.publicSubjectId,
    majorId: profile.majorId
  };

  return prisma.learningCourse.findMany({
    where: studentCourseWhere(selection),
    select: {
      id: true,
      name: true,
      courseType: true,
      description: true,
      sortOrder: true,
      region: {
        select: {
          id: true,
          name: true
        }
      },
      publicSubject: {
        select: {
          id: true,
          name: true
        }
      },
      major: {
        select: {
          id: true,
          name: true
        }
      },
      _count: {
        select: {
          chapters: true,
          syllabusItems: true,
          examPapers: true
        }
      }
    },
    orderBy: [{ courseType: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
  });
}

export async function getLearningCourseForStudent(userId: string, courseId: string) {
  const profile = await getStudentFoundationProfile(userId);

  if (!profile?.regionId) {
    return null;
  }
  const selection = {
    regionId: profile.regionId,
    publicSubjectId: profile.publicSubjectId,
    majorId: profile.majorId
  };

  return prisma.learningCourse.findFirst({
    where: {
      id: courseId,
      ...studentCourseWhere(selection)
    },
    select: {
      id: true,
      name: true,
      courseType: true,
      description: true,
      status: true,
      sortOrder: true,
      region: {
        select: {
          id: true,
          name: true
        }
      },
      publicSubject: {
        select: {
          id: true,
          name: true
        }
      },
      major: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

export async function getLearningCourseOutlineForStudent(userId: string, courseId: string) {
  const course = await getLearningCourseForStudent(userId, courseId);

  if (!course) {
    return null;
  }

  const [chapters, syllabusItems, examPapers] = await Promise.all([
    prisma.chapter.findMany({
      where: {
        courseId: course.id,
        status: "published"
      },
      select: {
        id: true,
        title: true,
        sortOrder: true,
        points: {
          where: { status: "published" },
          select: {
            id: true,
            title: true,
            summary: true,
            estimatedMinutes: true,
            sortOrder: true,
            syllabusItemId: true,
            _count: {
              select: {
                questions: true
              }
            }
          },
          orderBy: { sortOrder: "asc" }
        }
      },
      orderBy: { sortOrder: "asc" }
    }),
    prisma.syllabusItem.findMany({
      where: {
        courseId: course.id,
        status: "published"
      },
      select: {
        id: true,
        parentId: true,
        code: true,
        title: true,
        description: true,
        requirement: true,
        sortOrder: true
      },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }]
    }),
    prisma.examPaper.findMany({
      where: {
        courseId: course.id,
        status: "published"
      },
      select: {
        id: true,
        title: true,
        year: true,
        paperType: true,
        description: true,
        sortOrder: true,
        _count: {
          select: {
            questions: true
          }
        }
      },
      orderBy: [{ year: "desc" }, { sortOrder: "asc" }]
    })
  ]);

  return {
    course,
    chapters,
    syllabusItems,
    examPapers
  };
}

export async function getLearningKnowledgePointForStudent(userId: string, pointId: string) {
  const profile = await getStudentFoundationProfile(userId);

  if (!profile?.regionId) {
    return null;
  }
  const selection = {
    regionId: profile.regionId,
    publicSubjectId: profile.publicSubjectId,
    majorId: profile.majorId
  };

  return prisma.knowledgePoint.findFirst({
    where: {
      id: pointId,
      status: "published",
      chapter: {
        status: "published",
        course: studentCourseWhere(selection)
      }
    },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      estimatedMinutes: true,
      sortOrder: true,
      syllabusItem: {
        select: {
          id: true,
          code: true,
          title: true,
          requirement: true
        }
      },
      chapter: {
        select: {
          id: true,
          title: true,
          sortOrder: true,
          course: {
            select: {
              id: true,
              name: true,
              courseType: true
            }
          }
        }
      },
      _count: {
        select: {
          questions: true
        }
      }
    }
  });
}

export async function getLearningQuestionsForStudent(userId: string, pointId: string) {
  const point = await getLearningKnowledgePointForStudent(userId, pointId);

  if (!point) {
    return null;
  }

  const questions = await prisma.question.findMany({
    where: {
      knowledgePointId: point.id,
      status: "published"
    },
    select: {
      id: true,
      type: true,
      stem: true,
      options: true,
      source: true,
      sourceType: true,
      sourceYear: true,
      difficulty: true,
      syllabusItem: {
        select: {
          id: true,
          code: true,
          title: true
        }
      }
    },
    orderBy: [{ createdAt: "asc" }]
  });

  return {
    point,
    questions
  };
}
