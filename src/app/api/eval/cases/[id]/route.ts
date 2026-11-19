import { NextResponse } from "next/server";

import { deleteEvalCase, getEvalCase, updateEvalCase } from "@/lib/eval/cases";
import { handleRouteError, jsonError } from "@/lib/http";
import { evalCaseFieldsSchema } from "@/lib/schemas/eval";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const item = await getEvalCase(id);
    return NextResponse.json({ ok: true, case: item });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const item = await updateEvalCase(id, evalCaseFieldsSchema.parse(body));
    return NextResponse.json({ ok: true, case: item, message: "已更新评测用例" });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteEvalCase(id);
    return NextResponse.json({ ok: true, message: "已删除评测用例" });
  } catch (error) {
    return handleRouteError(error);
  }
}
