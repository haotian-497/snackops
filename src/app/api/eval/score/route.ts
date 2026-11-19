import { NextResponse } from "next/server";

import { getRunRecord } from "@/lib/agent/runs";
import { getEvalCase } from "@/lib/eval/cases";
import { scoreEvalWithJudge } from "@/lib/eval/judge";
import { scoreEval } from "@/lib/eval/score";
import { handleRouteError, jsonError } from "@/lib/http";
import { evalScoreSchema } from "@/lib/schemas/eval";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = evalScoreSchema.parse(body);
    const item = await getEvalCase(input.caseId);
    const run = input.runId ? await getRunRecord(input.runId) : null;
    const score = await scoreEvalWithJudge(scoreEval({ case: item, run, error: input.error }), { case: item, run });
    return NextResponse.json({ ok: true, score, case: item });
  } catch (error) {
    return handleRouteError(error);
  }
}
