import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { listEvalBatches } from "@/lib/eval/batch";
import { filterEvalCases, listEvalCases } from "@/lib/eval/cases";
import { listSkillRecords } from "@/lib/skills/registry";
import { listTools } from "@/lib/tools/registry";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const enabledOnly = params.get("enabled") === "1";
    const [allCases, batches, skills, tools] = await Promise.all([
      listEvalCases(enabledOnly),
      listEvalBatches(),
      listSkillRecords(),
      listTools(),
    ]);
    const cases = filterEvalCases(allCases, {
      category: params.get("category"),
      difficulty: params.get("difficulty"),
      riskLevel: params.get("riskLevel"),
      evalDimension: params.get("evalDimension"),
    });
    return NextResponse.json({ ok: true, cases, batches, skills, tools });
  } catch (error) {
    return handleRouteError(error);
  }
}
