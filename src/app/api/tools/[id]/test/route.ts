import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { toolTestSchema } from "@/lib/schemas/registry";
import { runTool, sampleInputFor } from "@/lib/tools/registry";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = toolTestSchema.parse(body);
    const input = Object.keys(parsed.input).length > 0 ? parsed.input : sampleInputFor(id);
    const started = Date.now();
    const result = await runTool(id, input, { ignoreEnabled: true });
    const durationMs = Date.now() - started;
    return NextResponse.json(
      {
        ok: result.ok,
        result,
        input,
        durationMs,
        invoked: true,
        message: result.ok ? "测试完成，已返回服务端真实数据" : result.error.message,
      },
      { status: result.ok ? 200 : 400 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id) {
      return jsonError(400, "缺少 Tool id");
    }
    return NextResponse.json({ ok: true, sampleInput: sampleInputFor(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
