type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function askQwen(messages: ChatMessage[]) {
  const baseUrl = process.env.QWEN_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("QWEN_API_BASE_URL is not configured.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.QWEN_API_KEY ? { Authorization: `Bearer ${process.env.QWEN_API_KEY}` } : {})
    },
    body: JSON.stringify({
      model: process.env.QWEN_MODEL || "qwen3.5",
      messages,
      temperature: 0.4
    })
  });

  if (!response.ok) {
    throw new Error(`Qwen API failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content?.trim() || "暂时没有生成解释，请稍后重试。";
}
