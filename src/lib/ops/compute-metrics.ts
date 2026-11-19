import type { RunRecord } from "@/lib/types";

export type OpsTimeRange = "today" | "7d" | "all";

/** 业务：工作台 + Demo + 重试；测评：批测/单测；全部：含 legacy 等 */
export type OpsTrafficScope = "business" | "eval" | "all";

export type OpsMetrics = {
  totalRuns: number;
  /** 已结束 Run = total − running，用作比率分母 */
  finishedRuns: number;
  /** (succeeded + handed_off) / finished */
  technicalSuccessRate: number;
  /** succeeded / finished */
  autoResolveRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  failedSteps: Array<{ type: string; name: string; count: number }>;
  riskLevels: { allow: number; block: number; none: number };
  riskRules: Array<{ rule: string; count: number }>;
  /** handed_off / finished，只认终态 */
  handoffRate: number;
  statusCounts: {
    succeeded: number;
    failed: number;
    handed_off: number;
    running: number;
  };
  recentRuns: RunRecord[];
  recentFailed: RunRecord[];
  recentHandoffs: RunRecord[];
  slowestRuns: Array<Pick<RunRecord, "id" | "question" | "durationMs" | "status">>;
};

const BUSINESS_SOURCES = new Set(["workbench", "demo", "retry"]);

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function filterRunsByTimeRange(runs: RunRecord[], range: OpsTimeRange, now = new Date()): RunRecord[] {
  if (range === "all") return runs;
  const nowMs = now.getTime();
  const cutoff = range === "today" ? startOfLocalDay(now) : nowMs - 7 * 24 * 60 * 60 * 1000;
  return runs.filter((run) => {
    const ts = Date.parse(run.createdAt || "");
    if (Number.isNaN(ts)) return false;
    return ts >= cutoff;
  });
}

export function filterRunsByTrafficScope(runs: RunRecord[], scope: OpsTrafficScope): RunRecord[] {
  if (scope === "all") return runs;
  if (scope === "eval") return runs.filter((run) => run.source === "eval");
  return runs.filter((run) => BUSINESS_SOURCES.has(run.source));
}

/** 问题指纹：去空白、标点差异，用于演示重复题去重 */
export function normalizeQuestionKey(question: string): string {
  return question
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[，。！？、；：""''（）【】\[\]().,!?;:'"`~…—\-_/\\]/g, "");
}

/**
 * 按问题去重，保留每种问题最近一条（输入需已按 createdAt 降序）。
 * 用于监控比率，避免同一演示题刷高接管率等。
 */
export function dedupeRunsByQuestion(runs: RunRecord[]): RunRecord[] {
  const seen = new Set<string>();
  const result: RunRecord[] = [];
  for (const run of runs) {
    const key = normalizeQuestionKey(run.question || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(run);
  }
  return result;
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function rate(numerator: number, denominator: number) {
  return denominator ? Number((numerator / denominator).toFixed(3)) : 0;
}

export function computeMetrics(runs: RunRecord[]): OpsMetrics {
  const totalRuns = runs.length;
  const succeeded = runs.filter((item) => item.status === "succeeded").length;
  const failed = runs.filter((item) => item.status === "failed");
  const handedOff = runs.filter((item) => item.status === "handed_off");
  const running = runs.filter((item) => item.status === "running");
  const finishedRuns = totalRuns - running.length;

  const durations = runs.map((item) => item.durationMs || 0).sort((a, b) => a - b);
  const avgDurationMs = totalRuns ? Math.round(runs.reduce((sum, item) => sum + item.durationMs, 0) / totalRuns) : 0;

  const failedMap = new Map<string, { type: string; name: string; count: number }>();
  const ruleMap = new Map<string, number>();
  for (const run of runs) {
    for (const step of run.steps) {
      if (step.status !== "failed") continue;
      const key = `${step.type}:${step.name}`;
      const current = failedMap.get(key) ?? { type: step.type, name: step.name, count: 0 };
      current.count += 1;
      failedMap.set(key, current);
    }
    for (const rule of run.riskResult?.triggeredRules ?? []) {
      ruleMap.set(rule, (ruleMap.get(rule) ?? 0) + 1);
    }
  }

  return {
    totalRuns,
    finishedRuns,
    technicalSuccessRate: rate(succeeded + handedOff.length, finishedRuns),
    autoResolveRate: rate(succeeded, finishedRuns),
    avgDurationMs,
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    failedSteps: [...failedMap.values()].sort((a, b) => b.count - a.count),
    riskLevels: {
      allow: runs.filter((item) => item.riskResult?.verdict === "allow").length,
      block: runs.filter((item) => item.riskResult?.verdict === "block").length,
      none: runs.filter((item) => !item.riskResult).length,
    },
    riskRules: [...ruleMap.entries()]
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    handoffRate: rate(handedOff.length, finishedRuns),
    statusCounts: {
      succeeded,
      failed: failed.length,
      handed_off: handedOff.length,
      running: running.length,
    },
    recentRuns: runs.slice(0, 12),
    recentFailed: failed.slice(0, 8),
    recentHandoffs: handedOff.slice(0, 8),
    slowestRuns: [...runs]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        question: item.question,
        durationMs: item.durationMs,
        status: item.status,
      })),
  };
}

export const emptyOpsMetrics: OpsMetrics = {
  totalRuns: 0,
  finishedRuns: 0,
  technicalSuccessRate: 0,
  autoResolveRate: 0,
  avgDurationMs: 0,
  p50DurationMs: 0,
  p95DurationMs: 0,
  failedSteps: [],
  riskLevels: { allow: 0, block: 0, none: 0 },
  riskRules: [],
  handoffRate: 0,
  statusCounts: { succeeded: 0, failed: 0, handed_off: 0, running: 0 },
  recentRuns: [],
  recentFailed: [],
  recentHandoffs: [],
  slowestRuns: [],
};
