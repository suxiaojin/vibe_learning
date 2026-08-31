import assert from "node:assert/strict";
import { hasLatexMath, renderLatexInHtml } from "../src/lib/math-rich-text";

const inline = renderLatexInHtml("答案是 $e^{a-b}$。");
assert.match(inline, /class="katex"/);
assert.match(inline, /答案是/);

const fraction = renderLatexInHtml("$\\frac{x^{2}}{(x-a)(x+b)}$");
assert.match(fraction, /class="mfrac"/);

const importedQuestion = renderLatexInHtml("$\\lim_{x \\to\\infty} \\left[\\frac{x^{2}}{(x-a)(x+b)}\\right]^{x}$");
assert.match(importedQuestion, /class="katex"/);
assert.doesNotMatch(importedQuestion, /\$\\lim/);

const matrix = renderLatexInHtml("$\\begin{matrix}1 &amp; 0 \\\\ 0 &amp; 1\\end{matrix}$");
assert.match(matrix, /mtable/);

const html = renderLatexInHtml("<strong>公式</strong><br>$x^2$");
assert.match(html, /^<strong>公式<\/strong><br>/);
assert.match(html, /class="katex"/);

assert.equal(renderLatexInHtml("普通 PDF 内容保持不变"), "普通 PDF 内容保持不变");
assert.equal(hasLatexMath("价格为 $100"), false);
assert.equal(hasLatexMath("$x+1$"), true);

console.log("math rich text: 8/8 passed");
