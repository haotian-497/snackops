import { NextResponse } from "next/server";
import { z } from "zod";

import { handleRouteError } from "@/lib/http";
import { runPromptAbExperiment } from "@/lib/ops/prompt-ab";

type Ctx = { params: Promise<{ id: string }> };

const runSchema = z.object({
  caseSuite: z.enum(["ab-smoke", "all"]).optional(),
});

export async function POST(request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const input = runSchema.parse(body && typeof body === "object" ? body : {});
    const result = await runPromptAbExperiment(id, { caseSuite: input.caseSuite });
    const suiteLabel = result.caseSuite === "ab-smoke" ? "AB 烟测" : "全部启用";
    return NextResponse.json({
      ok: true,
      ...result,
      message: `已启动对照/实验双批跑测（${suiteLabel} · 焦点 ${result.focusCount} · 回归 ${result.regressionCount} · 共 ${result.experiment.caseIds.length} 条）`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
