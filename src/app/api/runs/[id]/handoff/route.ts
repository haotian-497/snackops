import { NextResponse } from "next/server";

import { getRunRecord, saveRunRecord } from "@/lib/agent/runs";
import { handleRouteError, jsonError } from "@/lib/http";
import { handoffSchema } from "@/lib/schemas/agent";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const input = handoffSchema.parse(body ?? {});
    const run = await getRunRecord(id);
    if (!run) {
      return jsonError(404, `未找到运行：${id}`);
    }
    const next = await saveRunRecord({
      ...run,
      status: "handed_off",
      error: input.reason,
    });
    return NextResponse.json({ ok: true, run: next, message: "已标记人工接管" });
  } catch (error) {
    return handleRouteError(error);
  }
}
