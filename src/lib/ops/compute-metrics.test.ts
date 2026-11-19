import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeMetrics,
  dedupeRunsByQuestion,
  filterRunsByTrafficScope,
  filterRunsByTimeRange,
  normalizeQuestionKey,
} from "./compute-metrics.ts";
import type { RunRecord } from "@/lib/types";

function run(partial: Partial<RunRecord> & Pick<RunRecord, "id" | "status" | "source">): RunRecord {
  return {
    question: partial.question ?? "q",
    conversationId: "c1",
    createdAt: partial.createdAt ?? "2026-10-14T10:00:00.000Z",
    finalReply: "",
    plan: partial.plan ?? null,
    steps: partial.steps ?? [],
    riskResult: partial.riskResult ?? null,
    durationMs: partial.durationMs ?? 100,
    provider: "demo",
    model: "demo-v1",
    skillVersions: [],
    toolVersions: [],
    ...partial,
  };
}

describe("filterRunsByTrafficScope", () => {
  const sample = [
    run({ id: "1", status: "succeeded", source: "workbench" }),
    run({ id: "2", status: "succeeded", source: "demo" }),
    run({ id: "3", status: "failed", source: "retry" }),
    run({ id: "4", status: "succeeded", source: "eval" }),
    run({ id: "5", status: "succeeded", source: "legacy" }),
  ];

  it("business includes workbench, demo, retry only", () => {
    const ids = filterRunsByTrafficScope(sample, "business").map((item) => item.id);
    assert.deepEqual(ids, ["1", "2", "3"]);
  });

  it("eval includes only eval source", () => {
    const ids = filterRunsByTrafficScope(sample, "eval").map((item) => item.id);
    assert.deepEqual(ids, ["4"]);
  });

  it("all keeps every source", () => {
    assert.equal(filterRunsByTrafficScope(sample, "all").length, 5);
  });
});

describe("computeMetrics rates", () => {
  it("splits technical success, auto-resolve, and terminal handoff", () => {
    const metrics = computeMetrics([
      run({ id: "s", status: "succeeded", source: "workbench" }),
      run({ id: "h", status: "handed_off", source: "demo" }),
      run({ id: "f", status: "failed", source: "retry", plan: { selectedSkills: [], selectedTools: [], reasoning: "", mandatoryCapabilities: [], risk: { level: "low", needsRiskCheck: false, notes: "" }, handoff: true } }),
      run({ id: "r", status: "running", source: "workbench" }),
    ]);

    assert.equal(metrics.totalRuns, 4);
    assert.equal(metrics.finishedRuns, 3);
    // (1 succeeded + 1 handed_off) / 3 finished
    assert.equal(metrics.technicalSuccessRate, 0.667);
    // 1 succeeded / 3
    assert.equal(metrics.autoResolveRate, 0.333);
    // only terminal handed_off, not plan.handoff on failed
    assert.equal(metrics.handoffRate, 0.333);
    assert.equal(metrics.statusCounts.handed_off, 1);
  });

  it("time filter still works with traffic scope", () => {
    const now = new Date("2026-10-14T12:00:00.000Z");
    const runs = [
      run({ id: "old", status: "succeeded", source: "workbench", createdAt: "2026-09-01T00:00:00.000Z" }),
      run({ id: "new", status: "succeeded", source: "eval", createdAt: "2026-10-14T11:00:00.000Z" }),
    ];
    const scoped = filterRunsByTrafficScope(filterRunsByTimeRange(runs, "7d", now), "eval");
    assert.deepEqual(
      scoped.map((item) => item.id),
      ["new"],
    );
  });
});

describe("dedupeRunsByQuestion", () => {
  it("keeps newest run per normalized question", () => {
    const runs = [
      run({
        id: "new",
        status: "handed_off",
        source: "workbench",
        question: "有客服说我中奖了，让我转账验证才能兑奖",
        createdAt: "2026-10-14T12:00:00.000Z",
      }),
      run({
        id: "old",
        status: "handed_off",
        source: "workbench",
        question: "有客服说我中奖了，让我转账验证才能兑奖！",
        createdAt: "2026-10-13T12:00:00.000Z",
      }),
      run({
        id: "other",
        status: "succeeded",
        source: "demo",
        question: "快递到哪了",
        createdAt: "2026-10-14T11:00:00.000Z",
      }),
    ];
    assert.equal(normalizeQuestionKey(runs[0].question), normalizeQuestionKey(runs[1].question));
    const deduped = dedupeRunsByQuestion(runs);
    assert.deepEqual(
      deduped.map((item) => item.id),
      ["new", "other"],
    );
    const metrics = computeMetrics(deduped);
    assert.equal(metrics.handoffRate, 0.5);
  });
});


