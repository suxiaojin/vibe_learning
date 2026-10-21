import { evidenceNumbers, canonicalEvidenceText } from "./ai-study-card-policy";
import type { CurriculumNode } from "./ai-study-evidence";

export type GroundedCard = {
  overview: string; explanation: string; keyPoints: string[];
  pitfalls: string[]; examples: string[]; flashcards: { front: string; back: string }[];
};

export class AiStudyContentValidationError extends Error {
  name = "AiStudyContentValidationError";
}

const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");

export function formatEvidenceQuote(value: string) {
  const normal = "0123456789+-=()ni", superscript = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ", subscript = "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₙᵢ";
  return value.replace(/<(sup|sub)>([\s\S]*?)<\/\1>/gi, (_match, tag: string, body: string) => {
    if (/\[.*\]/.test(body)) return body;
    const map = tag.toLowerCase() === "sup" ? superscript : subscript;
    return [...body].every((character) => normal.includes(character)) ? [...body].map((character) => map[normal.indexOf(character)]).join("") : `${tag.toLowerCase() === "sup" ? "^" : "_"}(${body})`;
  });
}

// These checks enforce source fidelity, not universal scientific correctness.
export function assertEvidenceFidelity(generated: string, evidence: string, options: { isTitle?: boolean; claimEvidence?: string; skipClaimHeuristics?: boolean } = {}) {
  const original = normalize(evidence);
  const claimEvidence = options.claimEvidence ?? evidence;
  const originalNumbers = evidenceNumbers(evidence);
  const inventedNumbers = [...evidenceNumbers(generated)].filter((value) => !originalNumbers.has(value));
  if (inventedNumbers.length) throw new Error(`讲解新增或改写了原文数字：${inventedNumbers.join("、")}。只能使用本节证据中存在的数值。`);
  const originalQuantities=normalize(canonicalEvidenceText(evidence)), outputQuantities=normalize(canonicalEvidenceText(generated));
  const measures = outputQuantities.match(/\d+(?:\.\d+)?(?:小时|分钟|秒|年|个月|天|度|千米|公里|米|厘米|毫米|千克|克|毫克|%|％)/g) ?? [];
  for (const measure of measures) if (!originalQuantities.includes(measure) && !(/^\d{4}年$/.test(measure) && new RegExp(`${measure.slice(0,-1)}[./年]\\d{1,2}`).test(originalQuantities))) throw new Error(`讲解数值或单位与证据不一致：${measure}`);
  const compoundTimes = outputQuantities.match(/(?:\d+(?:\.\d+)?(?:小时|分钟|秒|天)){2,}/g) ?? [];
  for (const compound of compoundTimes) if (!originalQuantities.includes(compound)) throw new Error(`讲解重组了原文的复合时间数值：${compound}`);
  const statements = generated.split(/[。！？；\n]/).filter(Boolean);
  const sourceContinuous = /(?:电子|β粒子|β衰变)[^。；\n]{0,35}(?:能量|能谱)[^。；\n]{0,35}(?:连续|范围[^。；\n]{0,12}变化)/.test(claimEvidence.replace(/(?:不|不是|并非)连续/g, ""));
  const observedNeutronStars = /(?:已经|已|成功)(?:观测|探测)到[^。；\n]{0,40}中子星|而是来自两个中子星的合并/.test(normalize(claimEvidence));
  for (const claim of statements) {
    const normalized = normalize(claim);
    const corrective = /误以为|误认为|误解|错误|并非不连续|不是不连续|不能(?:说|认为|理解为)/.test(claim);
    if (sourceContinuous && !corrective && /(?:能量|能谱)[^。；]{0,12}(?:不连续|不是连续|离散)/.test(claim) && (!/α|γ/.test(claim) || /电子|β/.test(claim))) throw new Error("讲解把电子能量连续分布改成了离散或不连续。");
    if (observedNeutronStars && !/当时|此前|早期|过去|曾经|以前|之前/.test(claim) && /(?:只能|只有|仅有)[^。；]{0,10}(?:探测|观测)[^。；]{0,10}黑洞|(?:探测|观测)[^。；]{0,10}(?:只有|仅有)[^。；]{0,6}黑洞/.test(claim)) throw new Error("原文已列出中子星合并观测，不能写目前只能探测黑洞。");
    if (!corrective && /近[^。；]{0,20}快|远[^。；]{0,20}慢|椭圆|开普勒/.test(claimEvidence) && !/匀速.{0,3}圆周/.test(claimEvidence) && /(?:行星|引力)[^。；]{0,15}(?:不改变速度大小|只改变(?:速度|运动)?方向)/.test(normalized)) throw new Error("讲解把一般行星运动误写成引力不改变速度大小或只改变方向。");
  }
  for (const formula of generated.match(/\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g) ?? []) {
    if (!original.includes(normalize(formula))) throw new Error("讲解新增或改写了资料公式，请直接保留原公式。");
  }
  const conditional = /只有|仅在|假设|理想|匀速圆周|如果|当.*时/;
  const uncertain = /可能|假说|推测|猜测|尚不|尚未|未必|争议/;
  if (!options.isTitle && !options.skipClaimHeuristics) {
    const sourceClaims = claimEvidence.split(/[。！？；\n]/).map((value) => value.trim()).filter(Boolean);
    const pairs = (value: string) => {
      const clean = normalize(value).replace(/[\p{P}\p{S}]/gu, "");
      return new Set(Array.from({ length: Math.max(0, clean.length - 1) }, (_, index) => clean.slice(index, index + 2)));
    };
    const sourcePairs = sourceClaims.map(pairs);
    for (const claim of generated.split(/[。！？；\n]/).filter(Boolean)) {
      const words = pairs(claim);
      const ranked = sourceClaims.map((source, index) => ({ source, hits: [...words].filter((word) => sourcePairs[index].has(word)).length })).sort((a, b) => b.hits - a.hits);
      const closest = ranked[0];
      if (!closest || closest.hits < 2) continue;
      if (conditional.test(closest.source) && /不改变|恒定|总是|必然/.test(claim) && !conditional.test(generated)) throw new Error("讲解把条件性结论写成了无条件结论，请保留适用条件。");
      if (uncertain.test(closest.source) && /证明了|证实了|确定了|已经(?:明确|确定)/.test(claim) && !uncertain.test(claim) && !/不能(?:说|认为)|并未|尚未|没有|未能/.test(claim)) throw new Error("讲解把推测或争议写成了确定结论，请保留不确定性。");
    }
  }
}

export function buildDirectoryCard(node: CurriculumNode, children: CurriculumNode[]): GroundedCard {
  if (node.depth >= 3) throw new Error("第4层必须生成有证据的教学详解。");
  if (!children.length) throw new Error(`目录节点没有下层内容：${node.title}`);
  return { overview: `本部分包含：${children.map((child) => child.title).join("、")}。请选择下层知识点学习。`, explanation: "", keyPoints: children.map((child) => child.title), pitfalls: [], examples: [], flashcards: [] };
}
