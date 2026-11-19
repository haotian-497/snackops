import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { countCasesBySuite, createPromptAbFromImprovement, listPromptAbExperimentViews } from "@/lib/ops/prompt-ab";
import { z } from "zod";

const fromImprovementSchema = z.object({
  improvementId: z.string().min(1),
});

export async function GET() {
  try {
    const [experiments, suiteCounts] = await Promise.all([listPromptAbExperimentViews(), countCasesBySuite()]);
    return NextResponse.json({ ok: true, experiments, suiteCounts });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = fromImprovementSchema.parse(body);
    const result = await createPromptAbFromImprovement(input.improvementId);
    return NextResponse.json({
      ok: true,
      ...result,
      message: "已创建 Prompt A/B 实验（未写生产）",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
