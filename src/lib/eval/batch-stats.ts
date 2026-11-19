import type { EvalBatch, EvalBatchCompare, EvalCaseResult, EvalCompareReason, EvalScoreStatus } from "@/lib/types";

export function recountResults(results: EvalCaseResult[]) {
  const passed = results.filter((item) => item.status === "PASS").length;
  const failed = results.filter((item) => item.status === "FAIL").length;
  const review = results.filter((item) => item.status === "REVIEW").length;
  const errors = results.filter((item) => item.status === "ERROR").length;
  const total = passed + failed + review + errors;
  const qualityDenom = passed + failed;
  const qualityPassRate = qualityDenom === 0 ? 0 : Number((passed / qualityDenom).toFixed(3));
  return { passed, failed, review, errors, total, qualityPassRate, passRate: qualityPassRate };
}

export function formatQualityPassRate(rate: number) {
  if (!Number.isFinite(rate)) return "0%";
  const ratio = rate > 1 ? Math.min(rate, 100) / 100 : Math.max(0, rate);
  const pct = Math.round(ratio * 1000) / 10;
  return `${Number.isInteger(pct) ? String(pct) : pct.toFixed(1)}%`;
}

export function applyRecount<T extends Pick<EvalBatch, "caseResults" | "total" | "caseIds">>(batch: T) {
  const counted = recountResults(batch.caseResults ?? []);
  return {
    ...batch,
    ...counted,
    total: batch.caseIds?.length ?? counted.total,
  };
}

export function isTerminalBatchStatus(status: string) {
  return status === "done" || status === "error" || status === "cancelled";
}

export function averageDuration(results: EvalCaseResult[]) {
  if (!results.length) return 0;
  return Math.round(results.reduce((sum, item) => sum + item.durationMs, 0) / results.length);
}

export function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((item, index) => item === b[index]);
}

export function asScoreStatus(value: string): EvalScoreStatus {
  if (value === "PASS" || value === "FAIL" || value === "REVIEW" || value === "ERROR") return value;
  return "ERROR";
}

function paramsEqual(left: EvalBatch["params"], right: EvalBatch["params"]) {
  return left.temperature === right.temperature && left.maxTokens === right.maxTokens;
}

export function compareEvalBatches(baselineRaw: EvalBatch, candidateRaw: EvalBatch): EvalBatchCompare {
  const baseline = applyRecount(baselineRaw);
  const candidate = applyRecount(candidateRaw);
  const reasons: string[] = [];
  const mismatched: EvalCompareReason[] = [];

  if (!sameStringSet(baseline.caseIds, candidate.caseIds)) {
    mismatched.push("caseIds");
    reasons.push("caseIds 不一致");
  }
  if (baseline.caseSetHash !== candidate.caseSetHash) {
    mismatched.push("caseSnapshot");
    reasons.push("用例快照不一致");
  }
  if (baseline.evaluatorVersion !== candidate.evaluatorVersion || baseline.evaluatorHash !== candidate.evaluatorHash) {
    mismatched.push("evaluator");
    reasons.push("评分器版本不一致");
  }
  const providerSame = baseline.provider === candidate.provider;
  const modelSame = baseline.model === candidate.model;
  const paramsSame = paramsEqual(baseline.params, candidate.params);
  const evaluatorSame =
    baseline.evaluatorVersion === candidate.evaluatorVersion && baseline.evaluatorHash === candidate.evaluatorHash;
  if (!providerSame || !modelSame || !paramsSame) {
    mismatched.push("runConditions");
    reasons.push("运行条件（provider / 模型 / 参数）不一致");
  }

  // skillHash 故意不进硬门禁：主场景就是「其它条件不变、只改 skill」后对比。
  const skillSame = baseline.skillHash === candidate.skillHash && baseline.skillVersion === candidate.skillVersion;
  const notes: string[] = [];
  if (!skillSame) {
    notes.push("技能配置不同（skillVersion / skillHash）：差异可能来自 skill 变更，属预期场景。");
  } else {
    notes.push("技能配置相同：分数差更可能来自非确定性或其它因素。");
  }

  const comparable = mismatched.length === 0;
  const byId = (batch: EvalBatch) => new Map(batch.caseResults.map((item) => [item.caseId, item]));
  const left = byId(baseline);
  const right = byId(candidate);
  const ids = comparable ? baseline.caseIds : [...new Set([...baseline.caseIds, ...candidate.caseIds])];

  const fixed: EvalBatchCompare["fixed"] = [];
  const newFailures: EvalBatchCompare["newFailures"] = [];
  const replyChangedSameStatus: EvalBatchCompare["replyChangedSameStatus"] = [];

  for (const caseId of ids) {
    const a = left.get(caseId);
    const b = right.get(caseId);
    if (!a || !b) continue;
    const from = a.status;
    const to = b.status;
    const baselineReply = a.finalReply ?? "";
    const candidateReply = b.finalReply ?? "";
    if (from !== "PASS" && to === "PASS") {
      fixed.push({ caseId, name: b.name, from, to, baselineReply, candidateReply });
    }
    if (to === "FAIL" && from !== "FAIL") {
      newFailures.push({ caseId, name: b.name, from, to, baselineReply, candidateReply });
    }
    if (from === to && baselineReply !== candidateReply) {
      replyChangedSameStatus.push({ caseId, name: b.name, status: to, baselineReply, candidateReply });
    }
  }

  return {
    comparable,
    reasons: comparable ? [] : [`不可直接比较：${reasons.join("；")}`, "不能据此给出“版本变好”的结论"],
    notes,
    mismatched,
    baseline: { id: baseline.id, versionLabel: baseline.versionLabel, status: baseline.status },
    candidate: { id: candidate.id, versionLabel: candidate.versionLabel, status: candidate.status },
    counts: {
      baseline: {
        passed: baseline.passed,
        failed: baseline.failed,
        review: baseline.review,
        errors: baseline.errors,
        total: baseline.total,
        qualityPassRate: baseline.qualityPassRate,
      },
      candidate: {
        passed: candidate.passed,
        failed: candidate.failed,
        review: candidate.review,
        errors: candidate.errors,
        total: candidate.total,
        qualityPassRate: candidate.qualityPassRate,
      },
    },
    fixed: comparable ? fixed : [],
    newFailures: comparable ? newFailures : [],
    replyChangedSameStatus: comparable ? replyChangedSameStatus : [],
    avgDurationMs: {
      baseline: averageDuration(baseline.caseResults),
      candidate: averageDuration(candidate.caseResults),
      delta: averageDuration(candidate.caseResults) - averageDuration(baseline.caseResults),
    },
    skills: {
      same: skillSame,
      baseline: { skillVersion: baseline.skillVersion || "", skillHash: baseline.skillHash || "" },
      candidate: { skillVersion: candidate.skillVersion || "", skillHash: candidate.skillHash || "" },
    },
    conditions: { providerSame, modelSame, paramsSame, evaluatorSame, skillSame },
  };
}
