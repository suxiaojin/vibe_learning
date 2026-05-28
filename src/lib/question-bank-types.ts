export const questionBankChoiceQuestionTypes = ["single_choice", "multiple_choice"] as const;

export const questionBankRichAnswerQuestionTypes = [
  "calculation",
  "proof",
  "comprehensive",
  "term_explanation",
  "calculation_analysis",
  "practical_writing",
  "short_answer",
  "essay",
  "comprehensive_analysis",
  "material_analysis",
  "operation_record",
  "practical_operation",
  "application",
  "question_answer",
  "handwriting",
  "reading_comprehension",
  "classical_chinese_translation",
  "writing",
  "legal_document",
  "chinese_character_writing",
  "language_expression",
  "teaching_design",
  "comprehensive_essay"
] as const;

export const questionBankEditableQuestionTypes = [
  ...questionBankChoiceQuestionTypes,
  "true_false",
  "fill_blank",
  ...questionBankRichAnswerQuestionTypes
] as const;

export type QuestionBankChoiceQuestionType = (typeof questionBankChoiceQuestionTypes)[number];
export type QuestionBankRichAnswerQuestionType = (typeof questionBankRichAnswerQuestionTypes)[number];
export type QuestionBankEditableQuestionType = (typeof questionBankEditableQuestionTypes)[number];

export type QuestionBankQuestionTypeConfig = {
  type: QuestionBankEditableQuestionType;
  label: string;
};

export const questionBankTypeDefaultLabels: Record<QuestionBankEditableQuestionType, string> = {
  single_choice: "单选",
  multiple_choice: "多选",
  true_false: "判断",
  fill_blank: "填空",
  calculation: "计算",
  proof: "证明",
  comprehensive: "综合",
  term_explanation: "名词解释",
  calculation_analysis: "计算分析",
  practical_writing: "应用文写作",
  short_answer: "简答",
  essay: "论述",
  comprehensive_analysis: "综合分析",
  material_analysis: "材料分析",
  operation_record: "操作记录",
  practical_operation: "实际操作",
  application: "应用",
  question_answer: "问答",
  handwriting: "书写",
  reading_comprehension: "阅读理解",
  classical_chinese_translation: "文言文翻译",
  writing: "写作",
  legal_document: "法律文书",
  chinese_character_writing: "汉字书写",
  language_expression: "语言表达",
  teaching_design: "教学设计",
  comprehensive_essay: "综合（论述）"
};

function q(type: QuestionBankEditableQuestionType, label = questionBankTypeDefaultLabels[type]): QuestionBankQuestionTypeConfig {
  return { type, label };
}

export const defaultQuestionBankQuestionTypes = [q("single_choice"), q("multiple_choice")] as const;

export const computerQuestionBankQuestionTypes = [
  q("single_choice"),
  q("multiple_choice"),
  q("true_false"),
  q("fill_blank"),
  q("comprehensive")
] as const;

export const advancedMathQuestionBankQuestionTypes = [
  q("single_choice"),
  q("fill_blank"),
  q("calculation"),
  q("proof"),
  q("comprehensive")
] as const;

const majorQuestionBankQuestionTypes: Array<{
  keywords: string[];
  types: QuestionBankQuestionTypeConfig[];
}> = [
  {
    keywords: ["财经"],
    types: [q("single_choice"), q("multiple_choice"), q("true_false"), q("term_explanation"), q("calculation_analysis", "计算与分析"), q("practical_writing")]
  },
  {
    keywords: ["管理"],
    types: [q("single_choice"), q("multiple_choice"), q("true_false"), q("short_answer"), q("essay"), q("comprehensive_analysis"), q("material_analysis")]
  },
  {
    keywords: ["电子信息"],
    types: [q("single_choice"), q("true_false"), q("fill_blank"), q("term_explanation"), q("calculation_analysis"), q("operation_record"), q("practical_operation")]
  },
  {
    keywords: ["机械工程"],
    types: [q("single_choice"), q("multiple_choice"), q("fill_blank"), q("comprehensive_analysis"), q("true_false"), q("application")]
  },
  {
    keywords: ["化工生物"],
    types: [q("single_choice"), q("true_false"), q("fill_blank"), q("question_answer"), q("calculation"), q("short_answer")]
  },
  {
    keywords: ["文史"],
    types: [
      q("single_choice"),
      q("fill_blank"),
      q("true_false"),
      q("term_explanation"),
      q("short_answer"),
      q("essay"),
      q("handwriting"),
      q("reading_comprehension"),
      q("classical_chinese_translation"),
      q("writing")
    ]
  },
  {
    keywords: ["土木建筑"],
    types: [q("single_choice"), q("true_false"), q("short_answer"), q("calculation"), q("fill_blank")]
  },
  {
    keywords: ["新闻传播"],
    types: [q("single_choice"), q("true_false"), q("fill_blank"), q("short_answer"), q("essay"), q("term_explanation")]
  },
  {
    keywords: ["法学"],
    types: [q("single_choice"), q("multiple_choice"), q("term_explanation"), q("short_answer"), q("material_analysis"), q("legal_document")]
  },
  {
    keywords: ["教育"],
    types: [q("single_choice"), q("true_false"), q("short_answer"), q("material_analysis"), q("essay"), q("chinese_character_writing"), q("language_expression"), q("teaching_design")]
  },
  {
    keywords: ["资源环境"],
    types: [q("single_choice"), q("true_false"), q("fill_blank"), q("term_explanation"), q("short_answer"), q("calculation"), q("comprehensive_essay")]
  },
  {
    keywords: ["农林"],
    types: [q("single_choice"), q("fill_blank"), q("true_false"), q("short_answer"), q("essay")]
  },
  {
    keywords: ["食品"],
    types: [q("single_choice"), q("fill_blank"), q("true_false"), q("term_explanation"), q("short_answer"), q("essay"), q("multiple_choice")]
  }
];

function includesAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

export function resolveQuestionBankQuestionTypes(value: string): QuestionBankQuestionTypeConfig[] {
  if (includesAnyKeyword(value, ["高等数学", "大学数学"])) {
    return [...advancedMathQuestionBankQuestionTypes];
  }
  if (includesAnyKeyword(value, ["计算机"])) {
    return [...computerQuestionBankQuestionTypes];
  }

  const matchedMajor = majorQuestionBankQuestionTypes.find((item) => includesAnyKeyword(value, item.keywords));
  return matchedMajor ? matchedMajor.types : [...defaultQuestionBankQuestionTypes];
}

export function getQuestionBankTypeLabel(type: string | undefined, questionTypes: QuestionBankQuestionTypeConfig[] = []) {
  if (!type) {
    return "";
  }

  const configuredType = questionTypes.find((item) => item.type === type);
  if (configuredType) {
    return configuredType.label;
  }

  return questionBankTypeDefaultLabels[type as QuestionBankEditableQuestionType] || "题目";
}

export function isQuestionBankChoiceQuestionType(type?: string): type is QuestionBankChoiceQuestionType {
  return questionBankChoiceQuestionTypes.includes(type as QuestionBankChoiceQuestionType);
}

export function isQuestionBankRichAnswerQuestionType(type?: string): type is QuestionBankRichAnswerQuestionType {
  return questionBankRichAnswerQuestionTypes.includes(type as QuestionBankRichAnswerQuestionType);
}

export function isQuestionBankEditableQuestionType(type?: string): type is QuestionBankEditableQuestionType {
  return questionBankEditableQuestionTypes.includes(type as QuestionBankEditableQuestionType);
}
