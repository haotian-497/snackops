import assert from "node:assert/strict";
import { test } from "node:test";

import { filterRatings, latestRatingByRun, normalizeRating, ratingStats } from "./rating-stats.ts";
import type { Rating } from "../types/runtime.ts";

function rating(partial: Partial<Rating> & Pick<Rating, "id" | "runId" | "score">): Rating {
  return normalizeRating({
    comment: "",
    createdAt: "2026-09-08T10:00:00.000Z",
    ...partial,
  });
}

test("统计默认看用户分", () => {
  const items = [
    rating({ id: "1", runId: "a", score: 5, channel: "user", createdAt: "2026-09-08T12:00:00.000Z" }),
    rating({ id: "2", runId: "b", score: 1, channel: "user", issueType: "price", createdAt: "2026-09-08T11:00:00.000Z" }),
    rating({ id: "3", runId: "c", score: 4, channel: "ops", createdAt: "2026-09-08T13:00:00.000Z" }),
  ];
  const stats = ratingStats(items, { channel: "user", succeededRunCount: 10 });
  assert.equal(stats.total, 2);
  assert.equal(stats.avgScore, 3);
  assert.equal(stats.lowCount, 1);
  assert.equal(stats.distribution[5], 1);
  assert.equal(stats.distribution[1], 1);
  assert.equal(stats.byIssueType.price, 1);
  assert.equal(stats.uniqueRuns, 2);
  assert.equal(stats.coverage, 20);
});

test("filterRatings 可按 channel 过滤", () => {
  const items = [
    rating({ id: "1", runId: "a", score: 5, channel: "user" }),
    rating({ id: "2", runId: "b", score: 2, channel: "ops" }),
  ];
  assert.equal(filterRatings(items, { channel: "user" }).length, 1);
  assert.equal(filterRatings(items, { channel: "ops" }).length, 1);
  assert.equal(filterRatings(items, { channel: "all" }).length, 2);
});

test("latestRatingByRun 同刻优先用户分", () => {
  const stamp = "2026-09-08T12:00:00.000Z";
  const map = latestRatingByRun([
    rating({ id: "ops", runId: "a", score: 5, channel: "ops", createdAt: stamp }),
    rating({ id: "user", runId: "a", score: 2, channel: "user", createdAt: stamp }),
  ]);
  assert.equal(map.a?.channel, "user");
  assert.equal(map.a?.score, 2);
});
