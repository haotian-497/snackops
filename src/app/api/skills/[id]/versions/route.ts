import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { skillVersionSaveSchema } from "@/lib/schemas/registry";
import { listSkillVersions, saveSkillVersion } from "@/lib/skills/registry";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const versions = await listSkillVersions(decodeURIComponent(id));
    return NextResponse.json({
      ok: true,
      versions: versions.map((item) => ({
        id: item.id,
        skillId: item.skillId,
        version: item.version,
        createdAt: item.createdAt,
        changeNote: item.changeNote,
        hash: item.hash,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "请求体必须是 JSON 对象");
    }
    const input = skillVersionSaveSchema.parse(body);
    const snapshot = await saveSkillVersion(decodeURIComponent(id), input.changeNote, input.version);
    return NextResponse.json({ ok: true, snapshot, message: "已保存版本快照" });
  } catch (error) {
    return handleRouteError(error);
  }
}
