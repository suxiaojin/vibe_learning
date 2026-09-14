import {
  getAiServerConfigForModule,
  getAiServerConfigsForModule,
  type ActiveAiServerConfig,
  type AiModuleKey
} from "@/lib/ai-server-settings";

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
  moduleKey?: AiModuleKey;
  serverConfig?: ActiveAiServerConfig;
  serverConfigs?: readonly ActiveAiServerConfig[];
  enableServerFailover?: boolean;
  onServerResolved?: (serverConfig: ActiveAiServerConfig) => void;
};

export type AskQwenResult = {
  content: string;
  finishReason: string | null;
  serverConfig: ActiveAiServerConfig;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

type AttemptAbort = {
  signal?: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
};

export async function askQwen(messages: ChatMessage[], options: AskQwenOptions = {}) {
  return (await askQwenDetailed(messages, options)).content;
}

export async function askQwenDetailed(messages: ChatMessage[], options: AskQwenOptions = {}): Promise<AskQwenResult> {
  const serverConfigs = await resolveServerConfigs(options);
  let lastError: Error | null = null;

  for (const [index, serverConfig] of serverConfigs.entries()) {
    if (options.signal?.aborted) {
      throw abortReason(options.signal);
    }
    try {
      const result = await askServerDetailed(messages, serverConfig, options);
      options.onServerResolved?.(serverConfig);
      return result;
    } catch (error) {
      if (options.signal?.aborted) {
        throw abortReason(options.signal);
      }
      lastError = asError(error);
      logFailoverAttempt(serverConfig, lastError, index, serverConfigs.length);
    }
  }

  throw finalServerError(lastError, serverConfigs.length);
}

export async function streamQwen(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void | Promise<void>,
  options: AskQwenOptions = {}
) {
  const serverConfigs = await resolveServerConfigs(options);
  let lastError: Error | null = null;

  for (const [index, serverConfig] of serverConfigs.entries()) {
    if (options.signal?.aborted) {
      throw abortReason(options.signal);
    }
    let emitted = false;
    try {
      const answer = await streamServer(
        messages,
        async (chunk) => {
          emitted = true;
          await onChunk(chunk);
        },
        serverConfig,
        options
      );
      options.onServerResolved?.(serverConfig);
      return answer;
    } catch (error) {
      if (options.signal?.aborted) {
        throw abortReason(options.signal);
      }
      const normalizedError = asError(error);
      if (emitted) {
        throw normalizedError;
      }
      lastError = normalizedError;
      logFailoverAttempt(serverConfig, lastError, index, serverConfigs.length);
    }
  }

  throw finalServerError(lastError, serverConfigs.length);
}

async function resolveServerConfigs(options: AskQwenOptions) {
  if (options.serverConfig) {
    return [options.serverConfig];
  }
  if (options.serverConfigs?.length) {
    return [...options.serverConfigs];
  }
  if (!options.moduleKey) {
    throw new Error("AI module key is required when no server config is provided.");
  }
  return options.enableServerFailover
    ? getAiServerConfigsForModule(options.moduleKey)
    : [await getAiServerConfigForModule(options.moduleKey)];
}

async function askServerDetailed(
  messages: ChatMessage[],
  serverConfig: ActiveAiServerConfig,
  options: AskQwenOptions
): Promise<AskQwenResult> {
  const { apiKey, baseUrl, model, mode } = serverConfig;
  const attemptAbort = createAttemptAbort(options);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      signal: attemptAbort.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.4,
        ...(options.maxCompletionTokens
          ? mode === "built_in"
            ? { max_completion_tokens: Math.max(1, Math.floor(options.maxCompletionTokens)) }
            : { max_tokens: Math.max(1, Math.floor(options.maxCompletionTokens)) }
          : {}),
        ...(mode === "built_in" && options.enableThinking === false
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

    if (!response.ok) {
      throw new Error(`AI API failed with ${response.status}.`);
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
    const content = payload.choices?.[0]?.message?.content?.trim() || "";
    if (!content) {
      throw new Error("AI API returned an empty response.");
    }
    return {
      content,
      finishReason: payload.choices?.[0]?.finish_reason ?? null,
      serverConfig,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? null,
        completionTokens: payload.usage?.completion_tokens ?? null,
        totalTokens: payload.usage?.total_tokens ?? null
      }
    };
  } catch (error) {
    throw normalizeAttemptError(error, attemptAbort);
  } finally {
    attemptAbort.cleanup();
  }
}

async function streamServer(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void | Promise<void>,
  serverConfig: ActiveAiServerConfig,
  options: AskQwenOptions
) {
  const { apiKey, baseUrl, model } = serverConfig;
  const attemptAbort = createAttemptAbort(options);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      signal: attemptAbort.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.4,
        stream: true
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`AI API failed with ${response.status}.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";

    const consumeLine = async (rawLine: string) => {
      const line = rawLine.trim();
      if (!line || line === "data: [DONE]" || !line.startsWith("data:")) {
        return;
      }
      const payload = line.slice(5).trim();
      if (!payload) {
        return;
      }
      const chunk = parseOpenAiStreamChunk(payload);
      if (chunk) {
        answer += chunk;
        await onChunk(chunk);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        await consumeLine(line);
      }
    }
    buffer += decoder.decode();
    if (buffer) {
      await consumeLine(buffer);
    }
    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer) {
      throw new Error("AI API returned an empty response.");
    }
    return normalizedAnswer;
  } catch (error) {
    throw normalizeAttemptError(error, attemptAbort);
  } finally {
    attemptAbort.cleanup();
  }
}

function createAttemptAbort(options: AskQwenOptions): AttemptAbort {
  if (!options.timeoutMs && !options.signal) {
    return { signal: undefined, didTimeout: () => false, cleanup: () => undefined };
  }
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternalSignal = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    controller.abort(options.signal.reason);
  } else {
    options.signal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }
  const timeout = options.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs)
    : null;
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      options.signal?.removeEventListener("abort", abortFromExternalSignal);
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };
}

function normalizeAttemptError(error: unknown, attemptAbort: AttemptAbort) {
  if (error instanceof Error && error.name === "AbortError" && attemptAbort.didTimeout()) {
    return new Error("AI API timed out.");
  }
  return asError(error);
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new Error("AI request was cancelled.");
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error("AI service request failed.");
}

function logFailoverAttempt(
  serverConfig: ActiveAiServerConfig,
  error: Error,
  index: number,
  serverCount: number
) {
  console.error("AI server request failed.", {
    serverId: serverConfig.id,
    serverName: serverConfig.name,
    model: serverConfig.model,
    error: error.message,
    willTryNext: index + 1 < serverCount
  });
}

function finalServerError(lastError: Error | null, serverCount: number) {
  if (serverCount === 1 && lastError) {
    return lastError;
  }
  return new Error("All assigned AI servers are temporarily unavailable.");
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
