import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { createRating, filterRatings, listRatings, ratingStatsWithRuns } from "@/lib/ops/ratings";
import { ratingCreateSchema } from "@/lib/schemas/ops";
import type { RatingChannel } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const score = url.searchParams.get("score");
    const channelParam = url.searchParams.get("channel") || "all";
    const channel = (channelParam === "user" || channelParam === "ops" || channelParam === "all"
      ? channelParam
      : "all") as RatingChannel | "all";
    const ratings = filterRatings(await listRatings(), {
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      score: score ? Number(score) : undefined,
      issueType: url.searchParams.get("issueType") || undefined,
      channel,
    });
    const stats = await ratingStatsWithRuns(channel === "all" ? "user" : channel);
    return NextResponse.json({ ok: true, ratings, stats });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const rating = await createRating(ratingCreateSchema.parse(body));
    return NextResponse.json({ ok: true, rating, message: "已保存评分" });
  } catch (error) {
    return handleRouteError(error);
  }
}
