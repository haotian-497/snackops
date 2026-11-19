import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { splitImprovement } from "@/lib/ops/improvements";
import { improvementSplitSchema } from "@/lib/schemas/ops";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = improvementSplitSchema.parse(body);
    const result = await splitImprovement(input.improvementId, input.runIds);
    return NextResponse.json({ ok: true, ...result, message: "已拆分样本到新建议" });
  } catch (error) {
    return handleRouteError(error);
  }
}
