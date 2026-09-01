export type QuestionBankCopySyllabusItem = {
  id: string;
  parentId: string | null;
  checkpointScope: string | null;
  code: string | null;
  title: string;
};

export type QuestionBankCopyKnowledgePoint = {
  id: string;
  syllabusItemId: string | null;
  title: string;
  sortOrder: number;
};

export type QuestionBankCopyChapter = {
  title: string;
  sortOrder: number;
  points: QuestionBankCopyKnowledgePoint[];
};

export type QuestionBankCopyCourse = {
  name: string;
  syllabusItems: QuestionBankCopySyllabusItem[];
  chapters: QuestionBankCopyChapter[];
};

export type QuestionBankCopyQuestionRefs = {
  knowledgePointId: string | null;
  syllabusItemId: string | null;
  knowledgeTagSyllabusItemIds: string[];
};

export type QuestionBankKnowledgeCopySummary = {
  questionCount: number;
  associationCount: number;
  mappedAssociationCount: number;
  unmappedAssociationCount: number;
  unclassifiedQuestionCount: number;
  questionsWithUnmappedAssociations: number;
};

export type QuestionBankKnowledgeCopyMapping = {
  syllabusItemIds: Map<string, string>;
  knowledgePointIds: Map<string, string>;
  summary: QuestionBankKnowledgeCopySummary;
};

function normalizeText(value: string | null | undefined) {
  return (value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function uniqueKeys(entries: Array<{ id: string; key: string | null }>) {
  const keyCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.key) {
      keyCounts.set(entry.key, (keyCounts.get(entry.key) || 0) + 1);
    }
  }

  return new Map(
    entries
      .filter((entry): entry is { id: string; key: string } => Boolean(entry.key && keyCounts.get(entry.key) === 1))
      .map((entry) => [entry.id, entry.key])
  );
}

function buildSyllabusKeys(courses: QuestionBankCopyCourse[]) {
  const entries: Array<{ id: string; key: string | null }> = [];

  for (const course of courses) {
    const courseName = normalizeText(course.name);
    const itemById = new Map(course.syllabusItems.map((item) => [item.id, item]));
    const pathCache = new Map<string, string | null>();

    const buildPath = (itemId: string, visiting = new Set<string>()): string | null => {
      if (pathCache.has(itemId)) {
        return pathCache.get(itemId) || null;
      }
      const item = itemById.get(itemId);
      if (!item || visiting.has(itemId)) {
        pathCache.set(itemId, null);
        return null;
      }

      const nextVisiting = new Set(visiting);
      nextVisiting.add(itemId);
      const segment = JSON.stringify([
        normalizeText(item.checkpointScope),
        normalizeText(item.code),
        normalizeText(item.title)
      ]);
      const parentPath = item.parentId ? buildPath(item.parentId, nextVisiting) : "";
      const path = item.parentId && !parentPath ? null : parentPath ? `${parentPath}/${segment}` : segment;
      pathCache.set(itemId, path);
      return path;
    };

    for (const item of course.syllabusItems) {
      const path = buildPath(item.id);
      entries.push({
        id: item.id,
        key: courseName && path ? JSON.stringify([courseName, path]) : null
      });
    }
  }

  return uniqueKeys(entries);
}

function buildKnowledgePointKeys(courses: QuestionBankCopyCourse[], syllabusKeys: Map<string, string>) {
  const entries: Array<{ id: string; key: string | null }> = [];

  for (const course of courses) {
    const courseName = normalizeText(course.name);
    for (const chapter of course.chapters) {
      for (const point of chapter.points) {
        const syllabusKey = point.syllabusItemId ? syllabusKeys.get(point.syllabusItemId) : null;
        const key = syllabusKey
          ? JSON.stringify(["syllabus", syllabusKey, normalizeText(point.title), point.sortOrder])
          : courseName
            ? JSON.stringify([
                "chapter",
                courseName,
                normalizeText(chapter.title),
                chapter.sortOrder,
                normalizeText(point.title),
                point.sortOrder
              ])
            : null;
        entries.push({ id: point.id, key });
      }
    }
  }

  return uniqueKeys(entries);
}

function matchUniqueIds(sourceKeys: Map<string, string>, targetKeys: Map<string, string>) {
  const targetIdByKey = new Map(Array.from(targetKeys, ([id, key]) => [key, id]));
  const matches = new Map<string, string>();
  for (const [sourceId, key] of sourceKeys) {
    const targetId = targetIdByKey.get(key);
    if (targetId) {
      matches.set(sourceId, targetId);
    }
  }
  return matches;
}

export function buildQuestionBankKnowledgeCopyMapping(
  sourceCourses: QuestionBankCopyCourse[],
  targetCourses: QuestionBankCopyCourse[],
  questions: QuestionBankCopyQuestionRefs[]
): QuestionBankKnowledgeCopyMapping {
  const sourceSyllabusKeys = buildSyllabusKeys(sourceCourses);
  const targetSyllabusKeys = buildSyllabusKeys(targetCourses);
  const sourceKnowledgePointKeys = buildKnowledgePointKeys(sourceCourses, sourceSyllabusKeys);
  const targetKnowledgePointKeys = buildKnowledgePointKeys(targetCourses, targetSyllabusKeys);
  const syllabusItemIds = matchUniqueIds(sourceSyllabusKeys, targetSyllabusKeys);
  const knowledgePointIds = matchUniqueIds(sourceKnowledgePointKeys, targetKnowledgePointKeys);

  let associationCount = 0;
  let mappedAssociationCount = 0;
  let unclassifiedQuestionCount = 0;
  let questionsWithUnmappedAssociations = 0;

  for (const question of questions) {
    const associations = [
      ...(question.knowledgePointId ? [{ id: question.knowledgePointId, kind: "knowledge_point" as const }] : []),
      ...(question.syllabusItemId ? [{ id: question.syllabusItemId, kind: "syllabus_item" as const }] : []),
      ...question.knowledgeTagSyllabusItemIds.map((id) => ({ id, kind: "syllabus_item" as const }))
    ];

    if (!associations.length) {
      unclassifiedQuestionCount += 1;
      continue;
    }

    let hasUnmappedAssociation = false;
    associationCount += associations.length;
    for (const association of associations) {
      const mapped = association.kind === "knowledge_point"
        ? knowledgePointIds.has(association.id)
        : syllabusItemIds.has(association.id);
      if (mapped) {
        mappedAssociationCount += 1;
      } else {
        hasUnmappedAssociation = true;
      }
    }
    if (hasUnmappedAssociation) {
      questionsWithUnmappedAssociations += 1;
    }
  }

  return {
    syllabusItemIds,
    knowledgePointIds,
    summary: {
      questionCount: questions.length,
      associationCount,
      mappedAssociationCount,
      unmappedAssociationCount: associationCount - mappedAssociationCount,
      unclassifiedQuestionCount,
      questionsWithUnmappedAssociations
    }
  };
}
