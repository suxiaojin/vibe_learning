export type BuddyShareType = "question_card" | "quiz_result_card" | "active_learning_card";

export type BuddyQuestionShareCard = {
  type: "question_card";
  correctAnswer: string;
  indexLabel: string;
  questionTypeLabel: string;
  selectedAnswer: string;
  sourceTitle?: string;
  title: string;
  wasCorrect: boolean;
};

export type BuddyQuizResultShareCard = {
  type: "quiz_result_card";
  chapterTitle: string;
  correct: number;
  courseTitle: string;
  diamondRewardAmount: number;
  passed: boolean;
  score: number;
  sectionTitle: string;
  submittedAtLabel: string;
  total: number;
};

export type BuddyActiveLearningDay = {
  count: number;
  future?: boolean;
  key: string;
  level: number;
};

export type BuddyActiveLearningShareCard = {
  type: "active_learning_card";
  activeDays: number;
  monthAttemptCount: number;
  nextLabel?: string;
  remaining: number;
  totalAttempts: number;
  weeks: BuddyActiveLearningDay[][];
};

export type BuddyShareCard = BuddyQuestionShareCard | BuddyQuizResultShareCard | BuddyActiveLearningShareCard;

const maxTextLength = 140;
const maxWeeks = 30;
const maxDaysPerWeek = 7;

export function normalizeBuddyShareInput(input: unknown): BuddyShareCard | null {
  if (!isRecord(input)) {
    return null;
  }

  if (input.type === "question_card") {
    const title = cleanText(input.title, 120);
    if (!title) {
      return null;
    }
    return {
      type: "question_card",
      correctAnswer: cleanText(input.correctAnswer, 60) || "未记录",
      indexLabel: cleanText(input.indexLabel, 30) || "题目",
      questionTypeLabel: cleanText(input.questionTypeLabel, 30) || "练习题",
      selectedAnswer: cleanText(input.selectedAnswer, 60) || "未选择",
      sourceTitle: cleanText(input.sourceTitle, 60) || undefined,
      title,
      wasCorrect: Boolean(input.wasCorrect)
    };
  }

  if (input.type === "quiz_result_card") {
    const sectionTitle = cleanText(input.sectionTitle, 80);
    if (!sectionTitle) {
      return null;
    }
    return {
      type: "quiz_result_card",
      chapterTitle: cleanText(input.chapterTitle, 50) || "章节",
      correct: nonNegativeInteger(input.correct),
      courseTitle: cleanText(input.courseTitle, 50) || "课程",
      diamondRewardAmount: nonNegativeInteger(input.diamondRewardAmount),
      passed: Boolean(input.passed),
      score: clampInteger(input.score, 0, 100),
      sectionTitle,
      submittedAtLabel: cleanText(input.submittedAtLabel, 40) || "",
      total: Math.max(1, nonNegativeInteger(input.total))
    };
  }

  if (input.type === "active_learning_card") {
    const weeks = normalizeWeeks(input.weeks);
    if (weeks.length === 0) {
      return null;
    }
    return {
      type: "active_learning_card",
      activeDays: nonNegativeInteger(input.activeDays),
      monthAttemptCount: nonNegativeInteger(input.monthAttemptCount),
      nextLabel: cleanText(input.nextLabel, 30) || undefined,
      remaining: nonNegativeInteger(input.remaining),
      totalAttempts: nonNegativeInteger(input.totalAttempts),
      weeks
    };
  }

  return null;
}

function cleanText(value: unknown, maxLength = maxTextLength) {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim()
    : "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeWeeks(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, maxWeeks).map((week) => {
    if (!Array.isArray(week)) {
      return [];
    }
    return week.slice(0, maxDaysPerWeek).map((day) => {
      const record = isRecord(day) ? day : {};
      return {
        count: nonNegativeInteger(record.count),
        future: Boolean(record.future),
        key: cleanText(record.key, 12),
        level: clampInteger(record.level, 0, 4)
      };
    });
  }).filter((week) => week.length > 0);
}

function nonNegativeInteger(value: unknown) {
  return clampInteger(value, 0, Number.MAX_SAFE_INTEGER);
}

function clampInteger(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
