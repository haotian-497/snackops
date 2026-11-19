import { NextResponse } from "next/server";

import { runAgent } from "@/lib/agent/pipeline";
import { getRunRecord } from "@/lib/agent/runs";
import { handleRouteError, jsonError } from "@/lib/http";
import { runRetrySchema } from "@/lib/schemas/agent";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const input = runRetrySchema.parse(body ?? {});
    const previous = await getRunRecord(input.runId);
    if (!previous) {
      return jsonError(404, `未找到运行：${input.runId}`);
    }
    const run = await runAgent({
      question: previous.question,
      source: "retry",
      conversationId: previous.conversationId,
      retryOf: previous.id,
    });
    return NextResponse.json({ ok: true, run, message: "已重试运行" });
  } catch (error) {
    return handleRouteError(error);
  }
}
