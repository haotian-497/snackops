import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { createEvalCase, listEvalCases } from "@/lib/ops/eval-cases";
import { evalCaseCreateSchema } from "@/lib/schemas/ops";

export async function GET() {
  try {
    const cases = await listEvalCases();
    return NextResponse.json({ ok: true, cases });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const item = await createEvalCase(evalCaseCreateSchema.parse(body));
    return NextResponse.json({ ok: true, case: item, message: "已写入评测集" });
  } catch (error) {
    return handleRouteError(error);
  }
}
