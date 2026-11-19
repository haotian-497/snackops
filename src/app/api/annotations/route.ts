import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { createAnnotation, listAnnotations } from "@/lib/ops/annotations";
import { annotationCreateSchema } from "@/lib/schemas/ops";

export async function GET(request: Request) {
  try {
    const runId = new URL(request.url).searchParams.get("runId") || undefined;
    const annotations = await listAnnotations(runId);
    return NextResponse.json({ ok: true, annotations });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const annotation = await createAnnotation(annotationCreateSchema.parse(body));
    const bits = ["已保存标注"];
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
