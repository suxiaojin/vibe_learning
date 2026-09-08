import assert from "node:assert/strict";
import { askQwenDetailed, streamQwen } from "../src/lib/qwen";
import type { ActiveAiServerConfig } from "../src/lib/ai-server-settings";

const originalFetch = global.fetch;
const requests: Array<{ input: string; init?: RequestInit }> = [];
const customServer: ActiveAiServerConfig = {
  mode: "custom",
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "sk-custom-test",
  model: "deepseek-chat"
};

async function main() {
  try {
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
