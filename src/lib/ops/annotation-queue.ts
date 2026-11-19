import { detectReplySafe, listUnsafeClaimTerms } from "../eval/score";
import { formatJudgeScore, JUDGE_LOW_CORRECTNESS_MAX, JUDGE_OVERRIDE_MIN, toJudgeFive } from "../eval/judge-scale";
import type {
  Annotation,
  AnnotationScores,
  AnnotationStatus,
  EvalBatch,
  EvalScoreStatus,
  LlmJudgeDimensions,
  Rating,
  RunRecord,
} from "@/lib/types";

export type EvalHint = {
  status: EvalScoreStatus;
  judgeOverall?: number;
  judgeSafety?: number;
  judgeCorrectness?: number;
  judgeDimensions?: Partial<LlmJudgeDimensions>;
  judgeOverride?: boolean;
  replySafe?: boolean;
  safetyHardFail?: boolean;
  qualityFail?: boolean;
  keywordHits?: string[];
  keywordMisses?: string[];
  forbiddenHits?: string[];
  priceMiss?: boolean;
  riskIssues?: string[];
  evidenceLines?: string[];
};

export type BadCasePriority = "P0" | "P1" | "P2";

export type BadCaseSeverity =
  | "safety_hard"
  | "dangerous_claim"
  | "low_correctness"
  | "low_rating"
  | "quality_no_override"
  | "review"
  | "empty_reply";

export const BAD_CASE_SEVERITY_LABEL: Record<BadCaseSeverity, string> = {
  safety_hard: "安全硬失败",
  dangerous_claim: "危险承诺",
  low_correctness: "低正确性",
  low_rating: "低分评分",
  quality_no_override: "质量未复议",
  review: "REVIEW",
  empty_reply: "空回复",
};

const SEVERITY_RANK: Record<BadCaseSeverity, number> = {
  safety_hard: 0,
  dangerous_claim: 1,
  low_correctness: 2,
  low_rating: 3,
  quality_no_override: 4,
  review: 5,
  empty_reply: 6,
};

export type AnnotationQueueItem = {
  runId: string;
  question: string;
  reply: string;
  createdAt: string;
  runStatus: RunRecord["status"];
  riskLevel: "low" | "medium" | "high" | "none";
  riskVerdict: "allow" | "block" | "none";
  qualityLabel: string;
  replyQualityLabel: string;
  priority: BadCasePriority;
  severity: BadCaseSeverity;
  primaryReason: string;
  evidence: string;
  reasons: string[];
  ratingScore?: number;
  evalStatus?: EvalScoreStatus;
  judgeOverall?: number;
  judgeDimensions?: Partial<LlmJudgeDimensions>;
  keywordHits: string[];
  keywordMisses: string[];
  forbiddenHits: string[];
  priceMiss: boolean;
  riskIssues: string[];
  evidenceLines: string[];
  selectedSkills: string[];
  selectedTools: string[];
  skillPins: string[];
  riskRules: string[];
  provider: string;
  model: string;
  stepPath: string[];
};

function evidenceFlag(evidence: string[] | undefined, label: string) {
  return evidence?.some((item) => item.includes(`${label}=是`)) ?? false;
}

function judgeNumber(dimensions: Record<string, unknown> | undefined, key: string, fallbackKey?: string) {
  if (!dimensions) return undefined;
  const raw = dimensions[key] ?? (fallbackKey ? dimensions[fallbackKey] : undefined);
  const number = Number(raw);
  return Number.isFinite(number) ? number : undefined;
}

export function collectEvalHints(batches: EvalBatch[]): Record<string, EvalHint> {
  const hints: Record<string, EvalHint> = {};
  const ordered = [...batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const batch of ordered) {
    for (const result of batch.caseResults ?? []) {
      if (!result.runId || hints[result.runId]) continue;
      const dimensions = result.judge?.dimensions as Record<string, unknown> | undefined;
      const replySafe = result.replySafe;
      const safetyHardFail = evidenceFlag(result.evidence, "安全硬失败") || replySafe === false;
      const qualityFail =
        evidenceFlag(result.evidence, "质量失败") || (result.status === "FAIL" && replySafe !== false && !safetyHardFail);
      const judgeDimensions: Partial<LlmJudgeDimensions> | undefined =
        result.judge?.status === "ok" && dimensions
          ? {
              correctness: judgeNumber(dimensions, "correctness", "faithfulness"),
              relevance: judgeNumber(dimensions, "relevance"),
              completeness: judgeNumber(dimensions, "completeness"),
              safety: judgeNumber(dimensions, "safety"),
              tone: judgeNumber(dimensions, "tone"),
              overall: judgeNumber(dimensions, "overall") ?? result.judge.overall,
            }
          : undefined;
      hints[result.runId] = {
        status: result.status,
        judgeOverall: result.judge?.status === "ok" ? result.judge.overall : undefined,
        judgeSafety: judgeNumber(dimensions, "safety"),
        judgeCorrectness: judgeNumber(dimensions, "correctness", "faithfulness"),
        judgeDimensions,
        judgeOverride: result.judge?.overrideQualityFail === true && result.judge.verdict === "PASS",
        replySafe,
        safetyHardFail,
        qualityFail,
        keywordHits: result.keywordHits,
        keywordMisses: result.keywordMisses,
        forbiddenHits: result.forbiddenHits,
        priceMiss: result.evidence?.some((item) => item.includes("期望价格") || item.includes("价格核验")) ?? false,
        riskIssues: result.riskIssues,
        evidenceLines: result.evidence ?? [],
      };
    }
  }
  return hints;
}

export function latestRatingByRun(ratings: Rating[]): Record<string, Rating> {
  const map: Record<string, Rating> = {};
  const ordered = [...ratings].sort((a, b) => {
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

export function latestAnnotationByRun(annotations: Annotation[]): Record<string, Annotation> {
  const map: Record<string, Annotation> = {};
  const ordered = [...annotations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const item of ordered) {
    if (!map[item.runId]) map[item.runId] = item;
  }
  return map;
}

function qualityLabel(run: RunRecord, evalHint?: EvalHint, rating?: Rating) {
  if (evalHint?.safetyHardFail) return "安全硬失败";
  if (evalHint?.qualityFail) return "质量失败";
  if (evalHint?.status === "REVIEW") return "测评待复核";
  if (typeof rating?.score === "number" && rating.score <= 2) return `评分 ${rating.score} 分`;
  if (evalHint?.status === "PASS") return "测评通过";
  if (run.status === "succeeded") return "运行成功";
  if (run.status === "failed") return "运行失败（不入库）";
  if (run.status === "handed_off") return "已转人工（不入库）";
  return "未评估";
}

function replyQualityLabel(evalHint?: EvalHint, rating?: Rating) {
  if (typeof evalHint?.judgeOverall === "number") return `Judge ${formatJudgeScore(evalHint.judgeOverall)}`;
  if (typeof rating?.score === "number") return `评分 ${rating.score}/5`;
  if (evalHint?.replySafe === false) return "回复不安全";
  if (evalHint?.status) return `测评 ${evalHint.status}`;
  return "未评估";
}

function judgeCanOverride(hint?: EvalHint) {
  if (!hint?.judgeOverride) return false;
  return toJudgeFive(hint.judgeSafety) >= JUDGE_OVERRIDE_MIN && toJudgeFive(hint.judgeCorrectness) >= JUDGE_OVERRIDE_MIN;
}

function priorityOf(severity: BadCaseSeverity): BadCasePriority {
  if (severity === "safety_hard" || severity === "dangerous_claim") return "P0";
  if (severity === "review" || severity === "empty_reply") return "P2";
  return "P1";
}

type Signal = { severity: BadCaseSeverity; primaryReason: string; evidence: string };

export function classifyBadCase(
  run: RunRecord,
  evalHint?: EvalHint,
  rating?: Rating,
): { priority: BadCasePriority; severity: BadCaseSeverity; primaryReason: string; evidence: string; reasons: string[] } | null {
  const reply = run.finalReply ?? "";
  const unsafeTerms = listUnsafeClaimTerms(reply);
  const replyUnsafe = Boolean(reply.trim()) && !detectReplySafe(reply);
  const signals: Signal[] = [];

  if (evalHint?.safetyHardFail) {
    const proof = unsafeTerms.length
      ? `命中${unsafeTerms.join("、")}`
      : evalHint.riskIssues?.length
        ? evalHint.riskIssues.join("、")
        : "规则判定回复不可发送";
    signals.push({
      severity: "safety_hard",
      primaryReason: `安全硬失败：${proof}`,
      evidence: proof,
    });
  } else if (unsafeTerms.length || replyUnsafe) {
    const proof = unsafeTerms.length ? `命中${unsafeTerms.join("、")}` : "回复含诱导转账或验证码";
    signals.push({
      severity: "dangerous_claim",
      primaryReason: `危险承诺：${proof}`,
      evidence: proof,
    });
  }

  const correctness = evalHint?.judgeCorrectness;
  if (typeof correctness === "number" && toJudgeFive(correctness) < JUDGE_LOW_CORRECTNESS_MAX) {
    const bits = [`Judge 正确性 ${toJudgeFive(correctness)}`];
    if (evalHint?.priceMiss) bits.push("回复含未核验/未出现的价格");
    signals.push({
      severity: "low_correctness",
      primaryReason: `低正确性：${bits.join("、")}`,
      evidence: bits.join("、"),
    });
  }

  if (typeof rating?.score === "number" && rating.score <= 2) {
    const proof = rating.comment?.trim() ? `${rating.score}/5，${rating.comment.trim()}` : `${rating.score}/5`;
    signals.push({
      severity: "low_rating",
      primaryReason: `低分评分：${proof}`,
      evidence: proof,
    });
  }

  if (evalHint?.qualityFail && !judgeCanOverride(evalHint)) {
    const bits: string[] = [];
    if (evalHint.keywordMisses?.length) bits.push(`缺关键词 ${evalHint.keywordMisses.slice(0, 4).join("、")}`);
    if (evalHint.forbiddenHits?.length) bits.push(`禁词 ${evalHint.forbiddenHits.slice(0, 3).join("、")}`);
    if (evalHint.priceMiss) bits.push("价格未核验");
    if (evalHint.judgeOverall !== undefined) bits.push(`Judge ${formatJudgeScore(evalHint.judgeOverall)} 未翻盘`);
    const proof = bits.join("、") || "规则质量失败且 Judge 未复议";
    signals.push({
      severity: "quality_no_override",
      primaryReason: `质量未复议：${proof}`,
      evidence: proof,
    });
  }

  if (evalHint?.status === "REVIEW") {
    signals.push({
      severity: "review",
      primaryReason: "REVIEW：测评待人工裁定，尚未定罪",
      evidence: "测评状态 REVIEW",
    });
  }

  if (run.status === "succeeded" && !reply.trim()) {
    signals.push({
      severity: "empty_reply",
      primaryReason: "空回复：运行成功但没有可发送内容",
      evidence: "finalReply 为空",
    });
  }

  if (!signals.length) return null;
  signals.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const top = signals[0]!;
  return {
    priority: priorityOf(top.severity),
    severity: top.severity,
    primaryReason: top.primaryReason,
    evidence: top.evidence,
    reasons: signals.map((item) => item.primaryReason),
  };
}

function stepPathOf(run: RunRecord) {
  return run.steps
    .filter((step) => step.status === "succeeded" || step.status === "failed")
    .map((step) => `${step.type}:${step.name}${step.status === "failed" ? "(失败)" : ""}`);
}

function baseItem(
  run: RunRecord,
  evalHint: EvalHint | undefined,
  rating: Rating | undefined,
  classified: {
    priority: BadCasePriority;
    severity: BadCaseSeverity;
    primaryReason: string;
    evidence: string;
    reasons: string[];
  },
): AnnotationQueueItem {
  return {
    runId: run.id,
    question: run.question,
    reply: run.finalReply,
    createdAt: run.createdAt,
    runStatus: run.status,
    riskLevel: run.plan?.risk.level ?? "none",
    riskVerdict: run.riskResult?.verdict ?? "none",
    qualityLabel: qualityLabel(run, evalHint, rating),
    replyQualityLabel: replyQualityLabel(evalHint, rating),
    priority: classified.priority,
    severity: classified.severity,
    primaryReason: classified.primaryReason,
    evidence: classified.evidence,
    reasons: classified.reasons,
    ratingScore: rating?.score,
    evalStatus: evalHint?.status,
    judgeOverall: evalHint?.judgeOverall,
    judgeDimensions: evalHint?.judgeDimensions,
    keywordHits: evalHint?.keywordHits ?? [],
    keywordMisses: evalHint?.keywordMisses ?? [],
    forbiddenHits: evalHint?.forbiddenHits ?? [],
    priceMiss: evalHint?.priceMiss === true,
    riskIssues: evalHint?.riskIssues ?? [],
    evidenceLines: evalHint?.evidenceLines ?? [],
    selectedSkills: run.plan?.selectedSkills ?? [],
    selectedTools: run.plan?.selectedTools ?? [],
    skillPins: (run.skillVersions ?? []).map((item) => `${item.skillId}@${item.version}`),
    riskRules: run.riskResult?.triggeredRules ?? [],
    provider: run.provider || "",
    model: run.model || "",
    stepPath: stepPathOf(run),
  };
}

export function runToQueueItem(
  run: RunRecord,
  evalHint?: EvalHint,
  rating?: Rating,
  extraReasons: string[] = [],
): AnnotationQueueItem {
  const classified = classifyBadCase(run, evalHint, rating);
  if (!classified) {
    return baseItem(run, evalHint, rating, {
      priority: "P2",
      severity: "review",
      primaryReason: extraReasons[0] || "",
      evidence: extraReasons[0] || "",
      reasons: extraReasons,
    });
  }
  return baseItem(run, evalHint, rating, {
    ...classified,
    reasons: [...new Set([...classified.reasons, ...extraReasons])],
  });
}

export function buildAnnotationQueue(input: {
  runs: RunRecord[];
  ratings: Rating[];
  evalHints: Record<string, EvalHint>;
}): AnnotationQueueItem[] {
  const ratings = latestRatingByRun(input.ratings);
  const items: AnnotationQueueItem[] = [];
  for (const run of input.runs) {
    if (!classifyBadCase(run, input.evalHints[run.id], ratings[run.id])) continue;
    items.push(runToQueueItem(run, input.evalHints[run.id], ratings[run.id]));
  }
  return items.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** 未标注：队列里还没有任何标注记录。 */
export function isRunUnmarked(annotation?: Annotation) {
  return !annotation;
}

/** 待二审：已保存标注，但状态仍是 pending。 */
export function isNeedsReview(annotation?: Annotation) {
  if (!annotation) return false;
  const status = (annotation.status ?? "pending") as AnnotationStatus;
  return status === "pending";
}

/** @deprecated 语义易混；请用 isRunUnmarked / isNeedsReview。保留兼容：未标注或待二审都算「待处理」。 */
export function isRunPending(annotation?: Annotation) {
  return isRunUnmarked(annotation) || isNeedsReview(annotation);
}

export function annotationScoresFromJudge(dimensions?: Partial<LlmJudgeDimensions>): AnnotationScores | undefined {
  if (!dimensions) return undefined;
  const scores: AnnotationScores = {};
  for (const key of ["correctness", "relevance", "completeness", "safety", "tone", "overall"] as const) {
    const value = dimensions[key];
    if (typeof value === "number" && Number.isFinite(value)) scores[key] = value;
  }
  return Object.keys(scores).length ? scores : undefined;
}

export function annotationStats(queue: AnnotationQueueItem[], annotations: Annotation[]) {
  const latest = latestAnnotationByRun(annotations);
  let pending = 0;
  let marked = 0;
  let accepted = 0;
  let rejected = 0;
  let pendingReview = 0;
  const byPriority = { P0: 0, P1: 0, P2: 0 };
  for (const item of queue) {
    byPriority[item.priority] += 1;
    const annotation = latest[item.runId];
    if (!annotation) {
      pending += 1;
      continue;
    }
    marked += 1;
    const status = (annotation.status ?? "pending") as AnnotationStatus;
    if (status === "accepted") accepted += 1;
    else if (status === "rejected") rejected += 1;
    else pendingReview += 1;
  }
  const decided = accepted + rejected;
  const passRate = decided ? Math.round((accepted / decided) * 100) : 0;
  return {
    queueTotal: queue.length,
    pending,
    unmarked: pending,
    marked,
    accepted,
    rejected,
    pendingReview,
    decided,
    passRate,
    byPriority,
  };
}

