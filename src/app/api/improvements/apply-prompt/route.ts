import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { closeImprovementTicket } from "@/lib/ops/improvements";
import { applyPromptSchema } from "@/lib/schemas/ops";

/** 仅关闭改进单，不写生产；写生产请走 Prompt A/B 晋升 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = applyPromptSchema.parse(body);
    const improvement = await closeImprovementTicket(input.improvementId);
    return NextResponse.json({
      ok: true,
      improvement,
      skill: null,
      kind: "ticket",
      applied: true,
      message: "已关闭改进单（未写生产）。若要改配置请走 Prompt A/B 晋升。",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
