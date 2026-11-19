import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { suggestAbFromImprovement } from "@/lib/ops/improvements";
import { improvementIdSchema } from "@/lib/schemas/ops";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = improvementIdSchema.parse(body);
    const result = await suggestAbFromImprovement(input.improvementId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error);
  }
}
