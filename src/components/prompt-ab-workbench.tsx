"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FeedbackBanner } from "@/components/feedback-banner";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionFeedback } from "@/hooks/use-action-state";
import type { PromptAbCasePreview, PromptAbExperimentView } from "@/lib/ops/improvement-samples";
import { diffText } from "@/lib/skills/diff";
import type { EvalBatch, EvalBatchCompare, EvalCaseResult, PromptAbCaseSuite, PromptAbExperiment } from "@/lib/types";

type ApiOk<T> = { ok?: boolean; message?: string } & T;

async function api<T>(url: string, init?: RequestInit): Promise<ApiOk<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await response.json()) as ApiOk<T>;
  if (!response.ok || json.ok === false) {
    throw new Error(json.message || "请求失败");
  }
  return json;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  running: "跑测中",
  ready: "可确认",
  promoted: "已晋升",
  discarded: "已废弃",
};

const KIND_LABEL: Record<string, string> = {
  skill: "Skill Prompt",
  planner: "Planner",
  tool: "Tool",
};

function experimentSubject(item: PromptAbExperiment) {
  if (item.kind === "planner") return "Planner.md";
  if (item.kind === "tool") return item.controlToolId || "tool";
  return `${item.controlSkillId || "skill"} ← ${item.treatmentSkillId || "tmp"}`;
}

type Detail = {
  experiment: PromptAbExperimentView;
  controlBatch: EvalBatch | null;
  treatmentBatch: EvalBatch | null;
  compare: EvalBatchCompare | null;
};

export function PromptAbWorkbench({
  initialExperiments,
  initialSuiteCounts,
}: {
  initialExperiments: PromptAbExperimentView[];
  initialSuiteCounts: { all: number; "ab-smoke": number };
}) {
  const search = useSearchParams();
  const queryId = search.get("id") || "";
  const [experiments, setExperiments] = useState(initialExperiments);
  const [suiteCounts, setSuiteCounts] = useState(initialSuiteCounts);
  const [selectedId, setSelectedId] = useState(queryId || initialExperiments[0]?.id || "");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [caseSuite, setCaseSuite] = useState<PromptAbCaseSuite>(
    initialSuiteCounts["ab-smoke"] > 0 ? "ab-smoke" : "all",
  );
  const action = useActionFeedback();

  const loadList = useCallback(async () => {
    const next = await api<{
      experiments: PromptAbExperimentView[];
      suiteCounts: { all: number; "ab-smoke": number };
    }>("/api/prompt-ab");
    setExperiments(next.experiments);
    if (next.suiteCounts) setSuiteCounts(next.suiteCounts);
    return next.experiments;
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    const next = await api<Detail>(`/api/prompt-ab/${id}`);
    setDetail(next);
    setExperiments((prev) => prev.map((item) => (item.id === id ? next.experiment : item)));
    if (next.experiment.caseSuite === "ab-smoke" || next.experiment.caseSuite === "all") {
      setCaseSuite(next.experiment.caseSuite);
    }
  }, []);

  useEffect(() => {
    if (queryId) setSelectedId(queryId);
  }, [queryId]);

  useEffect(() => {
    void loadDetail(selectedId).catch(() => setDetail(null));
  }, [loadDetail, selectedId]);

  useEffect(() => {
    const control = detail?.controlBatch;
    const treatment = detail?.treatmentBatch;
    const live =
      detail?.experiment.status === "running" ||
      control?.status === "queued" ||
      control?.status === "running" ||
      treatment?.status === "queued" ||
      treatment?.status === "running";
    if (!detail || !live) return;
    const timer = window.setInterval(() => {
      void loadDetail(detail.experiment.id);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [detail, loadDetail]);

  const selected = detail?.experiment ?? experiments.find((item) => item.id === selectedId) ?? null;
  const batchesLive =
    detail?.controlBatch?.status === "queued" ||
    detail?.controlBatch?.status === "running" ||
    detail?.treatmentBatch?.status === "queued" ||
    detail?.treatmentBatch?.status === "running";
  const canShowPairs = Boolean(detail?.controlBatch && detail?.treatmentBatch);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>离线 A/B</CardTitle>
          <CardDescription>
            支持 Skill Prompt / Planner / Tool。双跑 = 焦点用例 ∪ 回归套件（烟测/全量）。对照 A = 生产，实验 B = 运行时覆盖；先看焦点再看回归，晋升须人工确认。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          同根因样本并进改进单后全部是焦点题；送 A/B / 开跑时会自动确保有测评用例。本页分区展示焦点与回归。
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>实验列表</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {experiments.length === 0 ? (
              <EmptyState title="还没有 Prompt A/B 实验" description="先到改进建议生成草案并送入本页。" />
            ) : (
              <ul className="max-h-[28rem] space-y-1 overflow-auto text-sm">
                {experiments.map((item) => (
                  <li
                    key={item.id}
                    className={`relative rounded-md border ${
                      item.id === selectedId ? "border-foreground/30 bg-muted" : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full px-2 py-2 pr-12 text-left"
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {item.diagnosis ? (
                          <>
                            <span className="rounded border border-[#e4d8c8] bg-[#f0e4d4] px-1.5 py-0.5 text-[#8a4b24]">
                              {item.diagnosis.summary}
                            </span>
                            {item.diagnosis.needsConfirm && !item.diagnosisConfirmed ? (
                              <span className="rounded border border-[#e8c4a0] bg-[#fff6eb] px-1.5 py-0.5 text-[#9a5b2f]">
                                待确认
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {KIND_LABEL[item.kind || "skill"]} · 无链路归因
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {KIND_LABEL[item.kind || "skill"]} · {STATUS_LABEL[item.status] || item.status} · 焦点{" "}
                        {item.focusCaseCount ?? item.focusCaseIds?.length ?? 0} · 回归{" "}
                        {item.regressionCaseCount ??
                          Math.max(0, item.caseIds.length - (item.focusCaseIds?.length ?? 0))}
                      </span>
                      {item.diagnosis?.rationale ? (
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground line-clamp-2">
                          原因：{item.diagnosis.rationale}
                        </span>
                      ) : null}
                      {item.sourceSamples?.[0]?.question ? (
                        <span className="mt-1 block text-xs leading-5 text-foreground/80 line-clamp-2">
                          来源问：{item.sourceSamples[0].question}
                        </span>
                      ) : item.improvementTitle ? (
                        <span className="mt-1 block text-xs leading-5 text-foreground/80 line-clamp-2">
                          改进：{item.improvementTitle}
                        </span>
                      ) : null}
                      {item.casePreviews?.[0]?.question ? (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground line-clamp-1">
                          测评例：{item.casePreviews[0].name}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 z-10 rounded border border-border bg-secondary/90 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground transition-colors hover:border-[#d4b896] hover:bg-[#f0e4d4] hover:text-[#8a4b24]"
                      disabled={action.phase === "loading"}
                      onClick={(event) => {
                        event.stopPropagation();
                        action.run(async () => {
                          const tip =
                            item.status === "promoted"
                              ? "删除后仅从列表移除该实验记录，不会回滚已写入生产的配置。确定删除？"
                              : "确定删除该实验？临时草案会清理，不会写入生产。";
                          if (!window.confirm(tip)) return "已取消删除";
                          await api(`/api/prompt-ab/${item.id}`, { method: "DELETE" });
                          const next = await loadList();
                          if (selectedId === item.id) {
                            setSelectedId(next[0]?.id || "");
                            setDetail(null);
                          }
                          return "已删除实验";
                        }, "删除失败");
                      }}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link href={"/ops/improvements" as "/ops"} className="inline-flex text-sm underline">
              返回改进建议
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>实验详情</CardTitle>
            <CardDescription>双批同一用例集：先看焦点区是否修好，再看回归区有无新挂</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <EmptyState title="请选择实验" description="或从改进建议送入新实验。" />
            ) : (
              <>
                <div className="space-y-1 text-sm">
                  <p className="text-base font-medium">{selected.name}</p>
                  <p className="text-muted-foreground">
                    <StatusLabel
                      text={STATUS_LABEL[selected.status] || selected.status}
                      tone={selected.status === "ready" ? "ok" : selected.status === "running" ? "warn" : "neutral"}
                    />{" "}
                    · <StatusLabel text={KIND_LABEL[selected.kind || "skill"]} tone="info" /> · 改进{" "}
                    <Link className="underline" href={`/ops/improvements?id=${selected.improvementId}` as "/ops"}>
                      {selected.improvementTitle || selected.improvementId}
                    </Link>
                  </p>
                  <p className="text-muted-foreground">对象：{experimentSubject(selected)}</p>
                  <p className="text-muted-foreground">
                    上次双跑：{selected.caseSuite === "ab-smoke" ? "AB 烟测" : selected.caseSuite === "all" ? "全部启用" : "未跑"} ·
                    焦点 {selected.focusCaseCount ?? selected.focusCaseIds?.length ?? 0} · 回归{" "}
                    {selected.regressionCaseCount ??
                      Math.max(0, selected.caseIds.length - (selected.focusCaseIds?.length ?? 0))}{" "}
                    · 共 {selected.caseIds.length} 条
                  </p>
                  {selected.note ? <p className="text-xs text-muted-foreground">{selected.note}</p> : null}
                </div>

                {selected.diagnosis ? (
                  <div className="space-y-2 rounded-md border border-[#e4d8c8] bg-[#fffaf3] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">来源改进 · 链路归因</p>
                      {selected.diagnosis.needsConfirm && !selected.diagnosisConfirmed ? (
                        <StatusLabel text="待确认" tone="warn" />
                      ) : (
                        <StatusLabel text="已确认/高置信" tone="ok" />
                      )}
                    </div>
                    <p className="text-sm text-[#8a4b24]">{selected.diagnosis.summary}</p>
                    <p className="text-xs text-muted-foreground">原因：{selected.diagnosis.rationale}</p>
                    {(selected.diagnosis.evidence ?? []).length > 0 ? (
                      <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                        {selected.diagnosis.evidence.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      本实验 kind（{KIND_LABEL[selected.kind || "skill"]}）应对齐上述嫌疑；不对请回改进建议改归类后重送。
                    </p>
                  </div>
                ) : null}

                {(selected.sourceSamples?.length ?? 0) > 0 ? (
                  <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                    <p className="text-sm font-medium">焦点来源样本</p>
                    <ul className="space-y-2 text-sm">
                      {selected.sourceSamples.map((sample) => (
                        <li key={sample.runId} className="rounded-md border border-border bg-card p-2">
                          <p className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded border border-[#e4d8c8] bg-[#f0e4d4] px-1.5 py-0.5 text-[11px] text-[#8a4b24]">
                              焦点
                            </span>
                            <span className="font-medium leading-5">{sample.question}</span>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            回复：{sample.replyPreview}
                            {sample.emptyReply ? " · 空回复" : ""}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-2 text-xs">
                            <Link className="underline" href={`/ops/annotate?runId=${sample.runId}` as "/ops"}>
                              回标注页
                            </Link>
                            <Link className="underline" href={`/ops?run=${sample.runId}` as "/ops"}>
                              看 Trace
                            </Link>
                            <span className="text-muted-foreground">{sample.runId}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {(selected.casePreviews?.length ?? 0) > 0 ? (
                  <CasePreviewTiers previews={selected.casePreviews} />
                ) : null}

                <div className="flex flex-wrap items-end gap-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    双跑测评集
                    <select
                      className="block h-9 min-w-[12rem] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                      value={caseSuite}
                      disabled={selected.status === "promoted" || selected.status === "discarded" || batchesLive}
                      onChange={(e) => setCaseSuite(e.target.value as PromptAbCaseSuite)}
                    >
                      <option value="ab-smoke" disabled={suiteCounts["ab-smoke"] <= 0}>
                        只跑 AB 烟测（{suiteCounts["ab-smoke"]} 条）
                      </option>
                      <option value="all">全部启用（{suiteCounts.all} 条）</option>
                    </select>
                  </label>
                  <Button
                    type="button"
                    disabled={selected.status === "promoted" || selected.status === "discarded" || batchesLive}
                    onClick={() =>
                      action.run(async () => {
                        const result = await api<{ experiment: PromptAbExperiment; message?: string }>(
                          `/api/prompt-ab/${selected.id}/run`,
                          {
                            method: "POST",
                            body: JSON.stringify({ caseSuite }),
                          },
                        );
                        await loadList();
                        await loadDetail(result.experiment.id);
                        return result.message || "已启动双批跑测";
                      }, "跑测失败")
                    }
                  >
                    {selected.controlBatchId ? "重新双批跑测" : "开始双批跑测"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={selected.status !== "ready"}
                    onClick={() =>
                      action.run(async () => {
                        if (
                          !window.confirm(
                            "确认将实验组配置写入生产？请先看清修好/新增失败。此操作不可自动撤销（Skill/Planner 可用版本回滚）。",
                          )
                        ) {
                          return "已取消晋升";
                        }
                        const result = await api<{ message?: string }>(`/api/prompt-ab/${selected.id}/promote`, {
                          method: "POST",
                        });
                        await loadList();
                        await loadDetail(selected.id);
                        return result.message || "已晋升生产";
                      }, "晋升失败")
                    }
                  >
                    人工确认晋升生产
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={selected.status === "promoted" || selected.status === "discarded"}
                    onClick={() =>
                      action.run(async () => {
                        if (!window.confirm("废弃该实验？不会写入生产。")) return "已取消";
                        await api(`/api/prompt-ab/${selected.id}/discard`, { method: "POST" });
                        await loadList();
                        await loadDetail(selected.id);
                        return "已废弃";
                      }, "废弃失败")
                    }
                  >
                    废弃实验
                  </Button>
                </div>

                <FeedbackBanner phase={action.phase} message={action.message} />

                {detail?.controlBatch || detail?.treatmentBatch ? (
                  <DualRunProgress
                    control={detail?.controlBatch ?? null}
                    treatment={detail?.treatmentBatch ?? null}
                    live={batchesLive || selected.status === "running"}
                  />
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <BatchCard title="对照 A（生产）" batch={detail?.controlBatch ?? null} />
                  <BatchCard title="实验 B（草案）" batch={detail?.treatmentBatch ?? null} />
                </div>

                {detail?.compare ? <CompareCard compare={detail.compare} /> : null}

                {canShowPairs && detail?.controlBatch && detail?.treatmentBatch ? (
                  <CaseSideBySideList
                    control={detail.controlBatch}
                    treatment={detail.treatmentBatch}
                    live={batchesLive || selected.status === "running"}
                    focusCaseIds={selected.focusCaseIds ?? []}
                  />
                ) : null}

                <details className="rounded-md border border-border p-2 text-xs">
                  <summary className="cursor-pointer font-medium">
                    {selected.kind === "tool"
                      ? "实验组 Tool 元数据预览"
                      : selected.kind === "planner"
                        ? "实验组 Planner 草案预览"
                        : "实验组 Prompt 草案预览"}
                  </summary>
                  {selected.kind === "tool" ? (
                    <div className="mt-2 space-y-1 whitespace-pre-wrap break-words">
                      <p>Tool：{selected.controlToolId}</p>
                      <p>enabled：{String(selected.draftEnabled ?? true)}</p>
                      <pre className="max-h-48 overflow-auto">{selected.draftDescription || selected.draftPrompt}</pre>
                    </div>
                  ) : (
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{selected.draftPrompt}</pre>
                  )}
                </details>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function batchProgress(batch: EvalBatch | null) {
  if (!batch) return { total: 0, done: 0, current: 0, pct: 0, status: "none" as const };
  const total = batch.total || batch.caseIds.length || 0;
  const done = batch.caseResults.length;
  const current = batch.currentIndex || done;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return { total, done, current, pct, status: batch.status };
}

function DualRunProgress({
  control,
  treatment,
  live,
}: {
  control: EvalBatch | null;
  treatment: EvalBatch | null;
  live: boolean;
}) {
  const a = batchProgress(control);
  const b = batchProgress(treatment);
  const overallDone = a.done + b.done;
  const overallTotal = a.total + b.total;
  const overallPct = overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {live ? (
            <>
              <StatusLabel text="跑测中" tone="warn" /> 边跑边出结果
            </>
          ) : (
            <>
              <StatusLabel text="已完成" tone="ok" /> 双批进度
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          合计 {overallDone}/{overallTotal}（{overallPct}%）
        </p>
      </div>
      <ProgressBar label={`对照 A · ${a.done}/${a.total}`} pct={a.pct} hint={progressHint(a)} />
      <ProgressBar label={`实验 B · ${b.done}/${b.total}`} pct={b.pct} hint={progressHint(b)} />
    </div>
  );
}

function progressHint(p: ReturnType<typeof batchProgress>) {
  if (p.status === "none") return "未开始";
  if (p.status === "queued") return "排队中";
  if (p.status === "running") return p.total ? `正在跑第 ${Math.min(p.current || p.done + 1, p.total)} / ${p.total} 条` : "跑测中";
  if (p.status === "done") return "已完成";
  if (p.status === "error") return "出错";
  if (p.status === "cancelled") return "已取消";
  return p.status;
}

function ProgressBar({ label, pct, hint }: { label: string; pct: number; hint: string }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">{hint}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/70 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BatchCard({ title, batch }: { title: string; batch: EvalBatch | null }) {
  if (!batch) {
    return (
      <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{title}</p>
        <p>尚未跑批</p>
      </div>
    );
  }
  const p = batchProgress(batch);
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">
        {batch.status} · 进度 {p.done}/{p.total} · 质量通过率 {Math.round(batch.qualityPassRate * 1000) / 10}% · PASS{" "}
        {batch.passed} / FAIL {batch.failed} / REVIEW {batch.review} / ERROR {batch.errors}
      </p>
      <Link className="text-xs underline" href={`/ops/center` as "/ops"}>
        在测评中心查看 {batch.id}
      </Link>
    </div>
  );
}

function CompareCard({ compare }: { compare: EvalBatchCompare }) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="font-medium">对比结果 {compare.comparable ? "（可比）" : "（不可比）"}</p>
      {!compare.comparable ? (
        <p className="text-muted-foreground">原因：{compare.reasons.join("、") || compare.mismatched.join("、")}</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            对照通过率 {Math.round(compare.counts.baseline.qualityPassRate * 1000) / 10}% → 实验{" "}
            {Math.round(compare.counts.candidate.qualityPassRate * 1000) / 10}%
          </p>
          <p>
            已修复 {compare.fixed.length} · 新增失败 {compare.newFailures.length} · 同状态回复变化{" "}
            {compare.replyChangedSameStatus.length}
          </p>
          {!compare.skills.same ? (
            <p className="text-xs text-muted-foreground">Skill 指纹不同（符合 Prompt A/B 预期）</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function CasePreviewTiers({ previews }: { previews: PromptAbCasePreview[] }) {
  const focus = previews.filter((item) => item.focusRole === "focus");
  const regression = previews.filter((item) => item.focusRole !== "focus");
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">焦点区（{focus.length}）</p>
        <p className="text-xs text-muted-foreground">改进单同根因样本对应题；优先看 A→B 是否变好。</p>
        {focus.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">暂无焦点用例（送 A/B 或开跑时会自动确保）。</p>
        ) : (
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
            {focus.map((item) => (
              <li key={item.caseId} className="rounded-md border border-[#e4d8c8] bg-[#fffaf3] px-2 py-1.5">
                <p className="font-medium leading-5">{item.name}</p>
                {item.question ? (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">问：{item.question}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="rounded-md border border-border/70 bg-muted/10 p-2">
        <summary className="cursor-pointer text-sm font-medium">
          回归区（{regression.length}）· 默认折叠
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">套件其余题；留意实验组是否新挂。</p>
        {regression.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">当前套件无额外回归题（焦点已覆盖）。</p>
        ) : (
          <ul className="mt-2 max-h-36 space-y-1 overflow-auto text-sm">
            {regression.map((item) => (
              <li key={item.caseId} className="rounded-md border border-border/60 px-2 py-1.5">
                <p className="font-medium leading-5">{item.name}</p>
                {item.question ? (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">问：{item.question}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

type CaseFilter = "all" | "ready" | "changed" | "fixed" | "regressed" | "unchanged" | "pending";

type CasePairRow = {
  caseId: string;
  name: string;
  question: string;
  a: EvalCaseResult | null;
  b: EvalCaseResult | null;
  kind: "fixed" | "regressed" | "changed" | "unchanged" | "missing" | "pending" | "partial";
  focusRole: "focus" | "regression";
};

function buildCasePairs(control: EvalBatch, treatment: EvalBatch, focusCaseIds: string[]): CasePairRow[] {
  const focusSet = new Set(focusCaseIds);
  const left = new Map(control.caseResults.map((item) => [item.caseId, item]));
  const right = new Map(treatment.caseResults.map((item) => [item.caseId, item]));
  const ids = control.caseIds.length ? control.caseIds : [...new Set([...left.keys(), ...right.keys()])];
  return ids.map((caseId) => {
    const a = left.get(caseId) ?? null;
    const b = right.get(caseId) ?? null;
    let kind: CasePairRow["kind"] = "pending";
    if (!a && !b) kind = "pending";
    else if (!a || !b) kind = "partial";
    else if (a.status !== "PASS" && b.status === "PASS") kind = "fixed";
    else if (b.status === "FAIL" && a.status !== "FAIL") kind = "regressed";
    else if (a.status !== b.status || (a.finalReply || "") !== (b.finalReply || "")) kind = "changed";
    else kind = "unchanged";
    return {
      caseId,
      name: b?.name || a?.name || caseId,
      question: b?.question || a?.question || "",
      a,
      b,
      kind,
      focusRole: focusSet.has(caseId) ? "focus" : "regression",
    };
  });
}

const CASE_KIND_LABEL: Record<CasePairRow["kind"], string> = {
  fixed: "已修复",
  regressed: "新增失败",
  changed: "有变化",
  unchanged: "无变化",
  missing: "缺结果",
  pending: "排队中",
  partial: "一侧已出",
};

function CaseSideBySideList({
  control,
  treatment,
  live,
  focusCaseIds,
}: {
  control: EvalBatch;
  treatment: EvalBatch;
  live: boolean;
  focusCaseIds: string[];
}) {
  const [filter, setFilter] = useState<CaseFilter>(live ? "all" : "changed");
  const [openId, setOpenId] = useState("");
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [regressionOpen, setRegressionOpen] = useState(false);
  const prevReadyRef = useRef(0);
  const rows = useMemo(
    () => buildCasePairs(control, treatment, focusCaseIds),
    [control, treatment, focusCaseIds],
  );

  useEffect(() => {
    if (live) setFilter("all");
  }, [live]);

  useEffect(() => {
    if (!live) {
      prevReadyRef.current = 0;
      return;
    }
    const ready = rows.filter((item) => item.a || item.b);
    if (ready.length > prevReadyRef.current && !pinnedOpen) {
      setOpenId(ready[ready.length - 1]?.caseId || "");
    }
    prevReadyRef.current = ready.length;
  }, [live, pinnedOpen, rows, control.caseResults.length, treatment.caseResults.length]);

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "ready") return rows.filter((item) => item.a || item.b);
    if (filter === "pending") return rows.filter((item) => item.kind === "pending");
    if (filter === "changed") {
      return rows.filter((item) => item.kind === "changed" || item.kind === "fixed" || item.kind === "regressed");
    }
    if (filter === "fixed") return rows.filter((item) => item.kind === "fixed");
    if (filter === "regressed") return rows.filter((item) => item.kind === "regressed");
    return rows.filter((item) => item.kind === "unchanged");
  }, [filter, rows]);

  const focusRows = visible.filter((item) => item.focusRole === "focus");
  const regressionRows = visible.filter((item) => item.focusRole === "regression");
  const readyCount = rows.filter((item) => item.a && item.b).length;

  const renderRow = (row: CasePairRow) => {
    const open = openId === row.caseId;
    const aReply = row.a?.finalReply || "";
    const bReply = row.b?.finalReply || "";
    const lines = open && row.a && row.b ? diffText(aReply, bReply) : [];
    return (
      <li key={row.caseId} className="rounded-md border border-border">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
          onClick={() => {
            const next = open ? "" : row.caseId;
            setOpenId(next);
            setPinnedOpen(Boolean(next));
          }}
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span
                className={
                  row.focusRole === "focus"
                    ? "rounded border border-[#e4d8c8] bg-[#f0e4d4] px-1.5 py-0.5 text-[11px] text-[#8a4b24]"
                    : "rounded border border-border bg-secondary/80 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                }
              >
                {row.focusRole === "focus" ? "焦点" : "回归"}
              </span>
              <span className="font-medium">{row.question || row.name}</span>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {CASE_KIND_LABEL[row.kind]} · A {row.a?.status || (live ? "…" : "—")} → B{" "}
              {row.b?.status || (live ? "…" : "—")}
              {row.question ? ` · ${row.name}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{open ? "收起" : "展开并排"}</span>
        </button>
        {open ? (
          <div className="space-y-2 border-t border-border p-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  对照 A · {row.a?.status || (live ? "跑测中…" : "无结果")}
                </p>
                <pre className="max-h-56 overflow-auto rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap break-words">
                  {row.a ? aReply || "（空）" : live ? "等待该条跑完…" : "（空）"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  实验 B · {row.b?.status || (live ? "跑测中…" : "无结果")}
                </p>
                <pre className="max-h-56 overflow-auto rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap break-words">
                  {row.b ? bReply || "（空）" : live ? "等待该条跑完…" : "（空）"}
                </pre>
              </div>
            </div>
            {row.a && row.b ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">行级 diff（A→B）</p>
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-2 text-xs whitespace-pre-wrap break-words">
                  {lines.length ? (
                    lines.map((line, index) => (
                      <div
                        key={`${row.caseId}-${line.type}-${index}`}
                        className={
                          line.type === "add"
                            ? "text-emerald-800"
                            : line.type === "remove"
                              ? "text-red-800"
                              : "text-muted-foreground"
                        }
                      >
                        {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "} {line.text}
                      </div>
                    ))
                  ) : (
                    <span className="text-muted-foreground">无差异</span>
                  )}
                </pre>
              </div>
            ) : null}
            {(row.a?.reason || row.b?.reason) && (
              <p className="text-xs text-muted-foreground">
                A 理由：{row.a?.reason || "—"} · B 理由：{row.b?.reason || "—"}
              </p>
            )}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          用例级 A/B 并排对照
          {live ? <span className="ml-2 text-xs font-normal text-amber-800">直播中 · 跑一条出一条</span> : null}
        </p>
        <select
          className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          value={filter}
          onChange={(e) => setFilter(e.target.value as CaseFilter)}
        >
          <option value="all">全部用例</option>
          <option value="ready">已有结果</option>
          <option value="pending">仍在排队</option>
          <option value="changed">只看有变化</option>
          <option value="fixed">仅已修复</option>
          <option value="regressed">仅新增失败</option>
          <option value="unchanged">仅无变化</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        双侧齐备 {readyCount}/{rows.length} · 焦点 {focusRows.length} · 回归 {regressionRows.length}
        {live ? " · 约每秒刷新" : ""}
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium">焦点区</p>
        {focusRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">当前筛选下没有焦点用例。</p>
        ) : (
          <ul className="max-h-[28rem] space-y-2 overflow-auto">{focusRows.map(renderRow)}</ul>
        )}
      </div>

      <details
        className="rounded-md border border-border/70 bg-muted/10 p-2"
        open={regressionOpen}
        onToggle={(e) => setRegressionOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm font-medium">回归区（{regressionRows.length}）</summary>
        {regressionRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">当前筛选下没有回归用例。</p>
        ) : (
          <ul className="mt-2 max-h-[24rem] space-y-2 overflow-auto">{regressionRows.map(renderRow)}</ul>
        )}
      </details>
    </div>
  );
}
