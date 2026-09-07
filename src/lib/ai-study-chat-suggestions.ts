export type AiStudyOpeningSuggestionInput = {
  depth: number;
  title: string;
  summary: string;
  cardOverview: string;
  cardKeyPoints: readonly string[];
};

export function buildAiStudyOpeningSuggestions({
  depth,
  title,
  summary,
  cardOverview,
  cardKeyPoints
}: AiStudyOpeningSuggestionInput): [string, string] {
  const shortTitle = compactContext(title || "这个知识点", 14) || "这个知识点";
  const focus = pickContextFocus(cardKeyPoints, cardOverview, summary, shortTitle);

  if (depth <= 0) {
    return [
      `怎么梳理“${shortTitle}”的整体框架？`,
      `“${focus}”为什么值得优先学？`
    ];
  }

  if (depth === 1) {
    return [
      `“${shortTitle}”在整体框架中起什么作用？`,
      `“${focus}”和本模块其他内容有何联系？`
    ];
  }

  if (depth === 2) {
    return [
      `“${shortTitle}”包含哪些关键概念？`,
      `理解“${focus}”时最容易混淆什么？`
    ];
  }

  return [
    `“${shortTitle}”的核心原理是什么？`,
    `用“${focus}”举个具体例子？`
  ];
}

function pickContextFocus(
  cardKeyPoints: readonly string[],
  cardOverview: string,
  summary: string,
  shortTitle: string
) {
  const candidates = [...cardKeyPoints, cardOverview, summary];
  for (const candidate of candidates) {
    const focus = compactContext(candidate, 18);
    if (focus && focus !== shortTitle && !shortTitle.includes(focus)) {
      return focus;
    }
  }
  return shortTitle;
}

function compactContext(value: string, maxLength: number) {
  const normalized = value
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~]/g, " ")
    .replace(/(^|\s)(?:[-+•·]|\d+[.、)])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .split(/[。！？；]/, 1)[0]
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}…`;
}
