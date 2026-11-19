import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { getAnnotation, updateAnnotation } from "@/lib/ops/annotations";
import { annotationPatchSchema } from "@/lib/schemas/ops";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const annotation = await getAnnotation(id);
    return NextResponse.json({ ok: true, annotation });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const annotation = await updateAnnotation(id, annotationPatchSchema.parse(body));
    const bits = ["已更新标注"];
    if (annotation.improvementId) bits.push("已转入改进建议");
    if (annotation.evalCaseId) bits.push("已转入测评集");
    return NextResponse.json({
      ok: true,
      annotation: annotation.annotation,
      improvementId: annotation.improvementId,
      evalCaseId: annotation.evalCaseId,
      message: bits.join(" · "),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
