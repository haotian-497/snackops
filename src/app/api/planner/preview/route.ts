import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { previewPlanner } from "@/lib/planner/registry";
import { plannerPreviewSchema } from "@/lib/schemas/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "请求体必须是 JSON 对象");
    }
    const input = plannerPreviewSchema.parse(body);
    const preview = await previewPlanner(input);
    return NextResponse.json({
      ok: true,
      preview,
      message: preview.validation.ok ? "计划预览通过校验" : "计划非法，请查看原因",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
