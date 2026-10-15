import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  flattenNestedCandidateOutline,
  nestedCandidateOutlineSchema,
  outlineCandidateSchema,
  OutlineCandidateCoverageError,
  validateNestedCandidateOutline,
  type OutlineCandidateWithId
} from "../src/lib/ai-study-outline-contract";
import {
  buildCandidateOutlineMergeTemplates,
  buildCandidateOutlineCoverageRepair,
  buildCandidateOutlineRepairMessages,
  buildCandidateOutlineTransportInstruction,
  type StructuredJsonFailure
} from "../src/lib/ai-study-outline-merge";
import { assertCompleteFourLevelOutline } from "../src/lib/ai-study-outline-validation";
import { renderAiStudyPromptTemplate } from "../src/lib/ai-study-prompt-template";
import { askQwenDetailed, type ChatMessage } from "../src/lib/qwen";

// Isolated model replay: reads an exported checkpoint, calls the selected model,
// writes only a local result file. It never changes projects, tasks or balances.
async function main() {
  const args = process.argv.slice(2);
  const option = (key: string) => args.find((arg) => arg.startsWith(`${key}=`))?.slice(key.length + 1);
  const checkpointPath = option("--checkpoint");
  const outputPath = option("--output");
  const baseUrl = option("--base-url") || process.env.QWEN_API_BASE_URL;
  const model = option("--model") || process.env.QWEN_MODEL;
  if (!checkpointPath || !outputPath || !baseUrl || !model) throw new Error("需要 --checkpoint、--output、--base-url、--model。");
  const fixture = JSON.parse(await readFile(checkpointPath, "utf8")) as {
    projectTitle: string;
    sourcePromptVersion: string;
    templates: { "outline.merge.system": string; "outline.merge.user": string };
    candidates: OutlineCandidateWithId[];
  };
  for (const candidate of fixture.candidates) {
    const { candidateId, ...content } = candidate;
    assert.ok(typeof candidateId === "string" && candidateId.length > 0);
    outlineCandidateSchema.parse(content);
  }
  assert.equal(new Set(fixture.candidates.map((c) => c.candidateId)).size, fixture.candidates.length);
  const templates = args.includes("--legacy-prompt") ? fixture.templates : buildCandidateOutlineMergeTemplates();
  const originalMessages: ChatMessage[] = [
    { role: "system", content: `${renderAiStudyPromptTemplate(templates["outline.merge.system"], { maxNodesPerProject: 60 })}\n\n${buildCandidateOutlineTransportInstruction(60)}` },
    { role: "user", content: renderAiStudyPromptTemplate(templates["outline.merge.user"], {
      projectTitle: fixture.projectTitle,
      candidateNodes: JSON.stringify({ candidates: fixture.candidates.map(({ candidateId, title, summary }) => ({ candidateId, title, summary })) })
    }) }
  ];
  let previousFailure: StructuredJsonFailure | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const start = Date.now();
    const messages = previousFailure ? buildCandidateOutlineRepairMessages(originalMessages, previousFailure, 60) : originalMessages;
    const repair = previousFailure ? buildCandidateOutlineCoverageRepair(originalMessages, previousFailure, 60) : null;
    let content: string | null = null;
    try {
      const response = await askQwenDetailed(repair?.messages ?? messages, {
        serverConfig: { id: "isolated-outline-verification", mode: "built_in", name: "Isolated outline verification", baseUrl, model, apiKey: process.env.QWEN_API_KEY || "" },
        temperature: 0.1,
        timeoutMs: 200_000,
        maxCompletionTokens: 16_384,
        enableThinking: false,
        jsonSchema: repair?.jsonSchema ?? {
          name: "ai_study_candidate_four_level_outline",
          schema: (await import("../src/lib/ai-study-outline-contract")).buildNestedCandidateOutlineJsonSchema(fixture.candidates.map((c) => c.candidateId))
        }
      });
      content = response.content;
      if (response.finishReason === "length") throw new Error("模型输出被截断。");
      const outline = repair ? repair.parseResponse(content) : nestedCandidateOutlineSchema.parse(JSON.parse(content));
      validateNestedCandidateOutline(outline, fixture.candidates, 60);
      const nodes = flattenNestedCandidateOutline(outline, fixture.candidates);
      assertCompleteFourLevelOutline(nodes.map((node) => ({ ...node, depth: node.clientId === "root" ? 0 : node.clientId.startsWith("module_") ? 1 : node.clientId.startsWith("group_") ? 2 : 3 })));
      const expectedSources = new Set(fixture.candidates.flatMap((c) => c.sourceChunkIds));
      const coveredSources = new Set(nodes.slice(1).flatMap((node) => node.sourceChunkIds));
      assert.deepEqual([...coveredSources].sort(), [...expectedSources].sort());
      await writeFile(outputPath, JSON.stringify({ sourcePromptVersion: fixture.sourcePromptVersion, legacyPrompt: args.includes("--legacy-prompt"), attempt, outline }, null, 2));
      console.log(JSON.stringify({ status: "passed", attempt, strategy: repair ? "required_candidate_assignments" : "full_outline", durationMs: Date.now() - start, candidates: fixture.candidates.length, sourceChunks: coveredSources.size, nodes: nodes.length, finishReason: response.finishReason, usage: response.usage, outputPath }));
      return;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      console.log(JSON.stringify({ status: "failed", attempt, durationMs: Date.now() - start, error: failure.message, missingCandidateIds: failure instanceof OutlineCandidateCoverageError ? failure.missingCandidateIds : undefined }));
      previousFailure = { error: failure, responseContent: content };
      if (attempt === 2) throw failure;
    }
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
