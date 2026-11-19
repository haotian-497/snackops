import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { rollbackSchema } from "@/lib/schemas/ops";
import { rollbackSkill } from "@/lib/skills/registry";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = rollbackSchema.parse(body);
    const skill = await rollbackSkill(decodeURIComponent(id), input.versionId);
    return NextResponse.json({ ok: true, skill, message: "已回滚到旧版本正文" });
  } catch (error) {
    return handleRouteError(error);
  }
}
