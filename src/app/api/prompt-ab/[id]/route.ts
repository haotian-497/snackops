import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { deletePromptAbExperiment, getPromptAbDetail } from "@/lib/ops/prompt-ab";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const detail = await getPromptAbDetail(id);
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const result = await deletePromptAbExperiment(id);
    return NextResponse.json({ ok: true, ...result, message: "已删除实验（未回滚已晋升的生产配置）" });
  } catch (error) {
    return handleRouteError(error);
  }
}
