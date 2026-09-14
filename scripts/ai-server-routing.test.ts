import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { askQwenDetailed, streamQwen } from "../src/lib/qwen";
import { aiModuleDefinitions, type ActiveAiServerConfig } from "../src/lib/ai-server-settings";

const originalFetch = global.fetch;
const requests: Array<{ input: string; init?: RequestInit }> = [];
const customServer: ActiveAiServerConfig = {
  id: "custom_test",
  mode: "custom",
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "sk-custom-test",
  model: "deepseek-chat"
};
const backupServer: ActiveAiServerConfig = {
  id: "custom_backup",
  mode: "custom",
  name: "GLM",
  baseUrl: "https://glm.example.com/v1",
  apiKey: "sk-backup-test",
  model: "glm-test"
};

async function main() {
  try {
  assert.deepEqual(aiModuleDefinitions.map((module) => module.key), [
    "course_ai_explanation",
    "course_ai_follow_up",
    "special_practice_ai_doubt",
    "special_practice_ai_follow_up",
    "ai_study_generation",
    "ai_study_chat",
    "question_bank_ai_tagging",
    "question_bank_ai_doubt_draft",
    "question_bank_ai_generation",
    "question_bank_pdf_ai_review"
  ]);

  const sourceFiles = [
    "src/app/api/ai/explain/route.ts",
    "src/app/api/ai/question-doubt/route.ts",
    "src/lib/ai-study.ts",
    "src/lib/ai-study-generation.ts",
    "src/app/api/admin/question-banks/[paperId]/ai-tag/route.ts",
    "src/app/api/admin/question-banks/[paperId]/questions/[questionId]/ai-doubt/route.ts",
    "src/app/api/admin/question-bank-ai-generations/tasks/route.ts",
    "src/app/api/admin/question-bank-imports/tasks/route.ts",
    "src/app/api/admin/question-bank-imports/parse/route.ts"
  ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
  for (const module of aiModuleDefinitions) {
    assert.ok(sourceFiles.includes(`"${module.key}"`), `${module.key} must be assigned at its model-call entry point`);
  }
  assert.equal(sourceFiles.includes("getActiveAiServerConfig"), false);
  const failoverSources = [
    "src/app/api/ai/explain/route.ts",
    "src/app/api/ai/question-doubt/route.ts",
    "src/lib/ai-study.ts"
  ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
  assert.equal((failoverSources.match(/enableServerFailover: true/g) || []).length, 5);
  const noFailoverSources = [
    "src/lib/ai-study-generation.ts",
    "src/app/api/admin/question-banks/[paperId]/ai-tag/route.ts",
    "src/app/api/admin/question-banks/[paperId]/questions/[questionId]/ai-doubt/route.ts",
    "src/app/api/admin/question-bank-ai-generations/tasks/route.ts",
    "src/app/api/admin/question-bank-imports/tasks/route.ts",
    "src/app/api/admin/question-bank-imports/parse/route.ts"
  ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
  assert.equal(noFailoverSources.includes("enableServerFailover: true"), false);
  await assert.rejects(
    askQwenDetailed([{ role: "user", content: "missing module" }]),
    /AI module key is required/
  );

  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input: String(input), init });
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "ok" } }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const result = await askQwenDetailed([{ role: "user", content: "hello" }], {
    enableThinking: false,
    maxCompletionTokens: 256,
    serverConfig: customServer
  });
  assert.equal(result.content, "ok");
  assert.equal(requests[0]?.input, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(new Headers(requests[0]?.init?.headers).get("Authorization"), "Bearer sk-custom-test");
  const requestBody = JSON.parse(String(requests[0]?.init?.body));
  assert.equal(requestBody.model, "deepseek-chat");
  assert.equal(requestBody.max_tokens, 256);
  assert.equal("max_completion_tokens" in requestBody, false);
  assert.equal("chat_template_kwargs" in requestBody, false);

  requests.length = 0;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input: String(input), init });
    const body = [
      'data: {"choices":[{"delta":{"content":"流"}}]}',
      'data: {"choices":[{"delta":{"content":"式"}}]}',
      "data: [DONE]",
      ""
    ].join("\n");
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;

  const chunks: string[] = [];
  const streamed = await streamQwen(
    [{ role: "user", content: "hello" }],
    (chunk) => {
      chunks.push(chunk);
    },
    { serverConfig: customServer }
  );
  assert.equal(streamed, "流式");
  assert.deepEqual(chunks, ["流", "式"]);
  const streamBody = JSON.parse(String(requests[0]?.init?.body));
  assert.equal(streamBody.model, "deepseek-chat");
  assert.equal(streamBody.stream, true);

  requests.length = 0;
  let resolvedServerId = "";
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input: String(input), init });
    if (String(input).startsWith(customServer.baseUrl)) {
      return new Response("primary unavailable", { status: 503 });
    }
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "backup ok" } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const failedOver = await askQwenDetailed([{ role: "user", content: "fail over" }], {
    serverConfigs: [customServer, backupServer],
    enableServerFailover: true,
    onServerResolved: (server) => {
      resolvedServerId = server.id;
    }
  });
  assert.equal(failedOver.content, "backup ok");
  assert.equal(failedOver.serverConfig.id, backupServer.id);
  assert.equal(resolvedServerId, backupServer.id);
  assert.deepEqual(requests.map((request) => request.input), [
    `${customServer.baseUrl}/chat/completions`,
    `${backupServer.baseUrl}/chat/completions`
  ]);

  requests.length = 0;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input: String(input), init });
    return new Response("unavailable", { status: 503 });
  }) as typeof fetch;
  await assert.rejects(
    askQwenDetailed([{ role: "user", content: "all fail" }], {
      serverConfigs: [customServer, backupServer],
      enableServerFailover: true
    }),
    /All assigned AI servers/
  );
  assert.equal(requests.length, 2);

  requests.length = 0;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input: String(input), init });
    if (String(input).startsWith(customServer.baseUrl)) {
      return new Response("primary unavailable", { status: 502 });
    }
    return new Response([
      'data: {"choices":[{"delta":{"content":"备"}}]}',
      'data: {"choices":[{"delta":{"content":"用"}}]}',
      "data: [DONE]",
      ""
    ].join("\n"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  const failoverChunks: string[] = [];
  const failoverStreamed = await streamQwen(
    [{ role: "user", content: "stream fail over" }],
    (chunk) => {
      failoverChunks.push(chunk);
    },
    { serverConfigs: [customServer, backupServer], enableServerFailover: true }
  );
  assert.equal(failoverStreamed, "备用");
  assert.deepEqual(failoverChunks, ["备", "用"]);
  assert.equal(requests.length, 2);

  requests.length = 0;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input: String(input), init });
    const encoder = new TextEncoder();
    let step = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (step === 0) {
          step += 1;
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"半"}}]}\n'));
          return;
        }
        controller.error(new Error("stream interrupted"));
      }
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  const partialChunks: string[] = [];
  await assert.rejects(
    streamQwen(
      [{ role: "user", content: "partial output" }],
      (chunk) => {
        partialChunks.push(chunk);
      },
      { serverConfigs: [customServer, backupServer], enableServerFailover: true }
    ),
    /stream interrupted/
  );
  assert.deepEqual(partialChunks, ["半"]);
  assert.equal(requests.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
}

main()
  .then(() => console.log("ai-server-routing tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
