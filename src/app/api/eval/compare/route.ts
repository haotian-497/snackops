import { getEvalBatch } from "@/lib/eval/batch";
import { compareEvalBatches } from "@/lib/eval/compare";
import { handleRouteError, jsonError } from "@/lib/http";
import { evalCompareQuerySchema } from "@/lib/schemas/eval";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const parsed = evalCompareQuerySchema.safeParse({
      from: new URL(request.url).searchParams.get("from") || "",
      to: new URL(request.url).searchParams.get("to") || "",
    });
    if (!parsed.success) return jsonError(400, "需要 from 与 to 两个批次 id");
    const [baseline, candidate] = await Promise.all([getEvalBatch(parsed.data.from), getEvalBatch(parsed.data.to)]);
    const compare = compareEvalBatches(baseline, candidate);
    return NextResponse.json({ ok: true, compare, baseline, candidate });
  } catch (error) {
    return handleRouteError(error);
  }
}
