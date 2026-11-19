import { NextResponse } from "next/server";

import { getRunRecord } from "@/lib/agent/runs";
import { listAnnotations } from "@/lib/ops/annotations";
import { handleRouteError, jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const run = await getRunRecord(id);
    if (!run) {
      return jsonError(404, `未找到运行：${id}`);
    }
    const annotations = await listAnnotations(id);
    return NextResponse.json({ ok: true, run, annotations });
  } catch (error) {
    return handleRouteError(error);
  }
}
