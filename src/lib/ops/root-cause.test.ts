import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeRunRootCause } from "./root-cause.ts";
import type { RunRecord } from "../types/runtime.ts";

function run(partial: Partial<RunRecord>): RunRecord {
  return {
    id: "run_x",
    question: "测试问题",
    source: "workbench",
    conversationId: "c1",
    createdAt: new Date().toISOString(),
    status: "succeeded",
    finalReply: "你好",
    plan: {
      selectedSkills: ["response-generator"],
      selectedTools: [],
      reasoning: "",
      mandatoryCapabilities: [],
      risk: { level: "low", needsRiskCheck: false, notes: "" },
    },
    steps: [],
    riskResult: null,
    durationMs: 1,
    provider: "x",
    model: "y",
    skillVersions: [],
    toolVersions: [],
    ...partial,
  };
}

describe("analyzeRunRootCause", () => {
  it("attributes missing risk-check to planner with high confidence", () => {
    const diagnosis = analyzeRunRootCause({
      run: run({
        finalReply: "",
        validation: {
          ok: false,
          blocked: true,
          issues: [
            {
              code: "MISSING_RISK_CHECK",
              severity: "block",
              message: "风险场景缺少 risk-check",
              capability: "risk",
            },
          ],
        },
      }),
      label: "empty_reply",
    });
    assert.equal(diagnosis.target, "planner");
    assert.equal(diagnosis.confidence, "high");
    assert.equal(diagnosis.needsConfirm, false);
    assert.match(diagnosis.rootCauseKey, /planner/);
  });

  it("attributes risk block to risk-check skill", () => {
    const diagnosis = analyzeRunRootCause({
      run: run({
        riskResult: { verdict: "block", triggeredRules: ["R2"], raw: "", scored: true },
      }),
      label: "dangerous_claim",
    });
    assert.equal(diagnosis.target, "skill");
    assert.equal(diagnosis.skillId, "risk-check");
    assert.equal(diagnosis.needsConfirm, false);
  });

  it("marks empty allergy reply as skill needing confirm", () => {
    const diagnosis = analyzeRunRootCause({
      run: run({
        question: "我对花生严重过敏，有没有不含花生的零食？",
        finalReply: "",
        validation: { ok: true, blocked: false, issues: [] },
      }),
      label: "empty_reply",
    });
    assert.equal(diagnosis.target, "skill");
    assert.equal(diagnosis.skillId, "allergy-risk-reminder");
    assert.equal(diagnosis.needsConfirm, true);
  });
});
