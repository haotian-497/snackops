import { agentRunSchema } from "@/lib/schemas/agent";
import type { AgentEvent } from "@/lib/agent/events";
import { runAgent } from "@/lib/agent/pipeline";
import { handleRouteError, jsonError } from "@/lib/http";
import { assertProviderReady } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "请求体必须是 JSON 对象");
    }
    const input = agentRunSchema.parse(body);
    await assertProviderReady();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: AgentEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          await runAgent(input, send);
        } catch (error) {
          send({
            type: "error",
            message: error instanceof Error ? error.message : "Agent 运行失败",
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
