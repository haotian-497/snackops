import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { generatePromptDraft } from "@/lib/ops/improvements";
import { generatePromptSchema } from "@/lib/schemas/ops";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = generatePromptSchema.parse(body);
    const result = await generatePromptDraft(input.improvementId, input.skillId, input.mode ?? "rule");
    return NextResponse.json({
      ok: true,
      ...result,
      message:
        result.kind === "planner"
          ? "已生成 Planner 草案，生产尚未覆盖"
          : result.kind === "tool"
            ? "已生成 Tool 描述草案，生产尚未覆盖"
            : result.mode === "llm"
              ? "已用 LLM 辅助生成 Prompt 草案，生产 Prompt 尚未覆盖"
              : "已生成 Prompt 草案，生产 Prompt 尚未覆盖",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
