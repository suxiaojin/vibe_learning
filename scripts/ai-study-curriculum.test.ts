import assert from "node:assert/strict";
import { assembleCurriculum, buildEvidenceUnits, buildLearningTopics, validateEvidenceTitle, curriculumDirectorySchema, curriculumFingerprint, evidenceDecisionSchema, evidenceSentences, generateEvidenceCurriculum, paginateLearningTopics, parseCurriculumDirectory, parseEvidenceDecisions, parseEvidencePlan, type EvidenceDecision } from "../src/lib/ai-study-curriculum";
import { AiStudyContentValidationError, assertEvidenceFidelity, buildDirectoryCard, formatEvidenceQuote, groundedCardMessages, groundedCardSchema, parseGroundedCard, processAiStudyCardBatch } from "../src/lib/ai-study-grounded-card";

async function main() {
  const sources = Array.from({ length: 112 }, (_, index) => ({
    id: `source_${index}`, pageStart: index + 1, pageEnd: index + 1,
    content: `主题${index}讨论独立学习机制${index}。原文中的定义、条件和证据都应该保留，不应被相邻主题代替。`
  }));
  const units = buildEvidenceUnits(sources);
  const assignments: Record<string, EvidenceDecision> = Object.fromEntries(units.map((unit, index) => [unit.id, { topics: [{ title: `独立学习机制${index}`, anchor: unit.text }], exclusion: "" }]));
  const parsed = parseEvidenceDecisions(JSON.stringify({ assignments }), units);
  const topics = buildLearningTopics(units, parsed);
  const directory = Object.fromEntries(topics.map((topic, index) => [topic.id, { moduleTitle: `领域${Math.floor(index / 20)}`, groupTitle: `机制组${Math.floor(index / 4)}` }]));
  const curriculum = assembleCurriculum("长篇资料", units, parsed, topics, directory);
  assert.equal(curriculum.topics.length, 112);
  assert.ok(curriculum.nodes.length > 60);
  assert.equal(curriculum.nodes.filter((node) => node.depth === 3).length, 112);
  assert.equal(new Set(curriculum.topics.flatMap((topic) => topic.objectives.map((objective) => objective.unitId))).size, units.length);
  assert.equal(curriculum.nodes[0].sourceChunkIds.length, 112);
  for (const node of curriculum.nodes.filter((node) => node.depth < 3)) assert.ok(curriculum.nodes.some((child) => child.parentClientId === node.clientId));
  const missing53 = { ...directory };
  topics.slice(0, 53).forEach((topic) => delete missing53[topic.id]);
  assert.throws(() => parseCurriculumDirectory(JSON.stringify({ assignments: missing53 }), topics), /不完整/);
  const missingOne = { ...directory }; delete missingOne[topics[5].id];
  assert.throws(() => parseCurriculumDirectory(JSON.stringify({ assignments: missingOne }), topics), /不完整/);
  assert.throws(() => parseCurriculumDirectory(JSON.stringify({ assignments: { ...directory, fabricated: directory[topics[0].id] } }), topics), /未知/);
  assert.equal((curriculumDirectorySchema(topics) as any).properties.assignments.required.length, 112);
  assert.deepEqual(parseCurriculumDirectory(JSON.stringify({ assignments: { [topics[0].id]: "领域0 → 机制组0" } }), topics.slice(0, 1), [directory[topics[0].id]])[topics[0].id], directory[topics[0].id]);
  assert.throws(() => parseCurriculumDirectory(JSON.stringify({ assignments: { [topics[0].id]: "未知 → 分组" } }), topics.slice(0, 1), [directory[topics[0].id]]), /不属于/);
  assert.equal((evidenceDecisionSchema(units) as any).properties.assignments.required.length, 112);
  assert.equal(validateEvidenceTitle("能量的质量", "这里说的是能量的“质量”。"), "能量的质量");
  assert.equal(validateEvidenceTitle("圆锥切割", "Illustration: a plane cuts through a cone."), "圆锥切割");
  assert.equal(validateEvidenceTitle("光速恒定", "如果观察者运动，光速仍然保持恒定。"), "光速恒定");
  assert.throws(() => validateEvidenceTitle("3氦过程与重元素合成", "弱力可以将中子转化为质子，因此参与β衰变。X射线是一种高能形式的光。"), /数字/);
  assert.throws(() => validateEvidenceTitle("图片内容：Illustration", "图片内容：Illustration"), /图片标签/);
  assert.equal(validateEvidenceTitle("一个国家的比较优势", "比较优势决定一个国家的贸易分工。"), "一个国家的比较优势");
  const wire = { assignments: { [units[0].id]: { sentences: { [evidenceSentences(units[0])[0].id]: ["独立学习机制0"] } } } };
  assert.equal(parseEvidencePlan(JSON.stringify(wire), units.slice(0, 1))[units[0].id].topics[0].anchor, units[0].text);
  wire.assignments[units[0].id].sentences = { [evidenceSentences(units[1])[0].id]: ["未知摘句"] };
  assert.throws(() => parseEvidencePlan(JSON.stringify(wire), units.slice(0, 1)), /未知/);
  assert.throws(() => parseEvidencePlan(JSON.stringify({ assignments: { [units[0].id]: { sentences: { [evidenceSentences(units[0])[0].id]: [] } } } }), units.slice(0, 1)), /正文未提取/);
  assert.throws(() => parseEvidencePlan(JSON.stringify({ assignments: { [units[0].id]: { sentences: { [evidenceSentences(units[0])[0].id]: ["周期25小时"] } } } }), units.slice(0, 1)), /不匹配|数字/);
  assert.throws(() => assembleCurriculum("资料", units, parsed, topics, directory, 60), /不会为凑上限删除主题/);
  const altered = JSON.parse(JSON.stringify(assignments)); altered[units[0].id].topics[0].anchor = "模型编造的引文";
  assert.throws(() => parseEvidenceDecisions(JSON.stringify({ assignments: altered }), units), /逐字/);
  const omitted = { ...assignments }; delete omitted[units[2].id];
  assert.throws(() => parseEvidenceDecisions(JSON.stringify({ assignments: omitted }), units), /不完整/);
  const excluded = JSON.parse(JSON.stringify(assignments)); excluded[units[0].id] = { topics: [], exclusion: "navigation" };
  assert.throws(() => parseEvidenceDecisions(JSON.stringify({ assignments: excluded }), units), /必须提取/);
  const changedSameLength = sources.map((source, index) => index ? source : { ...source, content: source.content.replace("独立", "不同") });
  assert.notEqual(curriculumFingerprint(units), curriculumFingerprint(buildEvidenceUnits(changedSameLength)));

  const long = "完整的条件句和公式必须保留。".repeat(300);
  const split = buildEvidenceUnits([{ id: "long", pageStart: 1, pageEnd: 5, content: long }]);
  assert.equal(split.map((unit) => unit.text).join(""), long);
  assert.ok(split.every((unit) => unit.text.length <= 6000));
  const isolated = buildEvidenceUnits([{ id: "same-page", pageStart: 1, pageEnd: 1, content: "", evidenceBlocks: [
    { id: "black-hole", content: "质量相当于142个太阳的黑洞填补了中等质量黑洞的观测空白。", pageNumber: 1, blockType: "text" },
    { id: "neutron-star", content: "2017年中子星合并产生引力波并伴随光信号。", pageNumber: 1, blockType: "text" }
  ] }]);
  assert.equal(isolated.length, 2);
  assert.ok(isolated.every((unit) => unit.sourceBlockIds.length === 1));
  assert.ok(!isolated[1].text.includes("142"));
  const formula = buildEvidenceUnits([{ id: "formula-source", pageStart: 1, pageEnd: 1, content: "", evidenceBlocks: [
    { id: "definition", content: "能量与质量的关系由如下公式表示。", pageNumber: 1, blockType: "text" },
    { id: "equation", content: "$$E=mc^2$$", pageNumber: 1, blockType: "equation" }
  ] }]);
  assert.equal(formula.length, 1); assert.deepEqual(formula[0].sourceBlockIds, ["definition", "equation"]);
  const shared = { id: "shared-block", content: "共享段落的定义必须保留，不能因多个片段引用而重复提取。", pageNumber: 1, blockType: "text" };
  const deduplicated = buildEvidenceUnits(["chunk-a", "chunk-b"].map((id) => ({ id, pageStart: 1, pageEnd: 1, content: "", evidenceBlocks: [shared] })));
  assert.equal(deduplicated.length, 1); assert.deepEqual(deduplicated[0].sourceChunkIds, ["chunk-a", "chunk-b"]);
  const repeating = Object.fromEntries(units.map((unit) => [unit.id, { topics: [{ title: "同一主题", anchor: unit.text }], exclusion: "" as const }]));
  const repeatedTopics = paginateLearningTopics(buildLearningTopics(units, repeating), units);
  assert.equal(repeatedTopics.flatMap((topic) => topic.objectives).length, 112);
  assert.ok(repeatedTopics.every((topic) => topic.objectives.length <= 6));
  assert.throws(() => assembleCurriculum("漏目标", units, parsed, topics.slice(1), Object.fromEntries(topics.slice(1).map((topic) => [topic.id, directory[topic.id]]))), /丢失/);

  assert.throws(() => assertEvidenceFidelity("间隔为25小时53分钟。", "间隔为24小时53分钟。"), /数字|单位/);
  assert.throws(() => assertEvidenceFidelity("间隔为25小时53分钟。", "差不多25小时，具体为24小时53分钟。"), /复合时间/);
  assert.throws(() => assertEvidenceFidelity("24分钟53小时。", "24小时53分钟。"), /单位/);
  assert.throws(() => assertEvidenceFidelity("β衰变电子能量不连续。", "β衰变电子能量呈连续分布。"), /不连续/);
  assert.doesNotThrow(() => assertEvidenceFidelity("原子中电子的能量是离散的。", "原子中电子的能量是离散的。"));
  assert.doesNotThrow(() => assertEvidenceFidelity("电磁波的传播必然涉及电场和磁场的联系。", "电磁波传播中电场和磁场相互联系。"));
  assert.throws(() => assertEvidenceFidelity("行星引力不改变速度大小。", "近太阳时行星更快，远离时更慢。"), /不改变/);
  assert.throws(() => assertEvidenceFidelity("目前只能探测黑洞合并。", "已经观测到黑洞和中子星合并。"), /只能/);
  assert.throws(() => assertEvidenceFidelity("这一发现证明了结论。", "这一结论尚存争议，可能只是猜测。"), /推测|争议/);
  assert.doesNotThrow(() => assertEvidenceFidelity("2017年的观测证实了中子星合并与γ射线暴的联系。", "黑洞的形成可能涉及更早的合并，这仍是一种假说。2017年的观测记录了中子星合并与γ射线暴的联系。"));
  assert.doesNotThrow(() => assertEvidenceFidelity("这些化石证实了祖先直立行走的事实。", "直立行走起源可能来自树栖生活。脚印化石表明祖先已经开始直立行走。", { claimEvidence: "脚印化石表明祖先已经开始直立行走。" }));
  assert.throws(() => assertEvidenceFidelity("人类直立行走的起源已经确定发生在树上。", "人类直立行走的起源可能是在树上，这仍是假说。"), /推测|争议/);
  assert.doesNotThrow(() => assertEvidenceFidelity("在匀速圆周运动的假设下，只改变方向。", "假设匀速圆周运动，只改变方向。"));
  assert.doesNotThrow(() => assertEvidenceFidelity("所有恒星的能量总和的150倍。", "所有恒星能量总和的150倍。"));

  const topic = topics[0], unit = units[0], objective = topic.objectives[0];
  const legacyPrompt = { id: "legacy", version: "old", versionNumber: 14, render: (key: string, variables: Record<string, unknown> = {}) => key === "card.instruction.level4" ? "必须800字并编写生活案例" : key === "card.user" ? `${variables.cardInstruction}\n${variables.sourceChunks}` : "旧教学风格" };
  const effectiveMessages = groundedCardMessages("兼容旧模板", topic, units, legacyPrompt);
  assert.ok(!effectiveMessages[1].content.includes("必须800字"));
  assert.ok(effectiveMessages[1].content.includes("40-400"));
  assert.ok(effectiveMessages[0].content.includes("当时的认识"));
  const explanation = "这个主题讨论的是独立学习机制中定义、条件与证据的关系。理解时首先要区分资料给出的定义与适用条件，再结合证据理解这些条件如何限制结论。原文没有展开具体的操作步骤，因此应当把这里的内容作为学习范围说明，而不能据此补出额外的机制细节。进一步学习时，可以围绕原文的定义和条件逐项核对，避免把相邻主题的解释当作当前主题的证据。";
  const valid = { sections: { [objective.id]: { heading: "定义、条件与证据", explanation } } };
  const card = parseGroundedCard(JSON.stringify(valid), topic, units);
  assert.ok(card.explanation.includes(unit.text));
  assert.ok(card.explanation.includes("第1页"));
  assert.equal(card.overview, explanation);
  const concise = "本段只说明独立学习机制的定义、条件与证据之间存在联系。资料没有给出具体操作步骤，不能据此补写实施机制或把相邻主题当作解释。";
  assert.ok(concise.length < 100);
  assert.doesNotThrow(() => parseGroundedCard(JSON.stringify({ sections: { [objective.id]: { heading: "定义与边界", explanation: concise } } }), topic, units));
  assert.ok(!card.explanation.includes("###"));
  assert.equal(formatEvidenceQuote("mc<sup>2</sup>、CO<sub>2</sub>和W<sup>+</sup>、注<sup>[1]</sup>"), "mc²、CO₂和W⁺、注[1]");
  assert.deepEqual(card.keyPoints, [objective.title]);
  const sharedTopic = { ...topic, objectives: [objective, { ...objective, id: "objective_shared", unitId: "unit_shared", anchor: "这个主题的另一段证据给出70%的比例，并进一步讨论定义与条件。" }] };
  const sharedUnits = [...units, { ...unit, id: "unit_shared", text: sharedTopic.objectives[1].anchor }];
  const sharedSection = `${explanation}本卡另一段原文还给出70%的比例，理解时应结合其定义与条件。`;
  const sharedCard = parseGroundedCard(JSON.stringify({ sections: Object.fromEntries(sharedTopic.objectives.map((item) => [item.id, { heading: "定义与条件", explanation: sharedSection }])) }), sharedTopic, sharedUnits);
  assert.ok(sharedCard.explanation.includes("70%"));
  assert.equal(sharedCard.explanation.match(/【本卡原文依据】/g)?.length, 1);
  assert.equal((groundedCardSchema(topic) as any).properties.sections.required.length, 1);
  assert.throws(() => parseGroundedCard(JSON.stringify(valid).slice(0, -2), topic, units));
  assert.throws(() => parseGroundedCard('{"sections":{}}', topic, units), /逐项覆盖/);
  assert.throws(() => parseGroundedCard(JSON.stringify({ sections: { [objective.id]: { heading: "风险投资", explanation: "想象一下身体改变就是大胆的风险投资。" } } }), topic, units));
  assert.throws(() => parseGroundedCard(JSON.stringify({ sections: { [objective.id]: { heading: "学习建议", explanation: "学习是一段美好的旅程，每一次探索都会帮助我们成长。".repeat(8) } } }), topic, units), /未回应|重复/);
  assert.throws(() => parseGroundedCard(JSON.stringify({ sections: { [objective.id]: { heading: "条件与证据", explanation: "定义与适用条件之间的关系应结合原文证据理解，不能把不同的独立学习机制混淆。".repeat(4) } } }), topic, units), /重复/);
  for (const node of curriculum.nodes.filter((node) => node.depth < 3)) assert.equal(buildDirectoryCard(node, curriculum.nodes.filter((child) => child.parentClientId === node.clientId)).explanation, "");

  let calls = 0, saves = 0;
  const resumed = await generateEvidenceCurriculum({
    projectTitle: "续做验证", sources: sources.slice(0, 1),
    checkpoint: { fingerprint: curriculumFingerprint(units.slice(0, 1)), decisions: { [unit.id]: assignments[unit.id] }, taxonomy: [directory[topic.id]] },
    saveCheckpoint: async () => { saves++; },
    request: async (call) => {
      calls++; assert.match(call.stage, /organizing_topics/);
      assert.deepEqual(call.inputIds, [topic.id]);
      const response = JSON.stringify({ assignments: { p1: "领域0 → 机制组0" } });
      call.validateContent(response); return response;
    }
  });
  assert.equal(calls, 1); assert.equal(saves, 1); assert.equal(resumed.topics.length, 1);
  const metadataSources = [
    { id: "book-name", pageStart: 1, pageEnd: 1, content: "书名：薛兆丰经济学讲义" },
    { id: "bibliography", pageStart: 2, pageEnd: 2, content: "卡尔·萨根.宇宙[M].陈冬妮，译.广西：广西科学技术出版社，2016：106." },
    { id: "publication-note", pageStart: 2, pageEnd: 2, content: "[1] 本书简体中文版由中信出版社于2008年11月出版。——编者注" },
    { id: "image-asset", pageStart: 2, pageEnd: 2, content: "", evidenceBlocks: [{ id: "asset", pageNumber: 2, blockType: "image", content: `图片：ai-study/${"file-path/".repeat(25)}image.png` }] },
    { id: "header-definition", pageStart: 2, pageEnd: 2, content: "", evidenceBlocks: [{ id: "header-fact", pageNumber: 2, blockType: "header", content: "能量守恒定律：能量不能凭空产生，也不能凭空消失。" }] },
    { id: "actual-fact", pageStart: 3, pageEnd: 3, content: "第一条跨大西洋电报电缆于1866年铺设，展示了电磁信号的远距离传输。" }
  ];
  const metadataUnits = buildEvidenceUnits(metadataSources);
  const staleDecisions = Object.fromEntries(metadataUnits.map((item) => [item.id, { topics: [{ title: "参考文献", anchor: item.text }], exclusion: "" as const }]));
  const repairCalls: string[] = [];
  const repaired = await generateEvidenceCurriculum({ projectTitle: "缓存分类验证", sources: metadataSources,
    checkpoint: { fingerprint: curriculumFingerprint(metadataUnits), decisions: staleDecisions, taxonomy: [{ moduleTitle: "旧目录", groupTitle: "旧分类" }] },
    request: async (call) => {
      repairCalls.push(call.stage);
      const input = JSON.parse(call.messages[1].content);
      const result = call.stage.startsWith("planning_evidence")
        ? { assignments: Object.fromEntries(input.evidence.map((item: any) => [item.id, { sentences: Object.fromEntries(item.sentences.map((sentence: any) => [sentence.id, [sentence.text.includes("能量") ? "能量守恒" : "电磁信号传输"]])) }])) }
        : call.stage === "organizing_taxonomy" ? { groups: [{ moduleTitle: "物理", groupTitle: "电磁" }] }
        : { assignments: Object.fromEntries(input.topics.map((item: any) => [item.id, "物理 → 电磁"])) };
      const response = JSON.stringify(result); call.validateContent(response); return response;
    }
  });
  assert.equal(repaired.topics.length, 2);
  assert.equal(Object.values(repaired.decisions).filter((item) => item.exclusion === "publication_metadata").length, 3);
  assert.equal(Object.values(repaired.decisions).filter((item) => item.exclusion === "supporting_material").length, 1);
  assert.ok(repairCalls.includes("organizing_taxonomy"));
  assert.equal(repaired.nodes.find((item) => item.depth === 1)?.title, "物理");
  let truncated = false;
  const splitReplay = await generateEvidenceCurriculum({ projectTitle: "截断自动拆批", sources: sources.slice(0, 2), request: async (call) => {
    const input = JSON.parse(call.messages[1].content);
    if (call.stage.startsWith("planning_evidence")) {
      if (input.evidence.length > 1) { truncated = true; throw new Error("输出截断"); }
      const response = JSON.stringify({ assignments: Object.fromEntries(input.evidence.map((item: any) => [item.id, { sentences: Object.fromEntries(item.sentences.map((sentence: any) => [sentence.id, [sentence.text.includes("独立学习机制0") ? "独立学习机制0" : "独立学习机制1"]])) }])) });
      call.validateContent(response); return response;
    }
    const response = call.stage === "organizing_taxonomy" ? JSON.stringify({ groups: [{ moduleTitle: "模块", groupTitle: "分组" }] }) : JSON.stringify({ assignments: Object.fromEntries(input.topics.map((item: any) => [item.id, { moduleTitle: "模块", groupTitle: "分组" }])) });
    call.validateContent(response); return response;
  } });
  assert.equal(truncated, true); assert.equal(splitReplay.topics.length, 2);
  assert.deepEqual(splitReplay.nodes[0].sourceChunkIds, ["source_0", "source_1"]);
  assert.deepEqual(splitReplay.topics.map((item) => item.objectives[0].unitId), units.slice(0, 2).map((unit) => unit.id));
  const persisted: string[] = [], invalid: string[] = [];
  const failedCards = await processAiStudyCardBatch(["first", "invalid", "last"], async (id) => {
    if (id === "invalid") throw new AiStudyContentValidationError("内容校验失败");
    persisted.push(id);
  }, async (id) => { invalid.push(id); });
  assert.deepEqual(persisted, ["first", "last"]);
  assert.deepEqual(failedCards, ["invalid"]);
  assert.deepEqual(invalid, ["invalid"]);
  const attempted: string[] = [];
  await assert.rejects(processAiStudyCardBatch(["first", "offline", "last"], async (id) => {
    attempted.push(id); if (id === "offline") throw new Error("fetch failed");
  }, async () => { throw new Error("Transport errors must not be classified as bad content"); }), /fetch failed/);
  assert.deepEqual(attempted, ["first", "offline"]);
  await assert.rejects(processAiStudyCardBatch(["invalid", "last"], async () => { throw new AiStudyContentValidationError("invalid"); }, async () => { throw new Error("database unavailable"); }), /database unavailable/);
  console.log("ai-study curriculum and grounded-card regression tests passed (coverage, fidelity, malformed JSON, hierarchy, checkpoint)");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
