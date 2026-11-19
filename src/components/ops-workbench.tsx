"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { EmptyState } from "@/components/empty-state";
import { RunStatusChart } from "@/components/run-status-chart";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runStatusLabel } from "@/lib/labels";
import {
  computeMetrics,
  dedupeRunsByQuestion,
  filterRunsByTimeRange,
  filterRunsByTrafficScope,
  type OpsTimeRange,
  type OpsTrafficScope,
} from "@/lib/ops/compute-metrics";
import {
  DEFAULT_OPS_FILTERS,
  parseOpsFilters,
  serializeOpsFilters,
  type OpsMonitorFilters,
} from "@/lib/ops/filters";
import { buildKpiCards, type KpiAlert, type KpiCardModel, type KpiId } from "@/lib/ops/kpi";
import type { OpsSnapshot } from "@/lib/ops/metrics";
import type { RunRecord } from "@/lib/types";

const RANGE_OPTIONS: Array<{ id: OpsTimeRange; label: string }> = [
  { id: "today", label: "今日" },
  { id: "7d", label: "近 7 天" },
  { id: "all", label: "全部" },
];

const TRAFFIC_OPTIONS: Array<{ id: OpsTrafficScope; label: string; hint: string }> = [
  { id: "business", label: "业务", hint: "工作台 · Demo · 重试" },
  { id: "eval", label: "测评", hint: "批测 / 单测" },
  { id: "all", label: "全部", hint: "含 legacy 等" },
];

function filtersEqual(a: OpsMonitorFilters, b: OpsMonitorFilters) {
  return a.range === b.range && a.traffic === b.traffic && a.dedupe === b.dedupe;
}

export function OpsWorkbench({
  initial,
  initialFilters = DEFAULT_OPS_FILTERS,
}: {
  initial: OpsSnapshot;
  initialFilters?: OpsMonitorFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<OpsMonitorFilters>(initialFilters);
  const [snapshot, setSnapshot] = useState<OpsSnapshot>(initial);
  const [retryingIds, setRetryingIds] = useState<Partial<Record<KpiId, boolean>>>({});
  const [cardOverrides, setCardOverrides] = useState<Partial<Record<KpiId, KpiCardModel>>>({});

  // URL → state（前进/后退）；禁止在 render / setState updater 里改路由
  useEffect(() => {
    const fromUrl = parseOpsFilters(searchParams);
    setFilters((prev) => (filtersEqual(prev, fromUrl) ? prev : fromUrl));
  }, [searchParams]);

  // state → URL（与地址栏不一致时再 replace，避免渲染期副作用）
  useEffect(() => {
    const fromUrl = parseOpsFilters(searchParams);
    if (filtersEqual(filters, fromUrl)) return;
    const query = serializeOpsFilters(filters);
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      router.replace(href as "/ops", { scroll: false });
    });
  }, [filters, pathname, router, searchParams, startTransition]);

  const updateFilters = useCallback((patch: Partial<OpsMonitorFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setCardOverrides({});
  }, []);

  const { ratings, annotations, improvements, evalCases, evalBatches, runs, loadErrors } = snapshot;
  const { range, traffic, dedupe: dedupeQuestions } = filters;

  const scopedRuns = useMemo(
    () => filterRunsByTrafficScope(filterRunsByTimeRange(runs, range), traffic),
    [range, traffic, runs],
  );

  const metricsRuns = useMemo(
    () => (dedupeQuestions ? dedupeRunsByQuestion(scopedRuns) : scopedRuns),
    [dedupeQuestions, scopedRuns],
  );

  const metricsResult = useMemo(() => {
    if (loadErrors?.runs) return { metrics: null as ReturnType<typeof computeMetrics> | null, error: loadErrors.runs };
    try {
      return { metrics: computeMetrics(metricsRuns), error: null as string | null };
    } catch (error) {
      return {
        metrics: null,
        error: error instanceof Error ? error.message : "指标计算失败",
      };
    }
  }, [metricsRuns, loadErrors?.runs]);

  const rangeLabel = range === "today" ? "今日" : range === "7d" ? "近 7 天" : "全部";
  const trafficMeta = TRAFFIC_OPTIONS.find((item) => item.id === traffic)!;

  const kpiCards = useMemo(() => {
    const built = buildKpiCards({
      metrics: metricsResult.metrics,
      runsError: metricsResult.error,
      rangeLabel,
      trafficLabel: trafficMeta.label,
    });
    return built.map((card) => cardOverrides[card.id] ?? card);
  }, [metricsResult, rangeLabel, trafficMeta.label, cardOverrides]);

  const lowScores = ratings.filter((item) => item.score <= 2).length;
  const openImprovements = improvements.filter((item) => item.status === "open").length;
  const pendingAnnotations = annotations.filter((item) => (item.status ?? "pending") === "pending").length;
  const avgScore =
    ratings.length === 0
      ? null
      : Math.round((ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length) * 10) / 10;

  const metrics = metricsResult.metrics;
  const alerts = [
    metrics && metrics.statusCounts.failed > 0
      ? { href: "/runs" as const, text: `本窗口失败 ${metrics.statusCounts.failed} 条` }
      : null,
    metrics && metrics.statusCounts.handed_off > 0
      ? { href: "/runs" as const, text: `本窗口转人工 ${metrics.statusCounts.handed_off} 条` }
      : null,
    lowScores > 0 ? { href: "/ops/ratings" as const, text: `低分评价 ${lowScores} 条` } : null,
    openImprovements > 0
      ? { href: "/ops/improvements" as const, text: `待处理改进 ${openImprovements} 条` }
      : null,
    pendingAnnotations > 0
      ? { href: "/ops/annotate" as const, text: `待审标注 ${pendingAnnotations} 条` }
      : null,
  ].filter(Boolean) as Array<{ href: "/runs" | "/ops/ratings" | "/ops/improvements" | "/ops/annotate"; text: string }>;

  const statusChartData = metrics
    ? [
        { name: "成功", count: metrics.statusCounts.succeeded },
        { name: "失败", count: metrics.statusCounts.failed },
        { name: "转人工", count: metrics.statusCounts.handed_off },
        { name: "运行中", count: metrics.statusCounts.running },
      ]
    : [];

  const riskAlert: KpiAlert | undefined = metrics
    ? metrics.riskLevels.block >= 5 ||
      (metrics.totalRuns > 0 && metrics.riskLevels.block / metrics.totalRuns >= 0.3)
      ? metrics.riskLevels.block / Math.max(metrics.totalRuns, 1) >= 0.5
        ? "danger"
        : "warn"
      : undefined
    : undefined;

  async function refreshSnapshot() {
    const response = await fetch("/api/ops");
    const json = (await response.json()) as OpsSnapshot & { ok?: boolean; message?: string };
    if (!response.ok || json.ok === false) {
      throw new Error(json.message || "刷新运营数据失败");
    }
    const next: OpsSnapshot = {
      metrics: json.metrics,
      runs: json.runs ?? [],
      ratings: json.ratings ?? [],
      annotations: json.annotations ?? [],
      improvements: json.improvements ?? [],
      evalCases: json.evalCases ?? [],
      evalBatches: json.evalBatches ?? [],
      abTests: json.abTests ?? [],
      clusterNote: json.clusterNote ?? "规则聚类",
      loadErrors: json.loadErrors ?? {},
    };
    setSnapshot(next);
    return next;
  }

  async function retryKpi(id: KpiId) {
    setRetryingIds((prev) => ({ ...prev, [id]: true }));
    try {
      const next = await refreshSnapshot();
      const scoped = filterRunsByTrafficScope(filterRunsByTimeRange(next.runs, range), traffic);
      const forMetrics = dedupeQuestions ? dedupeRunsByQuestion(scoped) : scoped;
      const runsError = next.loadErrors?.runs;
      let nextMetrics = null as ReturnType<typeof computeMetrics> | null;
      let error: string | null = runsError ?? null;
      if (!error) {
        try {
          nextMetrics = computeMetrics(forMetrics);
        } catch (caught) {
          error = caught instanceof Error ? caught.message : "指标计算失败";
        }
      }
      const rebuilt = buildKpiCards({
        metrics: nextMetrics,
        runsError: error,
        rangeLabel,
        trafficLabel: trafficMeta.label,
      }).find((item) => item.id === id);
      if (rebuilt) {
        setCardOverrides((prev) => ({ ...prev, [id]: rebuilt }));
      }
    } catch (error) {
      setCardOverrides((prev) => ({
        ...prev,
        [id]: {
          id,
          label: kpiCards.find((item) => item.id === id)?.label ?? id,
          status: "error",
          message: error instanceof Error ? error.message : "重试失败",
        },
      }));
    } finally {
      setRetryingIds((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">运行监控</h2>
          <p className="text-sm text-muted-foreground">
            {trafficMeta.label}（{trafficMeta.hint}）· {rangeLabel}
            {isPending ? " · 同步筛选…" : ""} ·{" "}
            {metricsResult.error
              ? "指标不可用"
              : dedupeQuestions
                ? `去重后 ${metrics?.totalRuns ?? 0} 条（原 ${scopedRuns.length}）`
                : `${metrics?.totalRuns ?? 0} 条`}{" "}
            {metrics ? `· 已结束 ${metrics.finishedRuns} 条` : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-1">
            {TRAFFIC_OPTIONS.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={traffic === item.id ? "default" : "outline"}
                onClick={() => updateFilters({ traffic: item.id })}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {RANGE_OPTIONS.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={range === item.id ? "default" : "outline"}
                onClick={() => updateFilters({ range: item.id })}
              >
                {item.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={dedupeQuestions ? "default" : "outline"}
              onClick={() => updateFilters({ dedupe: !dedupeQuestions })}
              title="同一问题只保留最近一条，避免演示题刷高比率"
            >
              问题去重
            </Button>
          </div>
        </div>
      </div>

      {alerts.length > 0 ? (
        <div className="flex flex-wrap gap-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2">
          <span className="self-center text-xs font-medium text-amber-900">待办</span>
          {alerts.map((item) => (
            <Link
              key={item.text}
              href={item.href as "/"}
              className="rounded-md border border-amber-200 bg-card px-2.5 py-1 text-xs text-amber-950 hover:bg-amber-100"
            >
              {item.text}
            </Link>
          ))}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map((card) => (
          <KpiCard
            key={card.id}
            model={card}
            retrying={Boolean(retryingIds[card.id])}
            onRetry={() => void retryKpi(card.id)}
          />
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card className={metricsResult.error ? "border-red-300 bg-red-50/40" : undefined}>
          <CardHeader>
            <CardTitle>状态与性能</CardTitle>
            <CardDescription>本窗口结果构成与耗时</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {metricsResult.error || !metrics ? (
              <PanelError message={metricsResult.error || "状态数据不可用"} onRetry={() => void refreshSnapshot().then(() => setCardOverrides({}))} />
            ) : (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">状态分布</p>
                  <div className="mt-2">
                    <RunStatusChart data={statusChartData} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">耗时</p>
                  <p className="mt-1 text-sm">
                    P50 {metrics.p50DurationMs}ms · P95 {metrics.p95DurationMs}ms · 均 {metrics.avgDurationMs}ms
                  </p>
                  {metrics.slowestRuns.length > 0 ? (
                    <ul className="mt-2 space-y-1.5 border-t border-border pt-2 text-xs text-muted-foreground">
                      {metrics.slowestRuns.map((item) => (
                        <li key={item.id} className="flex gap-2 truncate">
                          <Link className="shrink-0 font-medium text-foreground underline" href={`/runs/${item.id}` as "/"}>
                            {item.durationMs}ms
                          </Link>
                          <span className="truncate">{item.question}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card
          className={
            riskAlert === "danger"
              ? "border-red-300 bg-red-50/50"
              : riskAlert === "warn"
                ? "border-amber-300 bg-amber-50/40"
                : metricsResult.error
                  ? "border-red-300 bg-red-50/40"
                  : undefined
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              风险与失败
              {riskAlert ? (
                <span
                  className={
                    riskAlert === "danger"
                      ? "rounded px-1.5 py-0.5 text-xs font-medium text-red-800 bg-red-100"
                      : "rounded px-1.5 py-0.5 text-xs font-medium text-amber-900 bg-amber-100"
                  }
                >
                  {riskAlert === "danger" ? "偏高" : "需关注"}
                </span>
              ) : null}
            </CardTitle>
            <CardDescription>规则触发与失败步骤</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {metricsResult.error || !metrics ? (
              <PanelError message={metricsResult.error || "风险数据不可用"} onRetry={() => void refreshSnapshot().then(() => setCardOverrides({}))} />
            ) : (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">风险审核分布</p>
                  <p className="mt-1 text-sm">
                    allow {metrics.riskLevels.allow} ·{" "}
                    <span className={metrics.riskLevels.block > 0 ? "font-semibold text-amber-900" : undefined}>
                      block {metrics.riskLevels.block}
                    </span>{" "}
                    · 无 {metrics.riskLevels.none}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">风险规则命中</p>
                  {metrics.riskRules.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">本窗口暂无触发规则</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-sm">
                      {metrics.riskRules.map((item) => (
                        <li key={item.rule} className="flex justify-between gap-2 border-b border-border/60 py-1 last:border-0">
                          <span>{item.rule}</span>
                          <span className="tabular-nums text-muted-foreground">{item.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">失败步骤</p>
                  {metrics.failedSteps.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">暂无失败步骤</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-sm">
                      {metrics.failedSteps.slice(0, 6).map((item) => (
                        <li
                          key={`${item.type}-${item.name}`}
                          className="flex justify-between gap-2 border-b border-border/60 py-1 last:border-0"
                        >
                          <span>
                            {item.type}/{item.name}
                          </span>
                          <span className="tabular-nums font-medium text-red-800">{item.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <AttentionList
          title="最近失败"
          description="本窗口失败 Run"
          runs={metrics?.recentFailed ?? []}
          empty="本窗口没有失败运行"
          highlight={Boolean(metrics && metrics.recentFailed.length > 0)}
          error={metricsResult.error}
          onRetry={() => void refreshSnapshot().then(() => setCardOverrides({}))}
        />
        <AttentionList
          title="最近转人工"
          description="终态为 handed_off"
          runs={metrics?.recentHandoffs ?? []}
          empty="本窗口没有转人工"
          highlight={Boolean(metrics && metrics.recentHandoffs.length > 0)}
          error={metricsResult.error}
          onRetry={() => void refreshSnapshot().then(() => setCardOverrides({}))}
        />
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>最近运行</CardTitle>
            <CardDescription>本窗口最近 {metrics?.recentRuns.length ?? 0} 条</CardDescription>
          </div>
          <Link className="text-sm underline" href={"/runs" as "/"}>
            全部存档
          </Link>
        </CardHeader>
        <CardContent>
          {metricsResult.error ? (
            <PanelError message={metricsResult.error} onRetry={() => void refreshSnapshot().then(() => setCardOverrides({}))} />
          ) : !metrics || metrics.recentRuns.length === 0 ? (
            <EmptyState title="还没有运行" description="切换时间窗口，或先去工作台 / Demo 跑一条。" />
          ) : (
            <RunRows runs={metrics.recentRuns} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>运营摘要</CardTitle>
          <CardDescription>只看数量，操作请进对应子页（不受上方时间窗口影响）</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <HubLink
            href="/ops/ratings"
            title="服务评价"
            error={loadErrors?.ratings}
            detail={
              loadErrors?.ratings
                ? loadErrors.ratings
                : ratings.length === 0
                  ? "暂无评分"
                  : `${ratings.length} 条 · 均分 ${avgScore}${lowScores ? ` · 低分 ${lowScores}` : ""}`
            }
          />
          <HubLink
            href="/ops/annotate"
            title="数据标注"
            error={loadErrors?.annotations}
            detail={
              loadErrors?.annotations
                ? loadErrors.annotations
                : `${annotations.length} 条 · 待审 ${pendingAnnotations}`
            }
          />
          <HubLink
            href="/ops/improvements"
            title="改进建议"
            error={loadErrors?.improvements}
            detail={
              loadErrors?.improvements
                ? loadErrors.improvements
                : `${improvements.length} 条 · open ${openImprovements}`
            }
          />
          <HubLink
            href="/ops/eval"
            title="测评集"
            error={loadErrors?.evalCases}
            detail={loadErrors?.evalCases ? loadErrors.evalCases : `${evalCases.length} 条用例`}
          />
          <HubLink
            href="/ops/center"
            title="测评中心"
            error={loadErrors?.evalBatches}
            detail={loadErrors?.evalBatches ? loadErrors.evalBatches : `${evalBatches.length} 个批次`}
          />
          <HubLink href="/ops/prompt-ab" title="Prompt A/B" detail="对比与晋升" />
          <HubLink href="/ops/rollback" title="版本回滚" detail="快照恢复与清理" />
        </CardContent>
      </Card>
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-950">
      <p>加载失败：{message}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}

function AttentionList({
  title,
  description,
  runs,
  empty,
  highlight,
  error,
  onRetry,
}: {
  title: string;
  description: string;
  runs: RunRecord[];
  empty: string;
  highlight?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <Card className={highlight && !error ? "border-amber-300 bg-amber-50/30" : error ? "border-red-300 bg-red-50/40" : undefined}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <PanelError message={error} onRetry={onRetry ?? (() => undefined)} />
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <RunRows runs={runs} />
        )}
      </CardContent>
    </Card>
  );
}

function RunRows({ runs }: { runs: RunRecord[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {runs.map((run) => (
        <li key={run.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border py-2">
          <span className="min-w-0 break-words">
            {run.question}
            <span className="block text-xs text-muted-foreground">
              {run.id} · {run.durationMs}ms
            </span>
          </span>
          <span className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusLabel
              text={runStatusLabel[run.status]}
              tone={run.status === "succeeded" ? "ok" : run.status === "failed" ? "danger" : "warn"}
            />
            <Link href={`/runs/${run.id}` as "/"} className="text-sm underline">
              打开详情
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

function KpiCard({
  model,
  retrying,
  onRetry,
}: {
  model: KpiCardModel;
  retrying?: boolean;
  onRetry: () => void;
}) {
  if (model.status === "error") {
    return (
      <Card className="border-red-300 bg-red-50/60">
        <CardContent className="space-y-2 px-4 py-4">
          <p className="text-xs font-medium text-red-900">{model.label}</p>
          <p className="text-sm text-red-950">取数失败</p>
          <p className="text-xs text-red-800/90 break-words">{model.message}</p>
          <Button type="button" size="sm" variant="outline" disabled={retrying} onClick={onRetry}>
            {retrying ? "重试中…" : "重试"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const alert = model.alert;
  const cardClass =
    alert === "danger"
      ? "border-red-300 bg-red-50/70"
      : alert === "warn"
        ? "border-amber-300 bg-amber-50/60"
        : undefined;
  const valueClass =
    alert === "danger"
      ? "text-3xl font-semibold tracking-tight tabular-nums text-red-800"
      : alert === "warn"
        ? "text-3xl font-semibold tracking-tight tabular-nums text-amber-950"
        : "text-3xl font-semibold tracking-tight tabular-nums";

  return (
    <Card className={cardClass}>
      <CardContent className="space-y-1 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{model.label}</p>
          {alert ? (
            <span
              className={
                alert === "danger"
                  ? "rounded px-1.5 py-0.5 text-[10px] font-medium text-red-800 bg-red-100"
                  : "rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-900 bg-amber-100"
              }
            >
              {model.alertReason ?? (alert === "danger" ? "异常" : "关注")}
            </span>
          ) : null}
        </div>
        <p className={valueClass}>{model.value}</p>
        {model.hint ? <p className="text-xs text-muted-foreground">{model.hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function HubLink({
  href,
  title,
  detail,
  error,
}: {
  href: string;
  title: string;
  detail: string;
  error?: string;
}) {
  return (
    <Link
      href={href as "/ops"}
      className={
        error
          ? "block rounded-md border border-red-200 bg-red-50/50 px-3 py-2 hover:bg-red-50"
          : "block rounded-md border border-border px-3 py-2 hover:bg-muted/50"
      }
    >
      <p className="text-sm font-medium">{title}</p>
      <p className={`text-xs ${error ? "text-red-800" : "text-muted-foreground"}`}>
        {error ? `加载失败：${detail}` : detail}
      </p>
    </Link>
  );
}
