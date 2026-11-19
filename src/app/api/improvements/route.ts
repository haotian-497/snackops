import { NextResponse } from "next/server";

import { listRunRecords } from "@/lib/agent/runs";
import { handleRouteError, jsonError } from "@/lib/http";
import { enrichImprovementsWithSamples } from "@/lib/ops/improvement-samples";
import { improvementFunnel } from "@/lib/ops/improvement-stats";
import { listImprovements, upsertImprovement } from "@/lib/ops/improvements";
import { inferIssueType } from "@/lib/ops/issue";
import { improvementCreateSchema } from "@/lib/schemas/ops";

export async function GET() {
  try {
    const [improvements, runs] = await Promise.all([listImprovements(), listRunRecords()]);
    const enriched = enrichImprovementsWithSamples(improvements, runs);
    return NextResponse.json({
      ok: true,
      improvements: enriched,
      funnel: improvementFunnel(improvements),
      clusterNote: "规则聚类",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = improvementCreateSchema.parse(body);
    const issueType = input.issueType || inferIssueType([input.title, input.note || ""].join(" "));
    const improvement = await upsertImprovement({
      title: input.title,
      source: input.source,
      owner: input.owner,
      issueType,
      runId: input.runId,
      skillId: input.skillId,
      note: input.note,
      target: input.target,
    });
    return NextResponse.json({ ok: true, improvement, message: "已创建/归并改进建议" });
  } catch (error) {
    return handleRouteError(error);
  }
}
