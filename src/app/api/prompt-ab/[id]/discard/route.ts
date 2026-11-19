import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { discardPromptAbExperiment } from "@/lib/ops/prompt-ab";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const experiment = await discardPromptAbExperiment(id);
    return NextResponse.json({ ok: true, experiment, message: "已废弃实验，未写生产" });
  } catch (error) {
    return handleRouteError(error);
  }
}
