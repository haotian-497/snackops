import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyOpsMetrics } from "./compute-metrics.ts";
import { buildKpiCards } from "./kpi.ts";

describe("buildKpiCards", () => {
  it("shows error cards instead of zero when runs failed to load", () => {
    const cards = buildKpiCards({
      metrics: emptyOpsMetrics,
      runsError: "runs.json 读取失败",
      rangeLabel: "近 7 天",
      trafficLabel: "业务",
    });
    assert.ok(cards.every((card) => card.status === "error"));
    assert.equal(cards[0].status, "error");
    if (cards[0].status === "error") assert.equal(cards[0].message, "runs.json 读取失败");
  });

  it("highlights low technical success and high handoff", () => {
    const cards = buildKpiCards({
      metrics: {
        ...emptyOpsMetrics,
        totalRuns: 10,
        finishedRuns: 10,
        technicalSuccessRate: 0.5,
        autoResolveRate: 0.3,
        handoffRate: 0.45,
        avgDurationMs: 25_000,
        p95DurationMs: 40_000,
        statusCounts: { succeeded: 3, failed: 2, handed_off: 5, running: 0 },
      },
      rangeLabel: "近 7 天",
      trafficLabel: "业务",
    });
    const byId = Object.fromEntries(cards.map((card) => [card.id, card]));
    assert.equal(byId.technicalSuccessRate.status === "ok" && byId.technicalSuccessRate.alert, "danger");
    assert.equal(byId.handoffRate.status === "ok" && byId.handoffRate.alert, "danger");
    assert.equal(byId.avgDurationMs.status === "ok" && byId.avgDurationMs.alert, "warn");
  });

  it("uses em dash when no finished runs instead of fake zero rates as errors", () => {
    const cards = buildKpiCards({
      metrics: { ...emptyOpsMetrics, totalRuns: 0, finishedRuns: 0 },
      rangeLabel: "今日",
      trafficLabel: "业务",
    });
    const tech = cards.find((card) => card.id === "technicalSuccessRate");
    assert.equal(tech?.status, "ok");
    assert.equal(tech?.status === "ok" && tech.value, "—");
  });
});
