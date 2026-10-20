import assert from "node:assert/strict";
import { askQwenDetailed } from "../src/lib/qwen";

async function main() {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }), { status: 200 });
  };
  try {
    const serverConfig = { id: "test", mode: "built_in" as const, name: "test", baseUrl: "http://isolated.invalid/v1", model: "test", apiKey: "" };
    for (const enableThinking of [true, false, undefined]) await askQwenDetailed([{ role: "user", content: "test" }], { serverConfig, enableThinking, ...(enableThinking ? { presencePenalty: 0, topP: 0.95 } : {}) });
    assert.deepEqual(bodies[0].chat_template_kwargs, { enable_thinking: true });
    assert.equal(bodies[0].presence_penalty, 0);
    assert.equal(bodies[0].top_p, 0.95);
    assert.deepEqual(bodies[1].chat_template_kwargs, { enable_thinking: false });
    assert.equal(Object.hasOwn(bodies[2], "chat_template_kwargs"), false);
    assert.equal(Object.hasOwn(bodies[2], "presence_penalty"), false);
    console.log("qwen thinking option request tests passed");
  } finally { globalThis.fetch = originalFetch; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
