import { deleteEvalBatch, getEvalBatch, patchEvalBatch } from "@/lib/eval/batch";
import { handleRouteError, jsonError } from "@/lib/http";
import { evalBatchPatchSchema } from "@/lib/schemas/eval";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const batch = await getEvalBatch(id);
    return NextResponse.json({
      ok: true,
      batch,
      evaluator: {
        mode: batch.evaluatorMode,
        judgeEnabled: batch.judgeEnabled,
        label: batch.judgeEnabled ? "LLM-as-a-Judge" : "规则评测，Judge 未启用",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const patch = evalBatchPatchSchema.parse(body);
    const batch = await patchEvalBatch(id, patch);
    return NextResponse.json({
      ok: true,
      batch,
      message: batch.saved ? "已保存为回归批次" : batch.saveOnComplete ? "跑完后将自动保存" : "已更新",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteEvalBatch(id);
    return NextResponse.json({ ok: true, message: "已删除该回归批次" });
  } catch (error) {
    return handleRouteError(error);
  }
}
