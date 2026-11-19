import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { listToolVersions, saveToolVersion } from "@/lib/tools/registry";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const saveSchema = z.object({
  changeNote: z.string().min(1).default("添加快照"),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const versions = await listToolVersions(decodeURIComponent(id));
    return NextResponse.json({
      ok: true,
      versions: versions.map((item) => ({
        id: item.id,
        toolId: item.toolId,
        createdAt: item.createdAt,
        changeNote: item.changeNote,
        name: item.name,
        timeoutMs: item.timeoutMs,
        enabled: item.enabled,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const input = saveSchema.parse(body && typeof body === "object" ? body : {});
    const snapshot = await saveToolVersion(decodeURIComponent(id), input.changeNote);
    return NextResponse.json({ ok: true, snapshot, message: "已保存 Tool 版本快照" });
  } catch (error) {
    return handleRouteError(error);
  }
}
