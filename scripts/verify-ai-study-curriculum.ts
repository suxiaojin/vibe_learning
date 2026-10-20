import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildEvidenceUnits, curriculumFingerprint, curriculumProtocol, generateEvidenceCurriculum, withCurriculumPrompt, type Curriculum, type CurriculumCall } from "../src/lib/ai-study-curriculum";
import { groundedCardMessages, groundedCardSchema, parseGroundedCard, type GroundedCard } from "../src/lib/ai-study-grounded-card";
import { hydrateAiStudySourceChunks } from "../src/lib/ai-study-source-content";
import { askQwenDetailed } from "../src/lib/qwen";
import { getAiStudyPromptConfig } from "../src/lib/ai-study-prompts";

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const fixturePath = value("--fixture"), output = value("--output"), baseUrl = value("--base-url"), model = value("--model");
  if (!fixturePath || !output || !baseUrl || !model) throw new Error("需要--fixture、--output、--base-url、--model。");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const prompt = args.includes("--runtime-prompts") ? await getAiStudyPromptConfig(fixture.aiPromptVersionId) : undefined;
  const chunks = hydrateAiStudySourceChunks(fixture.sourceChunks.sort((a: any, b: any) => a.sourceId.localeCompare(b.sourceId) || a.chunkIndex - b.chunkIndex), fixture.sourceBlocks);
  await writeFile(`${output}.units.json`, JSON.stringify(buildEvidenceUnits(chunks)));
  if (args.includes("--units-only")) return;
  const serverConfig = { id: "curriculum-regression", mode: "built_in" as const, name: "Curriculum regression", baseUrl, model, apiKey: process.env.QWEN_API_KEY || "" };
  const diagnostics: unknown[] = [];
  try { diagnostics.push(...JSON.parse(await readFile(`${output}.diagnostics.json`, "utf8"))); } catch {}
  const started = Date.now();
  const request = async (originalCall: CurriculumCall) => {
    const call = prompt && !originalCall.stage.startsWith("card_") ? withCurriculumPrompt(originalCall, prompt) : originalCall;
    if (call.inputIds) await writeFile(`${output}.${call.stage}.input-ids.json`, JSON.stringify(call.inputIds));
    let error: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const at = Date.now();
      const messages = attempt === 1 ? call.messages : [...call.messages, { role: "user" as const, content: `上一轮校验错误：${error instanceof Error ? error.message : String(error)}。请修正并重新输出完整JSON。` }];
      try {
        const response = await askQwenDetailed(messages, { serverConfig, timeoutMs: 200000, maxCompletionTokens: call.maxCompletionTokens, temperature: 0.2, enableThinking: call.stage.startsWith("card_") && args.includes("--thinking-cards"), jsonSchema: call.jsonSchema });
        await writeFile(`${output}.${call.stage}.${attempt}.raw.json`, response.content);
        if (response.finishReason === "length") throw new Error("输出截断");
        call.validateContent(response.content);
        const diagnostic = { stage: call.stage, attempt, status: "passed", durationMs: Date.now() - at, usage: response.usage };
        diagnostics.push(diagnostic); console.log(JSON.stringify(diagnostic));
        await writeFile(`${output}.diagnostics.json`, JSON.stringify(diagnostics, null, 2));
        return response.content;
      } catch (caught) { error = caught; const diagnostic = { stage: call.stage, attempt, status: "failed", durationMs: Date.now() - at, error: error instanceof Error ? error.message : String(error) }; diagnostics.push(diagnostic); console.log(JSON.stringify(diagnostic)); await writeFile(`${output}.diagnostics.json`, JSON.stringify(diagnostics, null, 2)); }
    }
    throw error;
  };
  let curriculum: Curriculum;
  const existing = value("--curriculum");
  if (existing) {
    curriculum = JSON.parse(await readFile(existing, "utf8"));
    if (curriculum.protocol !== curriculumProtocol || curriculum.fingerprint !== curriculumFingerprint(buildEvidenceUnits(chunks))) throw new Error("回放清单协议或来源指纹不匹配，不能沿用旧实验结果验收。");
  }
  else {
    let checkpoint;
    try { checkpoint = JSON.parse(await readFile(`${output}.checkpoint.json`, "utf8")); } catch {}
    curriculum = await generateEvidenceCurriculum({ projectTitle: fixture.title, sources: chunks, request, checkpoint, saveCheckpoint: async (value) => { await writeFile(`${output}.checkpoint.json`, JSON.stringify(value)); } });
    await writeFile(`${output}.curriculum.json`, JSON.stringify(curriculum, null, 2));
    console.log(JSON.stringify({ status: "curriculum_passed", durationMs: Date.now() - started, units: curriculum.units.length, topics: curriculum.topics.length, nodes: curriculum.nodes.length, excluded: Object.values(curriculum.decisions).filter((decision) => decision.exclusion).length }));
  }
  if (!args.includes("--cards")) return;
  const filter = value("--filter");
  let topics = filter ? curriculum.topics.filter((topic) => new RegExp(filter).test(topic.title)) : curriculum.topics;
  if (args.includes("--historical-sample")) {
    const patterns = [
      [/潮汐/, /24\s*小时\s*53/], [/惯性|牛顿第一/, /惯性/], [/中微子|β|贝塔/, /能量守恒|电子.{0,20}能量.{0,30}(?:连续|最大|变化)/],
      [/中子星/, /2017|合并/], [/直立行走/, /直立|双脚/], [/麦克斯韦|电磁波/, /麦克斯韦/],
      [/交流电|变压器/, /变压器/], [/温室/, /吸收|红外/], [/核聚变|隧穿/, /聚变|隧穿/], [/暗能量|加速膨胀/, /暗能量|加速.*膨胀/]
    ];
    topics = [...new Map(patterns.map(([pattern, evidencePattern]) => {
      const candidates = curriculum.topics.filter((item) => pattern.test(item.title) || item.objectives.some((objective) => pattern.test(objective.title)));
      const topic = candidates.find((item) => item.objectives.some((objective) => evidencePattern.test(objective.anchor)));
      if (!topic) throw new Error(`历史遗漏主题或关键证据仍未保留：${pattern} / ${evidencePattern}`);
      return [topic.id, topic] as const;
    })).values()];
  }
  const cards: Record<string, GroundedCard> = {};
  const cardChecks: Record<string, { fingerprint: string; raw: string }> = {};
  try { Object.assign(cardChecks, JSON.parse(await readFile(`${output}.card-checks.json`, "utf8"))); } catch {}
  const failures: { id: string; title: string; error: string }[] = [];
  let reusedCardCount = 0, generatedCardCount = 0;
  for (const topic of topics) {
    const messages = groundedCardMessages(fixture.title, topic, curriculum.units, prompt);
    const fingerprint = createHash("sha256").update(JSON.stringify({ protocol: curriculumProtocol, topic, messages, thinking: args.includes("--thinking-cards") })).digest("hex");
    const saved = cardChecks[topic.id];
    if (saved?.fingerprint === fingerprint) {
      try { cards[topic.id] = parseGroundedCard(saved.raw, topic, curriculum.units); reusedCardCount++; continue; } catch {}
    }
    let card: GroundedCard | undefined;
    let raw = "";
    try {
      raw = await request({ stage: `card_${topic.id}`, messages, jsonSchema: { name: "ai_study_grounded_card", schema: groundedCardSchema(topic) }, maxCompletionTokens: 8192, validateContent: (content) => { card = parseGroundedCard(content, topic, curriculum.units); } });
    } catch (error) {
      failures.push({ id: topic.id, title: topic.title, error: error instanceof Error ? error.message : String(error) });
      await writeFile(`${output}.failures.json`, JSON.stringify(failures, null, 2));
      if (!args.includes("--continue-on-card-error")) throw error;
      continue;
    }
    if (!card) throw new Error("卡片未校验");
    cards[topic.id] = card;
    generatedCardCount++;
    cardChecks[topic.id] = { fingerprint, raw };
    await writeFile(`${output}.card-checks.json`, JSON.stringify(cardChecks));
    await writeFile(`${output}.cards.json`, JSON.stringify(cards, null, 2));
  }
  await writeFile(`${output}.diagnostics.json`, JSON.stringify(diagnostics, null, 2));
  await writeFile(`${output}.cards.json`, JSON.stringify(cards, null, 2));
  await writeFile(`${output}.failures.json`, JSON.stringify(failures, null, 2));
  console.log(JSON.stringify({ status: failures.length ? "failed" : "passed", durationMs: Date.now() - started, selectedTopics: topics.length, cardCount: Object.keys(cards).length, generatedCardCount, reusedCardCount, failures }));
  if (failures.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
