import { getStudentFoundationProfile } from "@/lib/foundation";
import { prisma } from "@/lib/prisma";

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
};

type CourseRecord = {
  id: string;
  name: string;
  courseType: LearningOwnerType;
  description: string | null;
  sortOrder: number;
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

    const displayItem = ancestors.length > 1 ? ancestors[1] : ancestors[0];
    if (displayItem) {
      displaySectionIdByItemId.set(item.id, displayItem.id);
    }
  }

  return { itemById, childrenByParentId, displaySectionIdByItemId };
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
  const childCount = shape.childrenByParentId.get(item.id)?.length || 0;
  if (!item.parentId && childCount > 0) {
    return [item.id];
  }
  return collectDescendantIds(item.id, shape.childrenByParentId);
}

async function getQuestionCountsByDisplaySection(shape: SyllabusShape) {
  const itemIds = Array.from(shape.itemById.keys());
  const questionIdsBySectionId = new Map<string, Set<string>>();

  if (itemIds.length === 0) {
    return questionIdsBySectionId;
  }

  const tags = await prisma.questionKnowledgeTag.findMany({
    where: {
      syllabusItemId: { in: itemIds },
      question: { status: "published" }
    },
    select: {
      syllabusItemId: true,
      questionId: true
    }
  });

  for (const tag of tags) {
    const displaySectionId = shape.displaySectionIdByItemId.get(tag.syllabusItemId);
    if (!displaySectionId) {
      continue;
    }
    const questionIds = questionIdsBySectionId.get(displaySectionId) || new Set<string>();
    questionIds.add(tag.questionId);
    questionIdsBySectionId.set(displaySectionId, questionIds);
  }

  return questionIdsBySectionId;
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
  questionIdsBySectionId: Map<string, Set<string>>,
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
    const pathCourses = courseList.map((course) => {
      const roots = (shape.childrenByParentId.get(null) || []).filter((item) => item.courseId === course.id);
      const chapters = roots
        .map((root) => {
          const rootQuestionCount = questionIdsBySectionId.get(root.id)?.size || 0;
          const sections: SyllabusPathSection[] = [];

          if (rootQuestionCount > 0) {
            const progress = progressBySectionId.get(root.id);
            sections.push({
              id: root.id,
              title: root.title,
              description: root.description,
              sortOrder: root.sortOrder,
              questionCount: rootQuestionCount,
              status: progress?.status || (groupSectionIndex === 0 ? "unlocked" : "locked"),
              bestScore: progress?.bestScore || 0,
              passedAt: progress?.passedAt || null,
              questionSyllabusItemIds: questionScopeForSection(root, shape)
            });
            sectionIds.push(root.id);
            groupSectionIndex += 1;
          }

          for (const child of shape.childrenByParentId.get(root.id) || []) {
            const questionCount = questionIdsBySectionId.get(child.id)?.size || 0;
            if (questionCount <= 0) {
              continue;
            }
            const progress = progressBySectionId.get(child.id);
            sections.push({
              id: child.id,
              title: child.title,
              description: child.description,
              sortOrder: child.sortOrder,
              questionCount,
              status: progress?.status || (groupSectionIndex === 0 ? "unlocked" : "locked"),
              bestScore: progress?.bestScore || 0,
              passedAt: progress?.passedAt || null,
              questionSyllabusItemIds: questionScopeForSection(child, shape)
            });
            sectionIds.push(child.id);
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

async function syncSyllabusProgress(userId: string, sectionIds: string[]) {
  const uniqueSectionIds = Array.from(new Set(sectionIds));
  if (uniqueSectionIds.length === 0) {
    return;
  }

  const existing = await prisma.userSyllabusProgress.findMany({
    where: { userId, syllabusItemId: { in: uniqueSectionIds } },
    select: { syllabusItemId: true, status: true }
  });
  const existingBySectionId = new Map(existing.map((item) => [item.syllabusItemId, item.status as SyllabusPathStatus]));
  const idsToUnlock = new Set<string>();

  const firstSectionId = uniqueSectionIds[0];
  if (existingBySectionId.get(firstSectionId) !== "passed") {
    idsToUnlock.add(firstSectionId);
  }

  for (const [index, sectionId] of uniqueSectionIds.entries()) {
    if (existingBySectionId.get(sectionId) !== "passed") {
      continue;
    }
    const nextSectionId = uniqueSectionIds[index + 1];
    if (nextSectionId && existingBySectionId.get(nextSectionId) !== "passed") {
      idsToUnlock.add(nextSectionId);
    }
  }

  await Promise.all(
    uniqueSectionIds.map((sectionId) => {
      const currentStatus = existingBySectionId.get(sectionId);
      const shouldUnlock = idsToUnlock.has(sectionId);

      if (!currentStatus) {
        return prisma.userSyllabusProgress.create({
          data: {
            userId,
            syllabusItemId: sectionId,
            status: shouldUnlock ? "unlocked" : "locked"
          }
        });
      }

      if (shouldUnlock && currentStatus === "locked") {
        return prisma.userSyllabusProgress.update({
          where: { userId_syllabusItemId: { userId, syllabusItemId: sectionId } },
          data: { status: "unlocked" }
        });
      }

      return Promise.resolve(null);
    })
  );
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

  const courseSelection = {
    regionId: profile.regionId,
    publicSubjectId: profile.publicSubjectId,
    majorId: profile.majorId
  };

  const courses = await prisma.learningCourse.findMany({
    where: studentCourseWhere(courseSelection),
    select: {
      id: true,
      name: true,
      courseType: true,
      description: true,
      sortOrder: true,
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
          sortOrder: true
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    },
    orderBy: [{ courseType: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
  });

  const typedCourses = courses as CourseRecord[];
  const shape = buildSyllabusShape(typedCourses);
  const questionIdsBySectionId = await getQuestionCountsByDisplaySection(shape);
  const groupsBeforeSync = buildGroups(typedCourses, profile, shape, questionIdsBySectionId, new Map());

  await Promise.all(groupsBeforeSync.map((group) => syncSyllabusProgress(userId, group.sectionIds)));

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
  const groups = buildGroups(typedCourses, profile, shape, questionIdsBySectionId, progressBySectionId);
  const requested = normalizeOwnerType(requestedCourseType);
  const selectedGroup = groups.find((group) => group.key === requested) || groups.find((group) => group.key === "major") || groups[0] || null;

  return {
    completed: true,
    profile,
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

export async function getSyllabusSectionQuestionsForStudent(userId: string, sectionId: string, includeAnswers = false) {
  const access = await getSyllabusSectionForStudent(userId, sectionId);

  if (!access || access.locked) {
    return null;
  }

  const tags = await prisma.questionKnowledgeTag.findMany({
    where: {
      syllabusItemId: { in: access.section.questionSyllabusItemIds },
      question: { status: "published" }
    },
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
          createdAt: true,
          paperQuestions: {
            where: { paper: { courseId: access.course.id, status: "published" } },
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
            orderBy: { sortOrder: "asc" }
          }
        }
      }
    }
  });

  const seenQuestionIds = new Set<string>();
  const questions = tags
    .map((tag) => tag.question)
    .filter((question) => {
      if (seenQuestionIds.has(question.id)) {
        return false;
      }
      seenQuestionIds.add(question.id);
      return true;
    })
    .sort((left, right) => {
      const leftPaperQuestion = left.paperQuestions[0];
      const rightPaperQuestion = right.paperQuestions[0];
      return (
        (leftPaperQuestion?.paper.sortOrder ?? 9999) - (rightPaperQuestion?.paper.sortOrder ?? 9999) ||
        (rightPaperQuestion?.paper.year ?? 0) - (leftPaperQuestion?.paper.year ?? 0) ||
        (leftPaperQuestion?.sortOrder ?? 9999) - (rightPaperQuestion?.sortOrder ?? 9999) ||
        left.createdAt.getTime() - right.createdAt.getTime()
      );
    })
    .map(({ paperQuestions, createdAt: _createdAt, answer, analysis, ...question }) => {
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
    questions
  };
}

export async function recordSyllabusSectionProgress(userId: string, sectionId: string, score: number, passed: boolean) {
  const current = await prisma.userSyllabusProgress.findUnique({
    where: { userId_syllabusItemId: { userId, syllabusItemId: sectionId } },
    select: { status: true, bestScore: true, passedAt: true }
  });

  await prisma.userSyllabusProgress.upsert({
    where: { userId_syllabusItemId: { userId, syllabusItemId: sectionId } },
    update: {
      status: passed ? "passed" : current?.status || "unlocked",
      bestScore: Math.max(current?.bestScore || 0, score),
      passedAt: passed ? new Date() : current?.passedAt
    },
    create: {
      userId,
      syllabusItemId: sectionId,
      status: passed ? "passed" : "unlocked",
      bestScore: score,
      passedAt: passed ? new Date() : null
    }
  });

  if (passed) {
    await unlockNextSyllabusSection(userId, sectionId);
  }
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
