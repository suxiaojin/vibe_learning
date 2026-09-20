const safeAiRichTextTagPattern = /<\/?(?:p|br|ol|ul|li|strong|sub|sup)\s*\/?>/gi;
const outerHtmlFencePattern = /^```(?:html)?\s*([\s\S]*?)\s*```$/i;

export const liveAiFormulaInstruction = [
  "数学公式、化学式、离子、电荷、上下标必须使用 LaTeX，并放在单个美元符号中，例如 $c_a \\cdot K_a \\ge 10^{-8}$、$\\mathrm{H_2O}$、$\\mathrm{Fe^{3+}}$。",
  "不要把公式写成未包裹的 c_a、K_a、10^(-8)，也不要使用 HTML 标签。",
  "普通文字继续使用 Markdown；不要使用代码块包裹公式或整段回答。"
].join("\n");

export const adminAiFormulaInstruction = [
  "输出可直接放入富文本编辑器的 HTML 片段，不要输出 Markdown、LaTeX、代码围栏或完整 html/body 标签。",
  "只允许使用 p、br、ol、ul、li、strong、sub、sup 标签，并且所有标签都不能带属性。",
  "数学公式和化学式必须使用 sub、sup 表达上下标，例如 c<sub>a</sub>·K<sub>a</sub> ≥ 10<sup>−8</sup>、H<sub>2</sub>O、Fe<sup>3+</sup>。",
  "不要把公式写成 c_a、K_a、10^(-8) 或美元符号包裹的 LaTeX。"
].join("\n");

export function sanitizeAdminAiDoubtHtml(value: string) {
  const withoutFence = String(value || "").trim().replace(outerHtmlFencePattern, "$1").trim();
  const tags: string[] = [];
  const tokenized = withoutFence.replace(safeAiRichTextTagPattern, (tag) => {
    const name = tag.match(/^<\/?([a-z]+)/i)?.[1].toLowerCase() || "";
    const normalized = name === "br" ? "<br>" : `<${tag.startsWith("</") ? "/" : ""}${name}>`;
    const index = tags.push(normalized) - 1;
    return `AI_SAFE_TAG_${index}_END`;
  });
  const escaped = tokenized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\r?\n/g, "<br>");

  return escaped.replace(/AI_SAFE_TAG_(\d+)_END/g, (_, index: string) => tags[Number(index)] || "").trim();
}
