import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { skillPatchSchema } from "@/lib/schemas/registry";
import { getSkill, updateSkill } from "@/lib/skills/registry";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const skill = await getSkill(decodeURIComponent(id));
    return NextResponse.json({ ok: true, skill });
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
    const patch = skillPatchSchema.parse(body);
    const skill = await updateSkill(decodeURIComponent(id), patch);
    return NextResponse.json({ ok: true, skill, message: "已保存 Skill" });
  } catch (error) {
    return handleRouteError(error);
  }
}
