export const studentLearningFontFamilies = [
  {
    value: "system",
    label: "系统默认",
    css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
  },
  {
    value: "rounded",
    label: "圆润",
    css: 'ui-rounded, "Arial Rounded MT Bold", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
  },
  {
    value: "clear",
    label: "清晰",
    css: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif'
  }
] as const;

export const studentLearningFontSizeMin = 10;
export const studentLearningFontSizeMax = 18;
export const studentLearningFontSizeDefault = 16;

export type StudentLearningFontFamily = (typeof studentLearningFontFamilies)[number]["value"];
export type StudentLearningFontSize = string;

export function isStudentLearningFontFamily(value: string): value is StudentLearningFontFamily {
  return studentLearningFontFamilies.some((option) => option.value === value);
}

export function isStudentLearningFontSize(value: string): boolean {
  const pixels = Number(value);
  return value.trim() !== "" && Number.isInteger(pixels) && pixels >= studentLearningFontSizeMin && pixels <= studentLearningFontSizeMax;
}

export function getStudentLearningFontFamilyCss(value: string) {
  return studentLearningFontFamilies.find((option) => option.value === value)?.css ?? studentLearningFontFamilies[0].css;
}

export function getStudentLearningFontSizePixels(value: string) {
  return isStudentLearningFontSize(value) ? Number(value) : studentLearningFontSizeDefault;
}
