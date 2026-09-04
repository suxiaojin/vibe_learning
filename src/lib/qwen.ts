export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type QwenJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type AskQwenOptions = {
  signal?: AbortSignal;
  temperature?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  jsonSchema?: QwenJsonSchema;
  maxCompletionTokens?: number;
  enableThinking?: boolean;
};

export type AskQwenResult = {
  content: string;
  finishReason: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

export async function askQwen(messages: ChatMessage[], options: AskQwenOptions = {}) {
  return (await askQwenDetailed(messages, options)).content;
}

export async function askQwenDetailed(messages: ChatMessage[], options: AskQwenOptions = {}): Promise<AskQwenResult> {
  const baseUrl = process.env.QWEN_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("QWEN_API_BASE_URL is not configured.");
  }

  const controller = options.timeoutMs || options.signal ? new AbortController() : null;
  const abortFromExternalSignal = () => controller?.abort(options.signal?.reason);
  if (controller && options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener("abort", abortFromExternalSignal, { once: true });
    }
  }
  const timeout = controller && options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null;

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.QWEN_API_KEY ? { Authorization: `Bearer ${process.env.QWEN_API_KEY}` } : {})
      },
      signal: controller?.signal,
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || "qwen3.5",
        messages,
        temperature: options.temperature ?? 0.4,
        ...(options.maxCompletionTokens
          ? { max_completion_tokens: Math.max(1, Math.floor(options.maxCompletionTokens)) }
          : {}),
        ...(options.enableThinking === false
          ? { chat_template_kwargs: { enable_thinking: false } }
          : {}),
        ...(options.jsonSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: options.jsonSchema.name,
                  strict: options.jsonSchema.strict ?? true,
                  schema: options.jsonSchema.schema
                }
              }
            }
          : options.jsonMode ? { response_format: { type: "json_object" } } : {})
      })
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Qwen API timed out.");
    }
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortFromExternalSignal);
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (!response.ok) {
    throw new Error(`Qwen API failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: { content?: string };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  return {
    content: payload.choices?.[0]?.message?.content?.trim() || "暂时没有生成解释，请稍后重试。",
    finishReason: payload.choices?.[0]?.finish_reason ?? null,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? null,
      completionTokens: payload.usage?.completion_tokens ?? null,
      totalTokens: payload.usage?.total_tokens ?? null
    }
  };
}

export async function streamQwen(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void | Promise<void>,
  options: AskQwenOptions = {}
) {
  const baseUrl = process.env.QWEN_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("QWEN_API_BASE_URL is not configured.");
  }

  const controller = options.timeoutMs || options.signal ? new AbortController() : null;
  const abortFromExternalSignal = () => controller?.abort(options.signal?.reason);
  if (controller && options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener("abort", abortFromExternalSignal, { once: true });
    }
  }
  const timeout = controller && options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null;

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.QWEN_API_KEY ? { Authorization: `Bearer ${process.env.QWEN_API_KEY}` } : {})
      },
      signal: controller?.signal,
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || "qwen3.5",
        messages,
        temperature: options.temperature ?? 0.4,
        stream: true
      })
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Qwen API timed out.");
    }
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortFromExternalSignal);
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (!response.ok || !response.body) {
    throw new Error(`Qwen API failed with ${response.status}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line === "data: [DONE]") {
        continue;
      }
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload) {
        continue;
      }

      const chunk = parseOpenAiStreamChunk(payload);
      if (chunk) {
        answer += chunk;
        await onChunk(chunk);
      }
    }
  }

  return answer.trim() || "暂时没有生成解释，请稍后重试。";
}

function parseOpenAiStreamChunk(payload: string) {
  try {
    const data = JSON.parse(payload) as {
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
      }>;
    };
    return data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}
