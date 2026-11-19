import type { AgentEvent } from "@/lib/agent/events";

export async function streamAgentRun(
  body: Record<string, unknown>,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  const response = await fetch("/api/agent/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as { message?: string; hint?: string; code?: string } | null;
    throw Object.assign(new Error([json?.message, json?.hint].filter(Boolean).join(" ") || "运行失败"), {
      code: json?.code,
    });
  }
  if (!response.body) {
    throw new Error("服务器没有返回流式响应");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.replace(/^data:\s*/, "").trim();
      if (!line) continue;
      const event = JSON.parse(line) as AgentEvent;
      onEvent(event);
      if (event.type === "error") {
        throw Object.assign(new Error([event.message, event.hint].filter(Boolean).join(" ")), {
          code: event.code,
        });
      }
    }
  }
}
