import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { deleteImprovement, getImprovement, updateImprovement } from "@/lib/ops/improvements";
import { improvementPatchSchema } from "@/lib/schemas/ops";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const improvement = await getImprovement(id);
    return NextResponse.json({ ok: true, improvement });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const patch = improvementPatchSchema.parse(body);
    if (Object.keys(patch).length === 0) return jsonError(400, "没有可更新的字段");
    const improvement = await updateImprovement(id, patch);
    return NextResponse.json({ ok: true, improvement, message: "已更新改进建议" });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const result = await deleteImprovement(id);
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.promptAbExperimentId
        ? "已删除改进建议（关联的 Prompt A/B 实验仍保留，可在 A/B 页单独删除）"
        : "已删除改进建议",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
