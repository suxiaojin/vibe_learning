import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { flattenNestedCandidateOutline, outlineCandidateSchema, type OutlineCandidateWithId } from "../src/lib/ai-study-outline-contract";
import { buildCandidateOutlineMergeTemplates, buildCandidateOutlineTransportInstruction, generateCandidateOutline, orderCandidateTitlesForPlanning } from "../src/lib/ai-study-outline-merge";
import { renderAiStudyPromptTemplate } from "../src/lib/ai-study-prompt-template";
import { askQwenDetailed, type ChatMessage } from "../src/lib/qwen";

async function main() {
  const args = process.argv.slice(2);
  const option = (key: string) => args.find((arg) => arg.startsWith(`${key}=`))?.slice(key.length + 1);
  const checkpointPath = option("--checkpoint"), outputPath = option("--output"), baseUrl = option("--base-url"), model = option("--model");
  if (!checkpointPath || !outputPath || !baseUrl || !model) throw new Error("需要 --checkpoint、--output、--base-url、--model。");
  const fixture = JSON.parse(await readFile(checkpointPath, "utf8")) as { projectTitle: string; sourcePromptVersion: string; templates: Record<string, string>; candidates: OutlineCandidateWithId[] };
  for (const { candidateId, ...candidate } of fixture.candidates) { assert.ok(candidateId); outlineCandidateSchema.parse(candidate); }
  assert.equal(new Set(fixture.candidates.map((c) => c.candidateId)).size, fixture.candidates.length);
  const templates = args.includes("--legacy-prompt") ? fixture.templates : buildCandidateOutlineMergeTemplates();
  const messages: ChatMessage[] = [
    { role: "system", content: renderAiStudyPromptTemplate(templates["outline.merge.system"], { maxNodesPerProject: 60 }) + "\n\n" + buildCandidateOutlineTransportInstruction(60, fixture.candidates.length) },
    { role: "user", content: renderAiStudyPromptTemplate(templates["outline.merge.user"], { projectTitle: fixture.projectTitle, candidateNodes: JSON.stringify({ candidates: orderCandidateTitlesForPlanning(fixture.candidates) }) }) }
  ];
  const calls: Array<Record<string, unknown>> = [];
  const start = Date.now();
  const outline = await generateCandidateOutline(messages, fixture.candidates, 60, async (call) => {
    const callStart = Date.now();
    const response = await askQwenDetailed(call.messages, {
      serverConfig: { id: "isolated-outline-verification", mode: "built_in", name: "Isolated outline verification", baseUrl, model, apiKey: process.env.QWEN_API_KEY || "" },
      temperature: call.temperature, presencePenalty: call.presencePenalty, topP: call.topP,
      timeoutMs: 200_000, maxCompletionTokens: 16_384, enableThinking: call.enableThinking, jsonSchema: call.jsonSchema
    });
    await writeFile(`${outputPath}.${call.stage}.raw.json`, response.content);
    if (response.finishReason === "length") throw new Error("模型输出截断。");
    try { call.validateContent(response.content); }
    catch (error) { console.log(JSON.stringify({ stage: call.stage, status: "failed", durationMs: Date.now() - callStart, error: error instanceof Error ? error.message : String(error) })); throw error; }
    const diagnostic = { stage: call.stage, durationMs: Date.now() - callStart, usage: response.usage };
    calls.push(diagnostic); console.log(JSON.stringify({ status: "passed", ...diagnostic }));
    return response.content;
  });
  const nodes = flattenNestedCandidateOutline(outline, fixture.candidates);
  const expected = new Set(fixture.candidates.flatMap((c) => c.sourceChunkIds));
  const covered = new Set(nodes.filter((node) => node.clientId.startsWith("point_")).flatMap((node) => node.sourceChunkIds));
  assert.deepEqual([...covered].sort(), [...expected].sort());
  const result = { sourcePromptVersion: fixture.sourcePromptVersion, legacyPrompt: args.includes("--legacy-prompt"), durationMs: Date.now() - start, calls, outline };
  await writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: "passed", durationMs: result.durationMs, candidates: fixture.candidates.length, sourceChunks: covered.size, nodes: nodes.length, outputPath }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
