import type { OpsMetrics } from "@/lib/ops/compute-metrics";

export type KpiAlert = "warn" | "danger";

export type KpiId =
  | "totalRuns"
  | "technicalSuccessRate"
  | "autoResolveRate"
  | "handoffRate"
  | "avgDurationMs";

export type KpiCardModel =
  | {
      id: KpiId;
      label: string;
      status: "ok";
      value: string;
      hint?: string;
      alert?: KpiAlert;
      alertReason?: string;
    }
  | {
      id: KpiId;
      label: string;
      status: "error";
      message: string;
    };

const LABELS: Record<KpiId, string> = {
  totalRuns: "运行总数",
  technicalSuccessRate: "技术成功率",
  autoResolveRate: "自动解决率",
  handoffRate: "人工接管率",
  avgDurationMs: "平均耗时",
};

function pct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

type Builder = (metrics: OpsMetrics, meta: { rangeLabel: string; trafficLabel: string }) => Omit<
  Extract<KpiCardModel, { status: "ok" }>,
  "id" | "label" | "status"
>;

const builders: Record<KpiId, Builder> = {
  totalRuns: (metrics, meta) => ({
    value: String(metrics.totalRuns),
    hint: `${meta.rangeLabel} · ${meta.trafficLabel}`,
  }),
  technicalSuccessRate: (metrics) => {
    if (metrics.finishedRuns === 0) {
      return { value: "—", hint: "本窗口暂无已结束 Run" };
    }
    const rate = metrics.technicalSuccessRate;
    const alert: KpiAlert | undefined = rate < 0.6 ? "danger" : rate < 0.8 ? "warn" : undefined;
    return {
      value: pct(rate),
      hint: `(成功+转交)/已结束 · 已结束 ${metrics.finishedRuns}`,
      alert,
      alertReason: alert ? "技术成功率偏低" : undefined,
    };
  },
  autoResolveRate: (metrics) => {
    if (metrics.finishedRuns === 0) {
      return { value: "—", hint: "本窗口暂无已结束 Run" };
    }
    const rate = metrics.autoResolveRate;
    const alert: KpiAlert | undefined = rate < 0.4 ? "danger" : rate < 0.55 ? "warn" : undefined;
    return {
      value: pct(rate),
      hint: `仅 succeeded · ${metrics.statusCounts.succeeded} 条`,
      alert,
      alertReason: alert ? "自动解决率偏低" : undefined,
    };
  },
  handoffRate: (metrics) => {
    if (metrics.finishedRuns === 0) {
      return { value: "—", hint: "本窗口暂无已结束 Run" };
    }
    const rate = metrics.handoffRate;
    const alert: KpiAlert | undefined = rate > 0.4 ? "danger" : rate > 0.25 ? "warn" : undefined;
    return {
      value: pct(rate),
      hint: `仅终态 handed_off · ${metrics.statusCounts.handed_off} 条`,
      alert,
      alertReason: alert ? "人工接管率偏高" : undefined,
    };
  },
  avgDurationMs: (metrics) => {
    if (metrics.totalRuns === 0) {
      return { value: "—", hint: "本窗口暂无 Run" };
    }
    const ms = metrics.avgDurationMs;
    const alert: KpiAlert | undefined = ms >= 60_000 ? "danger" : ms >= 20_000 ? "warn" : undefined;
    return {
      value: `${ms}ms`,
      hint: `P95 ${metrics.p95DurationMs}ms`,
      alert,
      alertReason: alert ? "平均耗时偏高" : undefined,
    };
  },
};

const KPI_ORDER: KpiId[] = [
  "totalRuns",
  "technicalSuccessRate",
  "autoResolveRate",
  "handoffRate",
  "avgDurationMs",
];

/**
 * 逐个构建 KPI；任一构建抛错则该卡为 error，不回落成 0。
 * runsError：运行数据源加载失败时，所有依赖 runs 的卡统一失败。
 */
export function buildKpiCards(input: {
  metrics: OpsMetrics | null;
  runsError?: string | null;
  rangeLabel: string;
  trafficLabel: string;
}): KpiCardModel[] {
  const { metrics, runsError, rangeLabel, trafficLabel } = input;

  return KPI_ORDER.map((id) => {
    const label = LABELS[id];
    if (runsError) {
      return { id, label, status: "error", message: runsError };
    }
    if (!metrics) {
      return { id, label, status: "error", message: "指标尚未就绪" };
    }
    try {
      const built = builders[id](metrics, { rangeLabel, trafficLabel });
      return { id, label, status: "ok", ...built };
    } catch (error) {
      return {
        id,
        label,
        status: "error",
        message: error instanceof Error ? error.message : "指标计算失败",
      };
    }
  });
}
