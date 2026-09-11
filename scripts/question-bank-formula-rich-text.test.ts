import assert from "node:assert/strict";
import { formatAiExplainAnswer, formatAiExplainOptions } from "../src/lib/ai-explain-prompt-template";
import { answersEqual } from "../src/lib/learning";
import {
  normalizeRichTextAnswer,
  richTextToAiText,
  richTextToPlainText,
  richTextValueToAiText
} from "../src/lib/rich-text-plain";

assert.equal(richTextToPlainText("H<sub>2</sub>SO<sub>4</sub>"), "H2SO4");
assert.equal(richTextToPlainText("Ag<sup>+</sup> + e<sup>−</sup> → Ag"), "Ag+ + e− → Ag");
assert.equal(richTextToPlainText("10<sup>−10</sup> &lt; 10<sup>−5</sup>"), "10−10 < 10−5");
assert.equal(richTextToAiText("K<sub>sp</sub>(AgCl)=10<sup>−10</sup>"), "K_(sp)(AgCl)=10^(−10)");
assert.equal(richTextToAiText("φ<sup>θ</sup>(Cu<sup>2+</sup>/Cu)"), "φ^(θ)(Cu^(2+)/Cu)");
assert.equal(richTextToAiText("φ<sup>θ</sup>(Cu<sup>2+</sup>/Cu)"), "φ^(θ)(Cu^(2+)/Cu)");
assert.equal(normalizeRichTextAnswer("H<sub>2</sub>SO<sub>4</sub>"), "H2SO4");
assert.equal(answersEqual(["H2SO4"], ["H<sub>2</sub>SO<sub>4</sub>"]), true);

assert.deepEqual(
  richTextValueToAiText([{ key: "A", text: "HNO<sub>3</sub>" }]),
  [{ key: "A", text: "HNO_(3)" }]
);
assert.equal(
  formatAiExplainOptions([{ key: "B", text: "Cu<sup>2+</sup>" }]),
  "B. Cu^(2+)"
);
assert.equal(formatAiExplainAnswer(["Ag<sup>+</sup>", "H<sub>2</sub>O"]), "Ag^(+)、H_(2)O");

console.log("question-bank formula rich-text checks passed: 10");
