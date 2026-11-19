import { createEvalBatch, scheduleEvalBatch } from "@/lib/eval/batch";
import { handleRouteError, jsonError } from "@/lib/http";
import { evalBatchRunSchema } from "@/lib/schemas/eval";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = evalBatchRunSchema.parse(body);
    const batch = await createEvalBatch({
      name: input.name,
      versionLabel: input.versionLabel,
      changeNote: input.changeNote,
      caseIds: input.caseIds,
      saveOnComplete: input.saveOnComplete,
    });
    scheduleEvalBatch(batch.id);
    return NextResponse.json({ ok: true, batchId: batch.id, batch, message: "批次已创建，正在按 Agent 主链路逐条运行" });
  } catch (error) {
    return handleRouteError(error);
  }
}
