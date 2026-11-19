import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { getPlannerRecord, updatePlanner } from "@/lib/planner/registry";
import { plannerPatchSchema } from "@/lib/schemas/admin";

export async function GET() {
  try {
    const record = await getPlannerRecord();
    return NextResponse.json({ ok: true, ...record });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "请求体必须是 JSON 对象");
    }
    const patch = plannerPatchSchema.parse(body);
    const saved = await updatePlanner(patch);
    return NextResponse.json({
      ok: true,
      ...saved,
      message: "已保存 Planner，修改前快照已保留",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
