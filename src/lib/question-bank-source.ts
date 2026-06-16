const REAL_QUESTION_BANK_TITLE_PATTERN = /\d{4}\s*年/;
const AI_QUESTION_BANK_TITLE_KEYWORD = "AI生成题库";

export function isRealQuestionBankTitle(title?: string | null) {
  return REAL_QUESTION_BANK_TITLE_PATTERN.test(title || "");
}

export function isAiGeneratedQuestionBankTitle(title?: string | null) {
  return (title || "").includes(AI_QUESTION_BANK_TITLE_KEYWORD);
}
