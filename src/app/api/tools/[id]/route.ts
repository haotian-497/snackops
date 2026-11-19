import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { toolPatchSchema } from "@/lib/schemas/registry";
import { getTool, sampleInputFor, updateTool } from "@/lib/tools/registry";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const tool = await getTool(id);
    return NextResponse.json({ ok: true, tool, sampleInput: sampleInputFor(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "请求体必须是 JSON 对象");
    }
    const patch = toolPatchSchema.parse(body);
    if (
      patch.enabled === undefined &&
      patch.description === undefined &&
      patch.name === undefined &&
      patch.timeoutMs === undefined
    ) {
      return jsonError(400, "请至少提供 enabled、description、name 或 timeoutMs 之一");
    }

    const tool = await updateTool(id, {
      enabled: patch.enabled,
      name: patch.name,
      description: patch.description,
      timeoutMs: patch.timeoutMs,
      changeNote: patch.changeNote,
      snapshotBefore: patch.enabled !== undefined && patch.description === undefined && patch.name === undefined && patch.timeoutMs === undefined
        ? false
        : undefined,
    });

    let message = "已保存 Tool 配置";
    if (patch.enabled !== undefined && patch.description === undefined && patch.timeoutMs === undefined && patch.name === undefined) {
      message = patch.enabled ? "已启用 Tool" : "已停用 Tool";
    }

    return NextResponse.json({ ok: true, tool, message });
  } catch (error) {
    return handleRouteError(error);
  }
}
