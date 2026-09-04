import katex from "katex";

const htmlEntityMap: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&#39;": "'",
  "&nbsp;": " "
};

const mathDelimiterPattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
const mathDelimiterCheckPattern = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$/;
const invalidFormulaPreview = '<span role="note" aria-label="公式识别异常，请检查原始内容" title="公式识别异常，请检查原始内容" style="color:#b45309;font-weight:600;">公式识别异常</span>';

function decodeFormulaHtml(value: string) {
  return value.replace(/&(amp|lt|gt|quot|#039|#39|nbsp);/g, (entity) => htmlEntityMap[entity] || entity);
}

function renderMathTextSegment(value: string) {
  return value.replace(
    mathDelimiterPattern,
    (source, blockDollar: string | undefined, blockBracket: string | undefined, inlineBracket: string | undefined, inlineDollar: string | undefined) => {
      const formula = blockDollar ?? blockBracket ?? inlineBracket ?? inlineDollar ?? "";
      if (!formula.trim()) {
        return source;
      }

      try {
        return katex.renderToString(decodeFormulaHtml(formula.trim()), {
          displayMode: blockDollar !== undefined || blockBracket !== undefined,
          output: "htmlAndMathml",
          strict: "ignore",
          throwOnError: true,
          trust: false
        });
      } catch {
        return invalidFormulaPreview;
      }
    }
  );
}

export function hasLatexMath(value: string) {
  return mathDelimiterCheckPattern.test(value || "");
}

export function renderLatexInHtml(value: string) {
  if (!value || !hasLatexMath(value)) {
    return value || "";
  }

  return value
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith("<") ? part : renderMathTextSegment(part)))
    .join("");
}

export function renderMathPlainText(value: string) {
  const escaped = (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return renderLatexInHtml(escaped).replace(/\r?\n/g, "<br />");
}
