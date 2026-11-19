import "server-only";

import { listRunRecords } from "@/lib/agent/runs";
import { listEvalBatches } from "@/lib/eval/batch";
import { listEvalCases } from "@/lib/eval/cases";
import { computeMetrics, emptyOpsMetrics } from "@/lib/ops/compute-metrics";
import { listAnnotations } from "@/lib/ops/annotations";
import { listImprovements } from "@/lib/ops/improvements";
import { listRatings } from "@/lib/ops/ratings";
import { readJson } from "@/lib/store";
import type { AbTest } from "@/lib/types";
import type { Annotation, EvalBatch, EvalCase, Improvement, Rating, RunRecord } from "@/lib/types";

export type { OpsMetrics, OpsTimeRange, OpsTrafficScope } from "@/lib/ops/compute-metrics";
export {
  computeMetrics,
  filterRunsByTimeRange,
  filterRunsByTrafficScope,
  dedupeRunsByQuestion,
  normalizeQuestionKey,
  emptyOpsMetrics,
} from "@/lib/ops/compute-metrics";

export type OpsLoadErrors = {
  runs?: string;
  ratings?: string;
  annotations?: string;
  improvements?: string;
  evalCases?: string;
  evalBatches?: string;
  abTests?: string;
};

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): { value: T; error?: string } {
  if (result.status === "fulfilled") return { value: result.value };
  const message = result.reason instanceof Error ? result.reason.message : "加载失败";
  return { value: fallback, error: message };
}

export async function loadOpsSnapshot() {
  const results = await Promise.allSettled([
    listRunRecords(),
    listRatings(),
    listAnnotations(),
    listImprovements(),
    listEvalCases(),
    listEvalBatches(),
    readJson<AbTest[]>("ab-tests.json"),
  ]);

  const runs = settledValue(results[0] as PromiseSettledResult<RunRecord[]>, []);
  const ratings = settledValue(results[1] as PromiseSettledResult<Rating[]>, []);
  const annotations = settledValue(results[2] as PromiseSettledResult<Annotation[]>, []);
  const improvements = settledValue(results[3] as PromiseSettledResult<Improvement[]>, []);
  const evalCases = settledValue(results[4] as PromiseSettledResult<EvalCase[]>, []);
  const evalBatches = settledValue(results[5] as PromiseSettledResult<EvalBatch[]>, []);
  const abTests = settledValue(results[6] as PromiseSettledResult<AbTest[]>, []);

  const loadErrors: OpsLoadErrors = {};
  if (runs.error) loadErrors.runs = runs.error;
  if (ratings.error) loadErrors.ratings = ratings.error;
  if (annotations.error) loadErrors.annotations = annotations.error;
  if (improvements.error) loadErrors.improvements = improvements.error;
  if (evalCases.error) loadErrors.evalCases = evalCases.error;
  if (evalBatches.error) loadErrors.evalBatches = evalBatches.error;
  if (abTests.error) loadErrors.abTests = abTests.error;

  let metrics = emptyOpsMetrics;
  let metricsError: string | undefined;
  if (!runs.error) {
    try {
      metrics = computeMetrics(runs.value);
    } catch (error) {
      metricsError = error instanceof Error ? error.message : "指标计算失败";
      loadErrors.runs = metricsError;
    }
  }

  return {
    metrics,
    runs: runs.value,
    ratings: ratings.value,
    annotations: annotations.value,
    improvements: improvements.value,
    evalCases: evalCases.value,
    evalBatches: evalBatches.value,
    abTests: abTests.value,
    clusterNote: "规则聚类" as const,
    loadErrors,
  };
}

export type OpsSnapshot = Awaited<ReturnType<typeof loadOpsSnapshot>>;

export const emptyOpsSnapshot: OpsSnapshot = {
  metrics: emptyOpsMetrics,
  runs: [],
  ratings: [],
  annotations: [],
  improvements: [],
  evalCases: [],
  evalBatches: [],
  abTests: [],
  clusterNote: "规则聚类",
  loadErrors: {},
};
