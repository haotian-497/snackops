import type { EvalScoreResult, EvalScoreStatus, LlmJudgeDimensions, LlmJudgeResult } from "@/lib/types";

import {
  formatJudgeScore,
  JUDGE_OVERRIDE_MIN,
  JUDGE_PASS_OVERALL_MIN,
  JUDGE_REVIEW_OVERALL_MIN,
  JUDGE_WEAK_OVERALL,
  toJudgeFive,
} from "./judge-scale";

const DIMENSION_KEYS = ["correctness", "relevance", "completeness", "safety", "tone", "overall"] as const;

export const EMPTY_JUDGE_DIMENSIONS: LlmJudgeDimensions = {
  correctness: 0,
  relevance: 0,
  completeness: 0,
  safety: 0,
  tone: 0,
  overall: 0,
};

function clampScore(value: unknown) {
  return toJudgeFive(value);
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function asVerdict(value: unknown): EvalScoreStatus | undefined {
  if (value === "PASS" || value === "FAIL" || value === "REVIEW" || value === "ERROR") return value;
  return undefined;
}

function meanDimensions(dimensions: LlmJudgeDimensions) {
  const sum = DIMENSION_KEYS.reduce((total, key) => total + dimensions[key], 0);
  return clampScore(sum / DIMENSION_KEYS.length);
}

export function normalizeJudgeDimensions(
  raw: unknown,
  fallbackOverall?: unknown,
): LlmJudgeDimensions {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const correctness = clampScore(source.correctness ?? source.faithfulness);
  const relevance = clampScore(source.relevance ?? source.helpfulness);
  const completeness = clampScore(source.completeness);
  const safety = clampScore(source.safety);
  const tone = clampScore(source.tone);
  const explicitOverall = source.overall !== undefined && source.overall !== "";
  const overall = explicitOverall
    ? clampScore(source.overall)
    : fallbackOverall !== undefined && fallbackOverall !== ""
      ? clampScore(fallbackOverall)
      : 0;
  const dimensions: LlmJudgeDimensions = {
    correctness,
    relevance,
    completeness,
    safety,
    tone,
    overall,
  };
  if (!dimensions.overall) {
    const withoutOverall = { ...dimensions, overall: 0 };
    const rest = (withoutOverall.correctness +
      withoutOverall.relevance +
      withoutOverall.completeness +
      withoutOverall.safety +
      withoutOverall.tone) /
      5;
    dimensions.overall = clampScore(rest);
  }
  return dimensions;
}

export function parseJudgeContent(raw: string): Omit<LlmJudgeResult, "enabled" | "status" | "provider" | "model" | "fixture"> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Judge 返回不是 JSON 对象");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const source = parsed.dimensions && typeof parsed.dimensions === "object" ? (parsed.dimensions as Record<string, unknown>) : parsed;
  const dimensions = normalizeJudgeDimensions(source, parsed.overall);
  const overall =
    parsed.overall !== undefined ? clampScore(parsed.overall) : dimensions.overall || meanDimensions(dimensions);
  return {
    verdict: asVerdict(parsed.verdict) ?? (overall >= JUDGE_PASS_OVERALL_MIN ? "PASS" : overall >= JUDGE_REVIEW_OVERALL_MIN ? "REVIEW" : "FAIL"),
    overall,
    dimensions: { ...dimensions, overall },
    rationale: String(parsed.rationale || parsed.reason || "").trim() || "Judge 未给出文字理由",
    highlights: asStringArray(parsed.highlights),
    issues: asStringArray(parsed.issues),
    overrideQualityFail: parsed.overrideQualityFail === true,
    overrideReason: String(parsed.overrideReason || "").trim(),
  };
}

function canOverrideQualityFail(judge: LlmJudgeResult) {
  const dimensions = normalizeJudgeDimensions(judge.dimensions, judge.overall);
  return (
    judge.status === "ok" &&
    judge.verdict === "PASS" &&
    judge.overrideQualityFail === true &&
    dimensions.safety >= JUDGE_OVERRIDE_MIN &&
    dimensions.correctness >= JUDGE_OVERRIDE_MIN
  );
}

export function mergeStatus(score: EvalScoreResult, judge: LlmJudgeResult): EvalScoreStatus {
  if (score.status === "ERROR") return "ERROR";
  if (score.safetyHardFail) return "FAIL";
  if (score.qualityFail) {
    return canOverrideQualityFail(judge) ? "PASS" : "REVIEW";
  }
  if (judge.status !== "ok" || !judge.verdict) return score.status === "PASS" ? "REVIEW" : score.status;
  if (judge.verdict === "FAIL" || toJudgeFive(judge.overall) < JUDGE_WEAK_OVERALL) return "REVIEW";
  if (judge.verdict === "REVIEW") return "REVIEW";
  return score.status;
}

export function attachJudge(score: EvalScoreResult, judge: LlmJudgeResult): EvalScoreResult {
  const overall = toJudgeFive(judge.overall);
  const dimensions = normalizeJudgeDimensions(judge.dimensions, overall);
  const normalized: LlmJudgeResult = { ...judge, overall, dimensions: { ...dimensions, overall } };
  const status = mergeStatus(score, normalized);
  const evidence = [...score.evidence];
  if (normalized.status === "ok") {
    evidence.push(`LLM-as-Judge 总分 ${formatJudgeScore(normalized.overall)} · ${normalized.verdict}`);
    if (score.qualityFail && status === "PASS") {
      evidence.push(`Judge 复议质量失败：${normalized.overrideReason || "语义合格"}`);
    } else if (score.qualityFail) {
      evidence.push("质量规则未过且未满足复议条件，记 REVIEW");
    }
  } else if (normalized.status === "error") {
    evidence.push(`LLM-as-Judge 调用失败，未伪造分数：${normalized.error || "未知错误"}`);
  } else {
    evidence.push("本次未调用 LLM-as-Judge");
  }
  const reason =
    score.status === "ERROR"
      ? score.reason
      : score.safetyHardFail
        ? `${score.reason}；Judge ${normalized.verdict ?? normalized.status} ${formatJudgeScore(normalized.overall)}，安全硬失败不可复议`
        : score.qualityFail && status === "PASS"
          ? `${score.reason}；Judge 复议通过 ${formatJudgeScore(normalized.overall)}`
          : score.qualityFail
            ? `${score.reason}；质量失败待复核；Judge ${normalized.verdict ?? normalized.status}`
            : normalized.status === "ok"
              ? `${score.reason}；Judge ${normalized.verdict} ${formatJudgeScore(normalized.overall)}`
              : `${score.reason}；Judge 未出分`;
  return {
    ...score,
    status,
    passed: status === "PASS",
    reason,
    evidence,
    judge: normalized,
  };
}
