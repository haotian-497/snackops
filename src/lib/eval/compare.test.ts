import assert from "node:assert/strict";
import { test } from "node:test";

import { applyRecount, compareEvalBatches } from "./batch-stats.ts";
import type { EvalBatch, EvalCaseResult } from "../types/eval.ts";

function result(partial: Partial<EvalCaseResult> & Pick<EvalCaseResult, "caseId" | "status">): EvalCaseResult {
  return {
    name: partial.name || partial.caseId,
    question: "q",
    finalReply: partial.finalReply ?? "reply",
    reason: "",
    keywordHits: [],
    keywordMisses: [],
    forbiddenHits: [],
    mentionedPrice: [],
    riskIssues: [],
    capabilityHits: [],
    capabilityPath: [],
    durationMs: partial.durationMs ?? 10,
    evidence: [],
    inputRisk: false,
    replySafe: true,
    shouldSend: true,
    ...partial,
  };
}

function batch(partial: Partial<EvalBatch> & Pick<EvalBatch, "id" | "caseIds" | "caseResults">): EvalBatch {
  const counted = applyRecount({
    caseIds: partial.caseIds,
    caseResults: partial.caseResults,
    total: partial.caseIds.length,
  });
  return {
    name: partial.id,
    versionLabel: partial.versionLabel || partial.id,
    changeNote: "",
    caseSnapshot: [],
    caseSetHash: "hash",
    skillVersion: "s",
    skillHash: "sh",
    evaluatorVersion: "rule-v1",
    evaluatorHash: "eval",
    evaluatorMode: "rules",
    judgeEnabled: false,
    provider: "demo",
    model: "demo-v1",
    params: { temperature: 0.2, maxTokens: 800 },
    createdAt: "2026-09-06T00:00:00Z",
    saved: true,
    saveOnComplete: false,
    status: "done",
    currentIndex: partial.caseIds.length,
    ...counted,
    ...partial,
  };
}

test("修改 passed 字段不能改写 caseResults 统计", () => {
  const item = batch({
    id: "eb_a",
    caseIds: ["c1", "c2"],
    caseResults: [result({ caseId: "c1", status: "PASS" }), result({ caseId: "c2", status: "FAIL" })],
    passed: 99,
  });
  const counted = applyRecount(item);
  assert.equal(counted.passed, 1);
  assert.equal(counted.failed, 1);
  assert.equal(counted.total, 2);
  assert.equal(counted.qualityPassRate, 0.5);
});

test("相同快照下 FAIL→PASS 显示已修复，PASS→FAIL 显示新增失败", () => {
  const shared = {
    caseIds: ["c1", "c2"],
    caseSetHash: "same",
    evaluatorVersion: "rule-v1",
    evaluatorHash: "eval",
  };
  const baseline = batch({
    ...shared,
    id: "baseline-v1",
    versionLabel: "baseline-v1",
    skillVersion: "risk@1",
    skillHash: "skill-old",
    caseResults: [
      result({ caseId: "c1", status: "FAIL", finalReply: "旧失败回复" }),
      result({ caseId: "c2", status: "PASS", finalReply: "旧通过回复" }),
    ],
  });
  const candidate = batch({
    ...shared,
    id: "risk-fix-v2",
    versionLabel: "risk-fix-v2",
    skillVersion: "risk@2",
    skillHash: "skill-new",
    caseResults: [
      result({ caseId: "c1", status: "PASS", finalReply: "新通过回复" }),
      result({ caseId: "c2", status: "FAIL", finalReply: "新失败回复" }),
    ],
  });
  const compare = compareEvalBatches(baseline, candidate);
  assert.equal(compare.comparable, true);
  assert.equal(compare.skills.same, false);
  assert.equal(compare.conditions.skillSame, false);
  assert.ok(compare.notes.some((item) => item.includes("技能配置不同")));
  assert.equal(compare.fixed[0]?.caseId, "c1");
  assert.equal(compare.fixed[0]?.baselineReply, "旧失败回复");
  assert.equal(compare.fixed[0]?.candidateReply, "新通过回复");
  assert.equal(compare.newFailures[0]?.caseId, "c2");
  assert.equal(compare.newFailures[0]?.baselineReply, "旧通过回复");
  assert.equal(compare.newFailures[0]?.candidateReply, "新失败回复");
});

test("caseSetHash 不同则不可直接比较", () => {
  const baseline = batch({
    id: "a",
    caseIds: ["c1"],
    caseSetHash: "one",
    caseResults: [result({ caseId: "c1", status: "PASS" })],
  });
  const candidate = batch({
    id: "b",
    caseIds: ["c1"],
    caseSetHash: "two",
    caseResults: [result({ caseId: "c1", status: "PASS" })],
  });
  const compare = compareEvalBatches(baseline, candidate);
  assert.equal(compare.comparable, false);
  assert.ok(compare.reasons.some((item) => item.includes("不可直接比较")));
  assert.deepEqual(compare.fixed, []);
});

test("skillHash 不同仍可比较，并标记回复变化", () => {
  const shared = {
    caseIds: ["c1"],
    caseSetHash: "same",
    evaluatorVersion: "rule-v1",
    evaluatorHash: "eval",
  };
  const baseline = batch({
    ...shared,
    id: "a",
    skillVersion: "s@1",
    skillHash: "h1",
    caseResults: [result({ caseId: "c1", status: "PASS", finalReply: "hello" })],
  });
  const candidate = batch({
    ...shared,
    id: "b",
    skillVersion: "s@2",
    skillHash: "h2",
    caseResults: [result({ caseId: "c1", status: "PASS", finalReply: "hello world" })],
  });
  const compare = compareEvalBatches(baseline, candidate);
  assert.equal(compare.comparable, true);
  assert.equal(compare.skills.same, false);
  assert.equal(compare.replyChangedSameStatus[0]?.caseId, "c1");
  assert.equal(compare.replyChangedSameStatus[0]?.baselineReply, "hello");
  assert.equal(compare.replyChangedSameStatus[0]?.candidateReply, "hello world");
});