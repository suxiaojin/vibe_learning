export function buildDepthScopedCardJsonSchema(schema: Record<string, unknown>, depth: number): Record<string, unknown> {
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  return {
    ...schema,
    properties: {
      ...properties,
      explanation: depth >= 3
        ? { ...properties.explanation, minLength: 1 }
        : { type: "string", enum: [""] }
    }
  };
}

// Keep the persisted rule even when a provider falls back to loose JSON mode.
export function normalizeAiStudyCardForDepth<T extends { explanation: string }>(card: T, depth: number): T {
  if (depth < 3) return { ...card, explanation: "" };
  if (!card.explanation.trim()) throw new Error("第4层知识点必须生成非空 AI 详解。");
  return card;
}

export function buildAiStudyCardTransportInstruction(depth: number) {
  return [
    "【固定输出协议，优先级高于上方可配置提示词中的格式描述】",
    "只输出单个 JSON 对象，不要输出 Markdown 代码围栏、思考过程或解释文字。",
    "overview 不超过 800 个中文字符；explanation 不超过 1800 个中文字符；keyPoints 最多 8 条、每条不超过 200 个中文字符。",
    "严格保留来源中的数字、单位、否定、适用范围与不确定性；原文的假说或推测不能写成已证实结论。资料没有说明时不要补写。",
    depth < 3
      ? "本节点为第1-3层导读节点：explanation 必须严格为空字符串；保留 overview 与 keyPoints，不要展开 AI 详解。"
      : "本节点为第4层学习知识点：explanation 必须非空，只围绕本节点标题与概述解释；来源中的相邻章节、其他独立主题不能混入。",
    "pitfalls、examples、flashcards 必须输出空数组。避免重复同一句话；字符串中需要引用术语时使用中文引号。"
  ].join("\n");
}
