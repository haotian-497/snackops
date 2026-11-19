import { NextResponse } from "next/server";

import { explainRun } from "@/lib/agent/explain";
import { handleRouteError, jsonError } from "@/lib/http";
import { explainSchema } from "@/lib/schemas/agent";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const input = explainSchema.parse(body ?? {});
    const result = await explainRun(input.runId, input.focus);
    return NextResponse.json({
      ok: true,
      explanation: result.explanation,
      provider: result.provider,
      runId: result.run.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("未找到运行")) {
      return jsonError(404, error.message);
    }
    return handleRouteError(error);
  }
}
