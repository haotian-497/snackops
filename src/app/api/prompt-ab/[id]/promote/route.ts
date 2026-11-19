import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { promotePromptAbExperiment } from "@/lib/ops/prompt-ab";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const result = await promotePromptAbExperiment(id);
    return NextResponse.json({
      ok: true,
      ...result,
      message: "已人工确认并写入生产 Skill，改进建议已标记完成",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
