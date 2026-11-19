import "server-only";

import { randomUUID } from "node:crypto";

import { getRunRecord, listRunRecords } from "@/lib/agent/runs";
import { upsertImprovement } from "@/lib/ops/improvements";
import { inferIssueType } from "@/lib/ops/issue";
import {
  filterRatings,
  latestRatingByRun,
  normalizeRating,
  ratingStats,
} from "@/lib/ops/rating-stats";
import { readJson, updateJson } from "@/lib/store";
import type { Rating, RatingChannel } from "@/lib/types";

export { filterRatings, latestRatingByRun, normalizeRating, ratingStats } from "@/lib/ops/rating-stats";

export async function listRatings(): Promise<Rating[]> {
  const items = await readJson<Rating[]>("ratings.json");
  return items.map(normalizeRating).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createRating(input: {
  runId: string;
  score: number;
  comment?: string;
  issueType?: string;
  channel?: RatingChannel;
  createdBy?: string;
}): Promise<Rating> {
  const run = await getRunRecord(input.runId);
  if (!run) throw new Error(`未找到运行：${input.runId}`);
  const channel: RatingChannel = input.channel === "user" ? "user" : "ops";
  const issueType = input.issueType || inferIssueType(`${run.question} ${input.comment || ""}`);
  const now = new Date().toISOString();
  const rating: Rating = {
    id: `rt_${randomUUID()}`,
    runId: input.runId,
    score: input.score,
    comment: input.comment || "",
    createdAt: now,
    question: run.question,
    reply: run.finalReply,
    issueType,
    channel,
    createdBy: input.createdBy?.trim() || (channel === "user" ? "用户" : "运营"),
  };

  await updateJson<Rating[]>("ratings.json", (current) => {
    const rest = current.filter((item) => !(item.runId === rating.runId && normalizeRating(item).channel === channel));
    return [rating, ...rest];
  });

  if (input.score <= 2) {
    await upsertImprovement({
      title: `低分评分：${issueType}`,
      source: "rating",
      issueType,
      runId: input.runId,
      note: input.comment || `评分 ${input.score}（${channel}）`,
    });
  }
  return rating;
}

export async function ratingStatsWithRuns(channel: RatingChannel | "all" = "user") {
  const [ratings, runs] = await Promise.all([listRatings(), listRunRecords()]);
  const succeededRunCount = runs.filter((item) => item.status === "succeeded").length;
  return ratingStats(ratings, { channel, succeededRunCount });
}
