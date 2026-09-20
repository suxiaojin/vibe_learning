import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MathMarkdownText } from "../src/components/math-markdown-text";
import { normalizeAiMathDelimiters } from "../src/lib/ai-math-delimiters";

function render(content: string) {
  return renderToStaticMarkup(<MathMarkdownText>{content}</MathMarkdownText>);
}

function formulaCount(html: string) {
  return (html.match(/class="katex"/g) || []).length;
}

// Exact formula syntax from the user's stored AI answer, not simplified prompt examples.
const equations = [
  "Q = c(\\mathrm{Ag^+}) \\cdot c(\\mathrm{X^-}) \\ge K_{sp}",
  "c(\\mathrm{Cl^-}) = c(\\mathrm{Br^-}) = c(\\mathrm{I^-})",
  "c(\\mathrm{Ag^+}) = \\frac{K_{sp}}{c(\\mathrm{X^-})}",
  "K_{sp}(\\mathrm{AgCl}) = 1.8 \\times 10^{-10}",
  "K_{sp}(\\mathrm{AgBr}) = 5.3 \\times 10^{-13}",
  "K_{sp}(\\mathrm{AgI}) = 8.3 \\times 10^{-17}",
  "\\mathrm{AgI} < \\mathrm{AgBr} < \\mathrm{AgCl}",
  "\\mathrm{AgI} \\rightarrow \\mathrm{AgBr} \\rightarrow \\mathrm{AgCl}",
  "c(\\mathrm{Ag^+}) = \\frac{K_{sp}}{c(\\mathrm{X^-})}"
];
const storedAnswer = "### 沉淀条件\n\n" + equations.map(eq => "\\[\n" + eq + "\n\\]").join("\n\n");
const restored = render(storedAnswer);
assert.equal(formulaCount(restored), 9);
assert.equal((restored.match(/class="katex-display"/g) || []).length, 9);
assert.doesNotMatch(restored, /<pre>/, "display equations must not inherit the code-block background");
assert.match(restored, /<h3>沉淀条件<\/h3>/);

for (const source of [
  "$c_a \\cdot K_a \\ge 10^{-8}$",
  "$$\nc_a \\cdot K_a \\ge 10^{-8}\n$$",
  "\\(c_a \\cdot K_a \\ge 10^{-8}\\)",
  "\\[\nc_a \\cdot K_a \\ge 10^{-8}\n\\]"
]) {
  const html = render(source);
  assert.equal(formulaCount(html), 1, source);
  assert.doesNotMatch(html, /<em>/, "Markdown must not consume math subscripts");
}

const formatted = render("**$a_1 + b_2$**\n\n- $x * y * z$\n\n| 公式 |\n| --- |\n| $K_{sp}$ |");
assert.equal(formulaCount(formatted), 3);
assert.match(formatted, /<strong>/);
assert.match(formatted, /<li>/);
assert.match(formatted, /<table>/);

const ticks = String.fromCharCode(96);
const code = ticks + "\\(x\\) $y$" + ticks + "\n\n" +
  ticks.repeat(3) + "text\n\\[\nx_1\n\\]\n" + ticks.repeat(3) +
  "\n\n~~~text\n\\(y\\)\n~~~";
assert.equal(normalizeAiMathDelimiters(code), code);
assert.equal(formulaCount(render(code)), 0, "literal code examples must stay code");
const openFence = ticks.repeat(3) + "text\n\\(x\\)";
assert.equal(normalizeAiMathDelimiters(openFence), openFence);
assert.equal(formulaCount(render("file_name、[普通方括号]、(普通括号)")), 0);

const invalid = render("前文 $\\unknowncommand{x}$ 后文");
assert.match(invalid, /前文/);
assert.match(invalid, /\\unknowncommand/);
assert.match(invalid, /后文/);
assert.doesNotMatch(render("<img src=x onerror=alert(1)> $x$"), /<img/);
assert.doesNotMatch(render("$\\href{javascript:alert(1)}{x}$"), /href="javascript:/);

// Rendering every partial delimiter/body must recover when the last chunk arrives.
const streamed = "沉淀：\n\n\\[\nc(\\mathrm{Ag^+}) = \\frac{K_{sp}}{c(\\mathrm{X^-})}\n\\]";
for (let i = 1; i <= streamed.length; i++) {
  assert.doesNotThrow(() => render(streamed.slice(0, i)));
}
assert.match(render("仍在生成 \\[x"), /\\\[/);
assert.equal(formulaCount(render(streamed)), 1);
assert.equal(render(storedAnswer), restored, "history and streamed final text share identical rendering");

console.log("AI formula rendering checks passed: screenshot's 9 equations, 4 delimiters, Markdown, code, streaming, history, fallback and safety");
