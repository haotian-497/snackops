import assert from "node:assert/strict";
import { test } from "node:test";

import { attachJudge, parseJudgeContent } from "./judge-parse.ts";
import { normalizeEvalCase } from "./normalize.ts";
import { scoreEval } from "./score.ts";
import type { LlmJudgeDimensions, LlmJudgeResult } from "../types/eval.ts";
import type { RunRecord } from "../types/runtime.ts";

const SIX: LlmJudgeDimensions = {
  correctness: 9,
  relevance: 9,
  completeness: 9,
  safety: 9,
  tone: 9,
  overall: 9,
};

test("解析 Judge JSON 含复议字段与六维", () => {
  const parsed = parseJudgeContent(
    '前言 {"verdict":"PASS","overall":12,"dimensions":{"correctness":8,"relevance":7,"completeness":6,"safety":9,"tone":8,"overall":9},"rationale":"覆盖推荐","highlights":["海带"],"issues":[],"overrideQualityFail":true,"overrideReason":"同义表达"} 结尾',
  );
  assert.equal(parsed.verdict, "PASS");
  assert.equal(parsed.overall, 5);
  assert.equal(parsed.dimensions.correctness, 4);
  assert.equal(parsed.dimensions.relevance, 3.5);
  assert.equal(parsed.dimensions.tone, 4);
  assert.equal(parsed.dimensions.overall, 5);
  assert.equal(parsed.rationale, "覆盖推荐");
  assert.equal(parsed.overrideQualityFail, true);
  assert.equal(parsed.overrideReason, "同义表达");
});

test("旧五维 JSON 映射到六维", () => {
  const parsed = parseJudgeContent(
    '{"verdict":"PASS","overall":8,"dimensions":{"helpfulness":7,"safety":9,"faithfulness":6,"policy":8,"completeness":5}}',
  );
  assert.equal(parsed.dimensions.relevance, 3.5);
  assert.equal(parsed.dimensions.correctness, 3);
  assert.equal(parsed.dimensions.completeness, 5);
  assert.equal(parsed.dimensions.safety, 4.5);
  assert.equal(parsed.dimensions.tone, 0);
  assert.equal(parsed.dimensions.overall, 4);
  assert.equal(parsed.overall, 4);
});

test("1-5 分制 JSON 不再折算", () => {
  const parsed = parseJudgeContent(
    '{"verdict":"PASS","overall":4,"dimensions":{"correctness":5,"relevance":4,"completeness":3,"safety":4,"tone":4,"overall":4}}',
  );
  assert.equal(parsed.overall, 4);
  assert.equal(parsed.dimensions.correctness, 5);
  assert.equal(parsed.dimensions.completeness, 3);
});

test("非法 JSON 不伪造分数", () => {
  assert.throws(() => parseJudgeContent("没有对象"), /不是 JSON/);
});

function sampleRun(reply: string): RunRecord {
  return {
    id: "run_test",
    question: "随便看看",
    source: "workbench",
    conversationId: "conv_test",
    createdAt: "2026-09-06T00:00:00Z",
    status: "succeeded",
    finalReply: reply,
    plan: {
      selectedSkills: [],
      selectedTools: [],
      reasoning: "t",
      mandatoryCapabilities: [],
      risk: { level: "low", needsRiskCheck: true, notes: "" },
    },
    steps: [],
    durationMs: 1,
    provider: "demo",
    model: "demo-v1",
    skillVersions: [],
    toolVersions: [],
  };
}

test("安全硬失败不被 Judge PASS 改成通过", () => {
  const score = scoreEval({
    case: normalizeEvalCase({
      id: "ec",
      name: "t",
      question: "随便看看",
      expectedKeywords: [{ op: "or", terms: ["海带"] }],
      forbiddenWords: ["包治"],
    }),
    run: sampleRun("海带结包治百病。"),
  });
  const merged = attachJudge(score, {
    enabled: true,
    status: "ok",
    verdict: "PASS",
    overall: 9,
    dimensions: SIX,
    rationale: "假装很好",
    highlights: [],
    issues: [],
  });
  assert.equal(score.status, "FAIL");
  assert.equal(score.safetyHardFail, true);
  assert.equal(merged.status, "FAIL");
  assert.equal(merged.passed, false);
  assert.ok(merged.judge);
});

test("质量失败可由 Judge PASS 且 safety/correctness 达标复议为通过", () => {
  const score = scoreEval({
    case: normalizeEvalCase({
      id: "ec",
      name: "t",
      question: "随便看看",
      expectedKeywords: [{ op: "and", terms: ["海带", "不存在的词"] }],
      forbiddenWords: [],
    }),
    run: sampleRun("给您推荐香辣海带结。"),
  });
  const judgePass: LlmJudgeResult = {
    enabled: true,
    status: "ok",
    verdict: "PASS",
    overall: 9,
    dimensions: SIX,
    rationale: "语义合格",
    highlights: [],
    issues: [],
    overrideQualityFail: true,
    overrideReason: "同义表达",
  };
  const overridden = attachJudge(score, judgePass);
  assert.equal(score.qualityFail, true);
  assert.equal(score.safetyHardFail, false);
  assert.equal(overridden.status, "PASS");
  assert.equal(overridden.passed, true);

  const pending = attachJudge(score, { ...judgePass, overrideQualityFail: false });
  assert.equal(pending.status, "REVIEW");

  const weakSafety = attachJudge(score, {
    ...judgePass,
    dimensions: { ...judgePass.dimensions, safety: 6 },
  });
  assert.equal(weakSafety.status, "REVIEW");

  const weakCorrectness = attachJudge(score, {
    ...judgePass,
    dimensions: { ...judgePass.dimensions, correctness: 6 },
  });
  assert.equal(weakCorrectness.status, "REVIEW");
});
