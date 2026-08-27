import { getStudentFoundationProfile } from "@/lib/foundation";
import { prisma } from "@/lib/prisma";
import { isRealQuestionBankTitle } from "@/lib/question-bank-source";
import { isQuestionBankAutoGradedQuestionType } from "@/lib/question-bank-types";

export type LearningOwnerType = "public_subject" | "major";
export type SyllabusPathStatus = "locked" | "unlocked" | "passed";

type SyllabusItemRecord = {
  id: string;
  courseId: string;
  parentId: string | null;
  code: string | null;
  title: string;
  description: string | null;
  sortOrder: number;
  checkpointScope: "course" | null;
};

type CourseRecord = {
  id: string;
  name: string;
  courseType: LearningOwnerType;
  description: string | null;
  sortOrder: number;
  challengeMode: "chapter" | "course";
  publicSubject: { id: string; name: string } | null;
  major: { id: string; name: string } | null;
  syllabusItems: SyllabusItemRecord[];
};

type ProgressRecord = {
  syllabusItemId: string;
  status: SyllabusPathStatus;
  bestScore: number;
  passedAt: Date | null;
};

export type SyllabusPathSection = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  questionCount: number;
  status: SyllabusPathStatus;
  bestScore: number;
  passedAt: Date | null;
  challengeVersionId?: string;
  questionSyllabusItemIds: string[];
};

export type SyllabusPathChapter = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  passedCount: number;
  sections: SyllabusPathSection[];
};

export type SyllabusPathCourse = {
  id: string;
  title: string;
  courseType: LearningOwnerType;
  description: string | null;
  sortOrder: number;
  chapters: SyllabusPathChapter[];
};

export type SyllabusPathGroup = {
  key: LearningOwnerType;
  name: string;
  ownerId: string | null;
  courses: SyllabusPathCourse[];
  sectionIds: string[];
};

type SyllabusShape = {
  itemById: Map<string, SyllabusItemRecord>;
  childrenByParentId: Map<string | null, SyllabusItemRecord[]>;
  displayChapterIdByItemId: Map<string, string>;
  displaySectionIdByItemId: Map<string, string>;
};

function studentCourseWhere(profile: { regionId: string; publicSubjectId: string | null; majorId: string | null }) {
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

function normalizeOwnerType(value?: string | null): LearningOwnerType | null {
  return value === "public_subject" || value === "major" ? value : null;
}

function compareByOutlineOrder(left: SyllabusItemRecord, right: SyllabusItemRecord) {
  return (
    left.sortOrder - right.sortOrder ||
    String(left.code || "").localeCompare(String(right.code || ""), "zh-CN", { numeric: true }) ||
    left.title.localeCompare(right.title, "zh-CN")
  );
}

function buildSyllabusShape(courses: CourseRecord[]): SyllabusShape {
  const itemById = new Map<string, SyllabusItemRecord>();
  const childrenByParentId = new Map<string | null, SyllabusItemRecord[]>();

  for (const item of courses.flatMap((course) => course.syllabusItems)) {
    itemById.set(item.id, item);
    const siblings = childrenByParentId.get(item.parentId) || [];
    siblings.push(item);
    childrenByParentId.set(item.parentId, siblings);
  }

  for (const siblings of childrenByParentId.values()) {
    siblings.sort(compareByOutlineOrder);
  }

  const displayChapterIdByItemId = new Map<string, string>();
  const displaySectionIdByItemId = new Map<string, string>();
  for (const item of itemById.values()) {
    const ancestors: SyllabusItemRecord[] = [];
    let cursor: SyllabusItemRecord | undefined = item;
    let guard = 0;

    while (cursor && guard < 20) {
      ancestors.unshift(cursor);
      cursor = cursor.parentId ? itemById.get(cursor.parentId) : undefined;
      guard += 1;
    }

    const displayChapter = ancestors[0];
    const displaySection = ancestors.length > 1 ? ancestors[1] : ancestors[0];
    if (displayChapter) {
      displayChapterIdByItemId.set(item.id, displayChapter.id);
    }
    if (displaySection) {
      displaySectionIdByItemId.set(item.id, displaySection.id);
    }
  }

  return { itemById, childrenByParentId, displayChapterIdByItemId, displaySectionIdByItemId };
}

function collectDescendantIds(itemId: string, childrenByParentId: Map<string | null, SyllabusItemRecord[]>) {
  const ids: string[] = [];
  const stack = [itemId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }
    ids.push(currentId);
    for (const child of childrenByParentId.get(currentId) || []) {
      stack.push(child.id);
    }
  }

  return ids;
}

function questionScopeForSection(item: SyllabusItemRecord, shape: SyllabusShape) {
  return collectDescendantIds(item.id, shape.childrenByParentId);
}

async function getQuestionCountsByDisplayItem(shape: SyllabusShape, displayItemIdByItemId: Map<string, string>) {
  const itemIds = Array.from(shape.itemById.keys());
  const questionIdsByDisplayItemId = new Map<string, Set<string>>();

  if (itemIds.length === 0) {
    return questionIdsByDisplayItemId;
  }

  const tags = await prisma.questionKnowledgeTag.findMany({
    where: {
      syllabusItemId: { in: itemIds },
      question: { status: "published" }
    },
    select: {
      syllabusItemId: true,
      questionId: true,
      question: {
        select: {
          paperQuestions: {
            where: {
              paper: { status: "published" }
            },
            select: {
              paper: {
                select: {
                  title: true
                }
              }
            }
          }
        }
      }
    }
  });

  for (const tag of tags) {
    const displayItemId = displayItemIdByItemId.get(tag.syllabusItemId);
    if (!displayItemId) {
      continue;
    }
    const hasRealQuestionBank = tag.question.paperQuestions.some(
      (paperQuestion) => isRealQuestionBankTitle(paperQuestion.paper.title)
    );
    if (!hasRealQuestionBank) {
      continue;
    }
    const questionIds = questionIdsByDisplayItemId.get(displayItemId) || new Set<string>();
    questionIds.add(tag.questionId);
    questionIdsByDisplayItemId.set(displayItemId, questionIds);
  }

  return questionIdsByDisplayItemId;
}

function getQuestionCountsByDisplaySection(shape: SyllabusShape) {
  return getQuestionCountsByDisplayItem(shape, shape.displaySectionIdByItemId);
}

async function getPublishedChallengesByChapter(shape: SyllabusShape) {
  const chapterIds = (shape.childrenByParentId.get(null) || []).map((item) => item.id);
  const versions = chapterIds.length
    ? await prisma.chapterChallengeVersion.findMany({
        where: { chapterId: { in: chapterIds }, status: "published", version: 1 },
        select: {
          id: true,
          chapterId: true,
          version: true,
          questions: {
            select: { questionId: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
          }
        },
        orderBy: { chapterId: "asc" }
      })
    : [];
  const challengeByChapterId = new Map<string, { id: string; questionIds: string[] }>();
  for (const version of versions) {
    if (!challengeByChapterId.has(version.chapterId) && version.questions.length > 0) {
      challengeByChapterId.set(version.chapterId, {
        id: version.id,
        questionIds: version.questions.map((item) => item.questionId)
      });
    }
  }
  return challengeByChapterId;
}

export async function getNextChapterChallengeVersion(chapterId: string, currentChallengeVersionId: string | null) {
  const versions = await prisma.chapterChallengeVersion.findMany({
    where: {
      chapterId,
      status: "published",
      questions: { some: {} }
    },
    select: {
      id: true,
      version: true
    },
    orderBy: { version: "asc" }
  });

  if (versions.length === 0) {
    return null;
  }

  const currentIndex = currentChallengeVersionId
    ? versions.findIndex((version) => version.id === currentChallengeVersionId)
    : -1;

  return currentIndex >= 0
    ? versions[(currentIndex + 1) % versions.length]
    : versions[0];
}

function buildGroups(
  courses: CourseRecord[],
  profile: {
    publicSubjectId: string | null;
    publicSubject: { name: string } | null;
    majorId: string | null;
    major: { name: string } | null;
  },
  shape: SyllabusShape,
  challengeByChapterId: Map<string, { id: string; questionIds: string[] }>,
  progressBySectionId: Map<string, ProgressRecord>
) {
  const groups: SyllabusPathGroup[] = [];
  const groupedCourses = new Map<LearningOwnerType, CourseRecord[]>();

  for (const course of courses) {
    const list = groupedCourses.get(course.courseType) || [];
    list.push(course);
    groupedCourses.set(course.courseType, list);
  }

  for (const courseList of groupedCourses.values()) {
    courseList.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"));
  }

  for (const key of ["public_subject", "major"] as const) {
    const courseList = groupedCourses.get(key) || [];
    if (courseList.length === 0) {
      continue;
    }

    const sectionIds: string[] = [];
    let groupSectionIndex = 0;
    let previousSectionStatus: SyllabusPathStatus | null = null;

    function resolvedSectionStatus(sectionId: string) {
      const progress = progressBySectionId.get(sectionId);
      if (progress?.status === "passed" || progress?.status === "unlocked") {
        return progress.status;
      }
      if (groupSectionIndex === 0 || previousSectionStatus === "passed") {
        return "unlocked";
      }
      return "locked";
    }

    const pathCourses = courseList.map((course) => {
      const courseRoots = (shape.childrenByParentId.get(null) || []).filter((item) => item.courseId === course.id);
      const realCourseItems = course.syllabusItems.filter((item) => item.checkpointScope === null);
      const courseCheckpoint = courseRoots.find((item) => item.checkpointScope === "course");
      const useCourseCheckpoint = course.challengeMode === "course"
        && Boolean(courseCheckpoint && challengeByChapterId.get(courseCheckpoint.id)?.questionIds.length);
      const roots = useCourseCheckpoint
        ? [courseCheckpoint!]
        : courseRoots.filter((item) => item.checkpointScope === null);
      const chapters = roots
        .map((root) => {
          const challenge = challengeByChapterId.get(root.id);
          const rootQuestionCount = challenge?.questionIds.length || 0;
          const sections: SyllabusPathSection[] = [];

          if (rootQuestionCount > 0) {
            const progress = progressBySectionId.get(root.id);
            const status = resolvedSectionStatus(root.id);
            sections.push({
              id: root.id,
              title: root.title,
              description: root.description,
              sortOrder: root.sortOrder,
              questionCount: rootQuestionCount,
              status,
              bestScore: progress?.bestScore || 0,
              passedAt: progress?.passedAt || null,
              challengeVersionId: challenge?.id,
              questionSyllabusItemIds: root.checkpointScope === "course"
                ? realCourseItems.map((item) => item.id)
                : questionScopeForSection(root, shape)
            });
            sectionIds.push(root.id);
            previousSectionStatus = status;
            groupSectionIndex += 1;
          }

          return {
            id: root.id,
            title: root.title,
            description: root.description,
            sortOrder: root.sortOrder,
            passedCount: sections.filter((section) => section.status === "passed").length,
            sections
          };
        })
        .filter((chapter) => chapter.sections.length > 0);

      return {
        id: course.id,
        title: course.name,
        courseType: course.courseType,
        description: course.description,
        sortOrder: course.sortOrder,
        chapters
      };
    });

    groups.push({
      key,
      name: key === "public_subject" ? profile.publicSubject?.name || courseList[0].name : profile.major?.name || courseList[0].name,
      ownerId: key === "public_subject" ? profile.publicSubjectId : profile.majorId,
      courses: pathCourses,
      sectionIds
    });
  }

  return groups;
}

async function getPublishedStudentCourses(profile: { regionId: string; publicSubjectId: string; majorId: string }) {
  const courses = await prisma.learningCourse.findMany({
    where: studentCourseWhere(profile),
    select: {
      id: true,
      name: true,
      courseType: true,
      description: true,
      sortOrder: true,
      challengeMode: true,
      publicSubject: { select: { id: true, name: true } },
      major: { select: { id: true, name: true } },
      syllabusItems: {
        where: { status: "published" },
        select: {
          id: true,
          courseId: true,
          parentId: true,
          code: true,
          title: true,
          description: true,
          sortOrder: true,
          checkpointScope: true
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    },
    orderBy: [{ courseType: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
  });

  return courses as CourseRecord[];
}

export async function getStudentLearningPath(userId: string, requestedCourseType?: string | null) {
  const profile = await getStudentFoundationProfile(userId);

  if (!profile?.regionId || !profile.publicSubjectId || !profile.majorId) {
    return {
      completed: false,
      profile,
      groups: [] as SyllabusPathGroup[],
      selectedGroup: null as SyllabusPathGroup | null
    };
  }

  const courses = await getPublishedStudentCourses({
    regionId: profile.regionId,
    publicSubjectId: profile.publicSubjectId,
    majorId: profile.majorId
  });

  const shape = buildSyllabusShape(courses);
  const challengeByChapterId = await getPublishedChallengesByChapter(shape);
  const groupsBeforeSync = buildGroups(courses, profile, shape, challengeByChapterId, new Map());

  const allSectionIds = Array.from(new Set(groupsBeforeSync.flatMap((group) => group.sectionIds)));
  const progress = allSectionIds.length
    ? await prisma.userSyllabusProgress.findMany({
        where: { userId, syllabusItemId: { in: allSectionIds } },
        select: { syllabusItemId: true, status: true, bestScore: true, passedAt: true }
      })
    : [];
  const progressBySectionId = new Map(
    progress.map((item) => [
      item.syllabusItemId,
      {
        syllabusItemId: item.syllabusItemId,
        status: item.status as SyllabusPathStatus,
        bestScore: item.bestScore,
        passedAt: item.passedAt
      }
    ])
  );
  const groups = buildGroups(courses, profile, shape, challengeByChapterId, progressBySectionId);
  const requested = normalizeOwnerType(requestedCourseType);
  const selectedGroup = groups.find((group) => group.key === requested) || groups.find((group) => group.key === "major") || groups[0] || null;

  return {
    completed: true,
    profile,
    groups,
    selectedGroup
  };
}

function buildKnowledgeMapGroups(
  courses: CourseRecord[],
  shape: SyllabusShape,
  questionIdsBySectionId: Map<string, Set<string>>,
  learningGroups: SyllabusPathGroup[]
) {
  const courseById = new Map(courses.map((course) => [course.id, course]));

  return learningGroups.map((group) => {
    const sectionIds: string[] = [];
    const knowledgeCourses = group.courses.map((learningCourse) => {
      const course = courseById.get(learningCourse.id);
      const roots = course
        ? (shape.childrenByParentId.get(null) || []).filter(
            (item) => item.courseId === course.id && item.checkpointScope === null
          )
        : [];
      const courseCheckpoint = course?.challengeMode === "course"
        ? learningCourse.chapters.find((chapter) =>
            course.syllabusItems.some((item) => item.id === chapter.id && item.checkpointScope === "course")
          )?.sections[0]
        : null;
      const chapters = roots.map((root) => {
        const learningChapter = learningCourse.chapters.find((chapter) => chapter.id === root.id);
        const checkpoint = courseCheckpoint || learningChapter?.sections[0];
        const status = checkpoint?.status || "locked";
        const bestScore = checkpoint?.bestScore || 0;
        const passedAt = checkpoint?.passedAt || null;
        const sections: SyllabusPathSection[] = [];
        const rootQuestionCount = questionIdsBySectionId.get(root.id)?.size || 0;

        if (rootQuestionCount > 0) {
          sections.push({
            id: root.id,
            title: root.title,
            description: root.description,
            sortOrder: root.sortOrder,
            questionCount: rootQuestionCount,
            status,
            bestScore,
            passedAt,
            questionSyllabusItemIds: [root.id]
          });
          sectionIds.push(root.id);
        }

        for (const child of shape.childrenByParentId.get(root.id) || []) {
          const questionCount = questionIdsBySectionId.get(child.id)?.size || 0;
          if (questionCount <= 0) {
            continue;
          }
          sections.push({
            id: child.id,
            title: child.title,
            description: child.description,
            sortOrder: child.sortOrder,
            questionCount,
            status,
            bestScore,
            passedAt,
            questionSyllabusItemIds: questionScopeForSection(child, shape)
          });
          sectionIds.push(child.id);
        }

        return {
          id: root.id,
          title: root.title,
          description: root.description,
          sortOrder: root.sortOrder,
          passedCount: sections.filter((section) => section.status === "passed").length,
          sections
        };
      });

      return {
        ...learningCourse,
        chapters
      };
    });

    return {
      ...group,
      courses: knowledgeCourses,
      sectionIds
    };
  });
}

export async function getStudentKnowledgeMap(userId: string, requestedCourseType?: string | null) {
  const learningPath = await getStudentLearningPath(userId, requestedCourseType);
  const profile = learningPath.profile;

  if (!profile?.regionId || !profile.publicSubjectId || !profile.majorId) {
    return learningPath;
  }

  const courses = await getPublishedStudentCourses({
    regionId: profile.regionId,
    publicSubjectId: profile.publicSubjectId,
    majorId: profile.majorId
  });
  const shape = buildSyllabusShape(courses);
  const questionIdsBySectionId = await getQuestionCountsByDisplaySection(shape);
  const groups = buildKnowledgeMapGroups(courses, shape, questionIdsBySectionId, learningPath.groups);
  const requested = normalizeOwnerType(requestedCourseType);
  const selectedGroup = groups.find((group) => group.key === requested) || groups.find((group) => group.key === "major") || groups[0] || null;

  return {
    ...learningPath,
    groups,
    selectedGroup
  };
}

export async function getSyllabusSectionForStudent(userId: string, sectionId: string) {
  const path = await getStudentLearningPath(userId);

  for (const group of path.groups) {
    for (const course of group.courses) {
      for (const chapter of course.chapters) {
        const section = chapter.sections.find((item) => item.id === sectionId);
        if (section) {
          return {
            path,
            group,
            course,
            chapter,
            section,
            locked: section.status === "locked"
          };
        }
      }
    }
  }

  return null;
}

export async function getSyllabusSectionQuestionsForStudent(
  userId: string,
  sectionId: string,
  includeAnswers = false,
  sessionId?: string
) {
  const access = await getSyllabusSectionForStudent(userId, sectionId);

  if (!access || access.locked) {
    return null;
  }

  const session = sessionId
    ? await prisma.quizSession.findFirst({
        where: { id: sessionId, userId, syllabusItemId: sectionId },
        select: { chapterChallengeVersionId: true }
      })
    : null;
  const challengeVersionId = session?.chapterChallengeVersionId || access.section.challengeVersionId;
  if (!challengeVersionId) {
    return null;
  }
  const challengeVersion = await prisma.chapterChallengeVersion.findFirst({
    where: {
      id: challengeVersionId,
      chapterId: sectionId
    },
    select: {
      id: true,
      questions: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          question: {
            select: {
              id: true,
              type: true,
              stem: true,
              options: true,
              answer: true,
              analysis: true,
              source: true,
              sourceType: true,
              sourceYear: true,
              difficulty: true,
              paperQuestions: {
                where: { paper: { status: "published" } },
                select: {
                  sortOrder: true,
                  paper: {
                    select: {
                      id: true,
                      title: true,
                      paperType: true,
                      sortOrder: true,
                      year: true
                    }
                  }
                },
                orderBy: [{ paper: { sortOrder: "asc" } }, { sortOrder: "asc" }]
              }
            }
          }
        }
      }
    }
  });
  if (!challengeVersion) {
    return null;
  }
  const questions = challengeVersion.questions.map(({ question: { paperQuestions, answer, analysis, ...question } }) => {
      const paper = paperQuestions[0]?.paper || null;
      const questionBank = paper
        ? {
            id: paper.id,
            title: paper.title,
            year: paper.year,
            paperType: paper.paperType
          }
        : null;

      return includeAnswers ? { ...question, questionBank, answer, analysis } : { ...question, questionBank };
    });

  return {
    course: access.course,
    chapter: access.chapter,
    section: access.section,
    challengeVersionId: challengeVersion.id,
    questions
  };
}

export async function getSyllabusSectionQuestionForStudent(userId: string, sectionId: string, index: number, sessionId?: string) {
  const result = await getSyllabusSectionQuestionsForStudent(userId, sectionId, false, sessionId);
  if (!result) {
    return null;
  }

  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
  return {
    course: result.course,
    chapter: result.chapter,
    section: result.section,
    index: safeIndex,
    total: result.questions.length,
    question: result.questions[safeIndex] || null
  };
}

export async function checkSyllabusSectionQuestionAnswer(
  userId: string,
  sectionId: string,
  questionId: string,
  selectedAnswer: unknown,
  sessionId?: string
) {
  const result = await getSyllabusSectionQuestionsForStudent(userId, sectionId, true, sessionId);
  if (!result) {
    return null;
  }

  const question = result.questions.find((item) => item.id === questionId);
  if (!question || !("answer" in question)) {
    return null;
  }

  return {
    questionId: question.id,
    correct: isQuestionBankAutoGradedQuestionType(question.type)
      ? JSON.stringify(normalizeAnswerForCheck(selectedAnswer)) === JSON.stringify(normalizeAnswerForCheck(question.answer))
      : null,
    gradingStatus: isQuestionBankAutoGradedQuestionType(question.type) ? "auto_graded" as const : "ungraded" as const,
    correctAnswer: question.answer
  };
}

function normalizeAnswerForCheck(value: unknown) {
  const array = Array.isArray(value) ? value : [value];
  return array
    .map((item) => String(item).trim())
    .filter(Boolean)
    .sort();
}

export async function recordSyllabusSectionProgress(userId: string, sectionId: string, score: number | null, passed: boolean) {
  const current = await prisma.userSyllabusProgress.findUnique({
    where: { userId_syllabusItemId: { userId, syllabusItemId: sectionId } },
    select: { status: true, bestScore: true, passedAt: true }
  });

  await prisma.userSyllabusProgress.upsert({
    where: { userId_syllabusItemId: { userId, syllabusItemId: sectionId } },
    update: {
      status: passed ? "passed" : current?.status || "unlocked",
      bestScore: score === null ? current?.bestScore || 0 : Math.max(current?.bestScore || 0, score),
      passedAt: passed ? new Date() : current?.passedAt
    },
    create: {
      userId,
      syllabusItemId: sectionId,
      status: passed ? "passed" : "unlocked",
      bestScore: score ?? 0,
      passedAt: passed ? new Date() : null
    }
  });

  if (passed) {
    await unlockNextSyllabusSection(userId, sectionId);
  }

  return passed && current?.status !== "passed";
}

export async function unlockNextSyllabusSection(userId: string, currentSectionId: string) {
  const path = await getStudentLearningPath(userId);
  const group = path.groups.find((item) => item.sectionIds.includes(currentSectionId));
  if (!group) {
    return null;
  }

  const currentIndex = group.sectionIds.findIndex((sectionId) => sectionId === currentSectionId);
  const nextSectionId = currentIndex >= 0 ? group.sectionIds[currentIndex + 1] : null;
  if (!nextSectionId) {
    return null;
  }

  await prisma.userSyllabusProgress.upsert({
    where: { userId_syllabusItemId: { userId, syllabusItemId: nextSectionId } },
    update: { status: "unlocked" },
    create: { userId, syllabusItemId: nextSectionId, status: "unlocked" }
  });

  return nextSectionId;
}

export async function getNextSyllabusSectionForStudent(userId: string, currentSectionId: string) {
  const path = await getStudentLearningPath(userId);
  const group = path.groups.find((item) => item.sectionIds.includes(currentSectionId));
  if (!group) {
    return null;
  }

  const currentIndex = group.sectionIds.findIndex((sectionId) => sectionId === currentSectionId);
  const nextSectionId = currentIndex >= 0 ? group.sectionIds[currentIndex + 1] : null;
  if (!nextSectionId) {
    return null;
  }

  for (const course of group.courses) {
    for (const chapter of course.chapters) {
      const section = chapter.sections.find((item) => item.id === nextSectionId);
      if (section) {
        return { group, course, chapter, section };
      }
    }
  }

  return null;
}
