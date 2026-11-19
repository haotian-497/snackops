import { NextResponse } from "next/server";

import { getRunRecord } from "@/lib/agent/runs";
import { createAnnotation } from "@/lib/ops/annotations";
import { handleRouteError, jsonError } from "@/lib/http";
import { annotateSchema } from "@/lib/schemas/agent";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const input = annotateSchema.parse(body ?? {});
    const run = await getRunRecord(id);
    if (!run) {
      return jsonError(404, `未找到运行：${id}`);
    }
    const created = await createAnnotation({
      runId: id,
      label: input.label,
      note: input.note,
      createdBy: input.createdBy,
    });
    return NextResponse.json({
      ok: true,
      annotation: created.annotation,
      improvementId: created.improvementId,
      evalCaseId: created.evalCaseId,
      message: "已保存标注",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
