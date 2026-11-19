import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { switchLlmProvider } from "@/lib/llm/public";
import { llmSwitchSchema } from "@/lib/schemas/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "请求体必须是 JSON 对象");
    }
    const input = llmSwitchSchema.parse(body);
    const config = await switchLlmProvider(input.provider, input.model);
    return NextResponse.json({
      ok: true,
      config,
      message:
        input.provider === "demo"
          ? "已切换到 Demo 演示稳定模式"
          : `已切换到真实 Provider：${input.provider}`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
