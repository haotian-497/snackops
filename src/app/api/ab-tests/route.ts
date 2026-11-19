import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { createAbTest, listAbTests, updateAbTest } from "@/lib/ops/ab-tests";
import { abTestCreateSchema, abTestPatchSchema } from "@/lib/schemas/ops";

export async function GET() {
  try {
    const tests = await listAbTests();
    return NextResponse.json({ ok: true, tests });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const test = await createAbTest(abTestCreateSchema.parse(body));
    return NextResponse.json({ ok: true, test, message: "已创建 Prompt A/B" });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = abTestPatchSchema.parse(body);
    const test = await updateAbTest(input.id, input);
    return NextResponse.json({ ok: true, test, message: "已更新 A/B 实验" });
  } catch (error) {
    return handleRouteError(error);
  }
}
