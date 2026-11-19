import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { getPublicLlmConfig, saveLlmConfig } from "@/lib/llm/public";
import { llmConfigPutSchema } from "@/lib/schemas/admin";

export async function GET() {
  try {
    const config = await getPublicLlmConfig();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "请求体必须是 JSON 对象");
    }
    const patch = llmConfigPutSchema.parse(body);
    const config = await saveLlmConfig(patch);
    return NextResponse.json({ ok: true, config, message: "已更新模型配置" });
  } catch (error) {
    return handleRouteError(error);
  }
}
