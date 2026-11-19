import { NextResponse } from "next/server";

import { getJudgeConfig, saveJudgeConfig } from "@/lib/eval/judge-config";
import { DEFAULT_JUDGE_SYSTEM_PROMPT } from "@/lib/eval/judge-prompt";
import { handleRouteError, jsonError } from "@/lib/http";
import { judgeConfigPutSchema } from "@/lib/schemas/eval";

export async function GET() {
  try {
    const config = await getJudgeConfig();
    return NextResponse.json({ ok: true, config, defaultPrompt: DEFAULT_JUDGE_SYSTEM_PROMPT });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const patch = judgeConfigPutSchema.parse(body);
    const config = await saveJudgeConfig(patch.systemPrompt);
    return NextResponse.json({ ok: true, config, defaultPrompt: DEFAULT_JUDGE_SYSTEM_PROMPT, message: "已保存 Judge 提示词" });
  } catch (error) {
    return handleRouteError(error);
  }
}
