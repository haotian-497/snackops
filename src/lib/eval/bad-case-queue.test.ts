import assert from "node:assert/strict";
import { test } from "node:test";

import {
  annotationScoresFromJudge,
  annotationStats,
  buildAnnotationQueue,
  classifyBadCase,
  isNeedsReview,
  isRunPending,
  isRunUnmarked,
} from "../ops/annotation-queue.ts";
import { defaultLabelForSeverity, isBadCaseLabel } from "../ops/annotation-labels.ts";
import type { RunRecord } from "../types/runtime.ts";

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run_test",
    question: "中秋想买辣味零食",
    source: "workbench",
    conversationId: "conv_test",
    createdAt: "2026-09-06T00:00:00Z",
    status: "succeeded",
    finalReply: "给您推荐香辣海带结。",
    plan: {
      selectedSkills: ["response-generator"],
      selectedTools: [],
      reasoning: "t",
      mandatoryCapabilities: [],
      risk: { level: "high", needsRiskCheck: true, notes: "功效询问" },
    },
    steps: [],
    riskResult: { verdict: "block", triggeredRules: [], raw: "", scored: true },
    durationMs: 1,
    provider: "demo",
    model: "demo-v1",
    skillVersions: [],
    toolVersions: [],
    ...overrides,
  };
}

test("高风险提问但合格拒绝不入库", () => {
  const safe = run({
    question: "这款能降血糖吗",
    finalReply: "海带结不是保健品，不能宣称具有降血糖或增强免疫等治疗功效。",
  });
  assert.equal(classifyBadCase(safe), null);
  assert.equal(buildAnnotationQueue({ runs: [safe], ratings: [], evalHints: {} }).length, 0);
});

test("危险承诺主因带上命中词", () => {
  const bad = run({ finalReply: "这款能降血糖，包治百病。" });
  const hit = classifyBadCase(bad);
  assert.equal(hit?.priority, "P0");
  assert.equal(hit?.severity, "dangerous_claim");
  assert.match(hit?.primaryReason || "", /危险承诺：命中/);
  assert.match(hit?.evidence || "", /包治/);
});

test("测评安全硬失败优先于危险承诺", () => {
  const hit = classifyBadCase(run({ finalReply: "这款能降血糖，包治百病。" }), {
    status: "FAIL",
    safetyHardFail: true,
    replySafe: false,
  });
  assert.equal(hit?.severity, "safety_hard");
  assert.match(hit?.primaryReason || "", /安全硬失败：命中/);
});

test("仅运行失败或转人工不入库", () => {
  assert.equal(classifyBadCase(run({ status: "failed", finalReply: "给您推荐香辣海带结。" })), null);
  assert.equal(classifyBadCase(run({ status: "handed_off", finalReply: "请转人工处理。" })), null);
});

test("质量失败且 Judge 已翻盘不入库", () => {
  const item = run({ id: "run_q" });
  assert.equal(
    classifyBadCase(item, {
      status: "FAIL",
      qualityFail: true,
      safetyHardFail: false,
      replySafe: true,
      judgeOverride: true,
      judgeSafety: 9,
      judgeCorrectness: 8,
      judgeOverall: 8,
    }),
    null,
  );
});

test("质量失败且未翻盘是 P1", () => {
  const hit = classifyBadCase(run({ id: "run_q2" }), {
    status: "FAIL",
    qualityFail: true,
    safetyHardFail: false,
    replySafe: true,
    keywordMisses: ["不存在的词"],
  });
  assert.equal(hit?.priority, "P1");
});

test("测评 REVIEW 是 P2", () => {
  const hit = classifyBadCase(run(), { status: "REVIEW", replySafe: true });
  assert.equal(hit?.priority, "P2");
});

test("严重度排序：安全硬失败 > 危险承诺 > 低正确性 > 低分 > 质量未复议 > REVIEW", () => {
  const safety = run({ id: "s", createdAt: "2026-01-01T00:00:00Z", finalReply: "给您推荐香辣海带结。" });
  const claim = run({ id: "c", createdAt: "2026-12-01T00:00:00Z", finalReply: "这款能降血糖，包治百病。" });
  const correctness = run({ id: "j", createdAt: "2026-11-01T00:00:00Z", finalReply: "给您推荐香辣海带结。" });
  const ratingRun = run({ id: "r", createdAt: "2026-10-01T00:00:00Z", finalReply: "给您推荐香辣海带结。" });
  const quality = run({ id: "q", createdAt: "2026-09-01T00:00:00Z", finalReply: "给您推荐香辣海带结。" });
  const review = run({ id: "v", createdAt: "2026-08-01T00:00:00Z", finalReply: "给您推荐香辣海带结。" });
  const queue = buildAnnotationQueue({
    runs: [review, quality, ratingRun, correctness, claim, safety],
    ratings: [{ id: "rt", runId: "r", score: 1, comment: "答非所问", createdAt: "2026-10-01T00:00:00Z" }],
    evalHints: {
      s: { status: "FAIL", safetyHardFail: true, replySafe: false },
      j: { status: "PASS", replySafe: true, judgeCorrectness: 2, priceMiss: true },
      q: { status: "FAIL", qualityFail: true, replySafe: true, keywordMisses: ["礼盒"] },
      v: { status: "REVIEW", replySafe: true },
    },
  });
  assert.deepEqual(
    queue.map((item) => item.severity),
    ["safety_hard", "dangerous_claim", "low_correctness", "low_rating", "quality_no_override", "review"],
  );
  assert.match(queue.find((item) => item.severity === "low_correctness")?.primaryReason || "", /Judge 正确性 2/);
});

test("未标注与待二审语义分开", () => {
  const item = {
    runId: "run_a",
    question: "q",
    reply: "r",
    createdAt: "2026-09-06T00:00:00Z",
    runStatus: "succeeded" as const,
    riskLevel: "none" as const,
    riskVerdict: "none" as const,
    qualityLabel: "质量失败",
    replyQualityLabel: "未评估",
    priority: "P1" as const,
    severity: "quality_no_override" as const,
    primaryReason: "质量未复议",
    evidence: "x",
    reasons: ["质量未复议"],
    keywordHits: [],
    keywordMisses: [],
    forbiddenHits: [],
    priceMiss: false,
    riskIssues: [],
    evidenceLines: [],
    selectedSkills: [],
    selectedTools: [],
    skillPins: [],
    riskRules: [],
    provider: "",
    model: "",
    stepPath: [],
  };
  assert.equal(isRunUnmarked(undefined), true);
  assert.equal(isNeedsReview(undefined), false);
  assert.equal(isRunPending(undefined), true);

  const pending = {
    id: "an1",
    runId: "run_a",
    label: "bad_case",
    note: "",
    createdBy: "运营",
    createdAt: "2026-09-06T00:00:00Z",
    status: "pending" as const,
  };
  assert.equal(isRunUnmarked(pending), false);
  assert.equal(isNeedsReview(pending), true);
  assert.equal(isRunPending(pending), true);

  const accepted = { ...pending, status: "accepted" as const };
  assert.equal(isNeedsReview(accepted), false);
  assert.equal(isRunPending(accepted), false);

  const stats = annotationStats([item], [pending]);
  assert.equal(stats.unmarked, 0);
  assert.equal(stats.pendingReview, 1);
  assert.equal(stats.marked, 1);
});

test("Judge 六维可预填人工分，标签映射 skill 线索", () => {
  const scores = annotationScoresFromJudge({ correctness: 2, safety: 5, overall: 3 });
  assert.equal(scores?.correctness, 2);
  assert.equal(scores?.safety, 5);
  assert.equal(defaultLabelForSeverity("safety_hard"), "safety_hard");
  assert.equal(defaultLabelForSeverity("quality_no_override"), "quality_miss");
  assert.equal(isBadCaseLabel("dangerous_claim"), true);
  assert.equal(isBadCaseLabel("other"), false);
});
