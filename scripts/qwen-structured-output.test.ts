import assert from "node:assert/strict";
import { askQwen, askQwenDetailed } from "../src/lib/qwen";

const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.QWEN_API_BASE_URL;
const originalModel = process.env.QWEN_MODEL;
const requestBodies: Array<Record<string, unknown>> = [];

process.env.QWEN_API_BASE_URL = "http://qwen.test/v1";
process.env.QWEN_MODEL = "test-model";
globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
  requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

async function main() {
  try {
    const detailed = await askQwenDetailed([{ role: "user", content: "test" }], {
      jsonSchema: {
        name: "test_response",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean" } }
        }
      },
      maxCompletionTokens: 4096,
      enableThinking: false
    });

    assert.equal(detailed.content, "{\"ok\":true}");
    assert.equal(detailed.finishReason, "stop");
    assert.equal(detailed.usage.completionTokens, 4);
    assert.equal(requestBodies[0].max_completion_tokens, 4096);
    assert.deepEqual(requestBodies[0].chat_template_kwargs, { enable_thinking: false });
    assert.deepEqual(requestBodies[0].response_format, {
      type: "json_schema",
      json_schema: {
        name: "test_response",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean" } }
        }
      }
    });

    assert.equal(await askQwen([{ role: "user", content: "legacy" }]), "{\"ok\":true}");
    assert.equal("response_format" in requestBodies[1], false);
    console.log("qwen structured output tests passed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.QWEN_API_BASE_URL;
    else process.env.QWEN_API_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.QWEN_MODEL;
    else process.env.QWEN_MODEL = originalModel;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

