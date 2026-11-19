import { NextResponse } from "next/server";

import { createEvalCase, filterEvalCases, listEvalCases } from "@/lib/eval/cases";
import { handleRouteError, jsonError } from "@/lib/http";
import { evalCaseCreateSchema } from "@/lib/schemas/eval";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const cases = filterEvalCases(await listEvalCases(params.get("enabled") === "1"), {
      category: params.get("category"),
      difficulty: params.get("difficulty"),
      riskLevel: params.get("riskLevel"),
      evalDimension: params.get("evalDimension"),
    });
    return NextResponse.json({ ok: true, cases });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = evalCaseCreateSchema.parse(body);
    const item = await createEvalCase(input);
    return NextResponse.json({ ok: true, case: item, message: "已保存评测用例" });
  } catch (error) {
    return handleRouteError(error);
  }
}
