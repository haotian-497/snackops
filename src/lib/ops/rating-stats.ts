import type { Rating, RatingChannel } from "@/lib/types";

export function normalizeRating(item: Rating): Rating {
  return {
    ...item,
    channel: item.channel === "user" ? "user" : "ops",
    createdBy: item.createdBy || (item.channel === "user" ? "用户" : "运营"),
  };
}

export function filterRatings(
  ratings: Rating[],
  query: { from?: string; to?: string; score?: number; issueType?: string; channel?: RatingChannel | "all" },
) {
  return ratings.filter((item) => {
    const channel = normalizeRating(item).channel;
    if (query.channel && query.channel !== "all" && channel !== query.channel) return false;
    if (query.score !== undefined && item.score !== query.score) return false;
    if (query.issueType && item.issueType !== query.issueType) return false;
    if (query.from && item.createdAt < query.from) return false;
    if (query.to && item.createdAt > query.to) return false;
    return true;
  });
}

/** 每个 run 取最新一条；同刻优先用户分。 */
export function latestRatingByRun(ratings: Rating[]): Record<string, Rating> {
  const map: Record<string, Rating> = {};
  const ordered = [...ratings].map(normalizeRating).sort((a, b) => {
    const byTime = b.createdAt.localeCompare(a.createdAt);
    if (byTime !== 0) return byTime;
    if (a.channel === "user" && b.channel !== "user") return -1;
    if (b.channel === "user" && a.channel !== "user") return 1;
    return 0;
  });
  for (const item of ordered) {
    if (!map[item.runId]) map[item.runId] = item;
  }
  return map;
}

export function ratingStats(
  ratings: Rating[],
  options: { channel?: RatingChannel | "all"; succeededRunCount?: number } = {},
) {
  const channel = options.channel ?? "user";
  const scoped = filterRatings(ratings.map(normalizeRating), { channel });
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byIssueType: Record<string, number> = {};
  let sum = 0;
  let low = 0;
  for (const item of scoped) {
    const score = Math.min(5, Math.max(1, Math.round(item.score))) as 1 | 2 | 3 | 4 | 5;
    distribution[score] += 1;
    sum += item.score;
    if (item.score <= 2) low += 1;
    const issue = item.issueType || "other";
    byIssueType[issue] = (byIssueType[issue] ?? 0) + 1;
  }
  const total = scoped.length;
  const avgScore = total ? Math.round((sum / total) * 10) / 10 : 0;
  const lowRate = total ? Math.round((low / total) * 1000) / 10 : 0;
  const uniqueRuns = new Set(scoped.map((item) => item.runId)).size;
  const succeeded = options.succeededRunCount ?? 0;
  const coverage = succeeded > 0 ? Math.round((uniqueRuns / succeeded) * 1000) / 10 : 0;
  return {
    total,
    avgScore,
    lowCount: low,
    lowRate,
    distribution,
    byIssueType,
    uniqueRuns,
    coverage,
    channel,
  };
}
