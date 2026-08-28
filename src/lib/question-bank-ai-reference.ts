import { questionBankEditableQuestionTypes, type QuestionBankEditableQuestionType } from "./question-bank-types";

type SyllabusItem = { id: string; parentId: string | null; code: string | null; title: string; sortOrder: number };
type Course = { id: string; name: string; syllabusItems: SyllabusItem[] };
type PaperQuestion = { id: string; question: { type: string; knowledgeTags: Array<{ syllabusItemId: string }> } };

export type AiReferenceChapter = {
  id: string;
  title: string;
  path: string;
  descendantIds: string[];
};

export function buildAiReferenceChapters(courses: Course[]): AiReferenceChapter[] {
  return courses.flatMap((course) => {
    const children = new Map<string | null, SyllabusItem[]>();
    const items = [...course.syllabusItems].sort((a, b) =>
      (a.code || "").localeCompare(b.code || "", "zh-Hans-CN", { numeric: true }) ||
      a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "zh-Hans-CN")
    );
    items.forEach((item) => children.set(item.parentId, [...(children.get(item.parentId) || []), item]));
    function descendants(id: string): string[] {
      return [id, ...(children.get(id) || []).flatMap((item) => descendants(item.id))];
    }
    return (children.get(null) || []).map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      path: `${course.name} - ${chapter.title}`,
      descendantIds: descendants(chapter.id)
    }));
  });
}

export function buildAiReferenceKnowledgeTree(courses: Course[], paperQuestions: PaperQuestion[]) {
  return courses.map((course) => {
    const courseQuestionIds = new Set<string>();
    const chapters = buildAiReferenceChapters([course]).map((chapter) => {
      const descendantIds = new Set(chapter.descendantIds);
      const questionIds = new Set<string>();
      const types = new Set<string>();
      paperQuestions.forEach((row) => {
        if (!row.question.knowledgeTags.some((tag) => descendantIds.has(tag.syllabusItemId))) return;
        questionIds.add(row.id);
        courseQuestionIds.add(row.id);
        types.add(row.question.type);
      });
      return {
        id: chapter.id,
        title: chapter.title,
        path: chapter.path,
        count: questionIds.size,
        questionTypes: questionBankEditableQuestionTypes.filter((type) => types.has(type))
      };
    });
    return { id: course.id, title: course.name, path: course.name, count: courseQuestionIds.size, chapters };
  });
}

export function getAiReferenceQuestionTypes(chapters: Array<{ questionTypes: QuestionBankEditableQuestionType[] }>) {
  const types = new Set(chapters.flatMap((chapter) => chapter.questionTypes));
  return questionBankEditableQuestionTypes.filter((type) => types.has(type));
}
