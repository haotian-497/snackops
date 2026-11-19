"use client";

import { ChevronDown, LoaderCircle, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { FeedbackBanner } from "@/components/feedback-banner";
import { JudgeBatchSummary } from "@/components/judge-batch-summary";
import {
  briefEvalRisk,
  briefFailReason,
  EvalCaseResultDetail,
  evalStatusTone,
  passedLabel,
} from "@/components/eval-case-result-detail";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/hooks/use-action-state";
import { formatQualityPassRate, isTerminalBatchStatus } from "@/lib/eval/batch-stats";
import { diffText } from "@/lib/skills/diff";
import type { EvalBatch, EvalBatchCompare, EvalCase, EvalCaseResult, RunRecord } from "@/lib/types";

type ApiOk<T> = { ok?: boolean; message?: string } & T;

async function api<T>(url: string, init?: RequestInit): Promise<ApiOk<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await response.json()) as ApiOk<T>;
  if (!response.ok || json.ok === false) throw new Error(json.message || "请求失败");
  return json;
}

function tone(status: string) {
  return evalStatusTone(status);
}

function batchStatusLabel(status: string) {
  if (status === "running") return "正在批量测试";
  if (status === "queued") return "排队中";
  if (status === "done") return "已完成";
  if (status === "error") return "出错";
  if (status === "cancelled") return "已取消";
  return status;
}

function batchOptionLabel(item: EvalBatch) {
  return `${item.saved ? "" : "未保存 · "}${item.versionLabel || item.name} · ${batchStatusLabel(item.status)} · ${item.id.slice(0, 12)}`;
}

function shortHash(value: string) {
  if (!value) return "（空）";
  return value.length <= 16 ? value : `${value.slice(0, 12)}…`;
}

function CompareCaseReplyCard({
  title,
  statusLine,
  baselineReply,
  candidateReply,
}: {
  title: string;
  statusLine: string;
  baselineReply: string;
  candidateReply: string;
}) {
  const [open, setOpen] = useState(false);
  const lines = open ? diffText(baselineReply || "", candidateReply || "") : [];
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="font-medium">{title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{statusLine}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{open ? "收起" : "展开对照"}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Baseline 回复</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap break-words">
                {baselineReply || "（空）"}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Candidate 回复</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap break-words">
                {candidateReply || "（空）"}
              </pre>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">行级 diff</p>
            <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-2 text-xs whitespace-pre-wrap break-words">
              {lines.length ? (
                lines.map((line, index) => (
                  <div
                    key={`${line.type}-${index}`}
                    className={
                      line.type === "add" ? "text-emerald-800" : line.type === "remove" ? "text-red-800" : "text-muted-foreground"
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
        </div>
      ) : null}
    </div>
  );
}

const BATCH_QUERY_KEY = "batch";
const BATCH_STORAGE_KEY = "snackops-eval-batch-id";
const AUTO_SAVE_KEY = "snackops-eval-auto-save";

export function EvalBatchPanel({
  cases,
  selectedCaseIds,
  initialBatches,
  initialBatchId = "",
  initialCaseId = "",
  requireSelection = false,
  runNonce = 0,
}: {
  cases: EvalCase[];
  selectedCaseIds: string[];
  initialBatches: EvalBatch[];
  initialBatchId?: string;
  initialCaseId?: string;
  requireSelection?: boolean;
  runNonce?: number;
}) {
  const firstBatch = [...initialBatches]
    .filter((item) => item.saved)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
  const restoredId = initialBatchId || "";
  const [name, setName] = useState("demo回归");
  const [versionLabel, setVersionLabel] = useState(initialBatches.some((item) => item.versionLabel === "baseline-v1") ? "risk-fix-v2" : "baseline-v1");
  const [changeNote, setChangeNote] = useState("");
  const [batches, setBatches] = useState(initialBatches);
  const [activeId, setActiveId] = useState(restoredId);
  const [batch, setBatch] = useState<EvalBatch | null>(
    () => initialBatches.find((item) => item.id === restoredId) ?? null,
  );
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compare, setCompare] = useState<EvalBatchCompare | null>(null);
  const [autoSave, setAutoSave] = useState(false);
  const [expandedCaseId, setExpandedCaseId] = useState(initialCaseId);
  const [runById, setRunById] = useState<Record<string, RunRecord | null>>({});
  const [runLoadingId, setRunLoadingId] = useState("");
  const [batchMenuOpen, setBatchMenuOpen] = useState(false);
  const runAction = useActionFeedback();
  const saveAction = useActionFeedback();
  const deleteAction = useActionFeedback();
  const compareAction = useActionFeedback();
  const submitting = useRef(false);
  const pollError = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const batchMenuRef = useRef<HTMLDivElement>(null);

  function scrollToResults() {
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function rememberAutoSave(next: boolean) {
    setAutoSave(next);
    try {
      localStorage.setItem(AUTO_SAVE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  function applyBatch(next: EvalBatch) {
    setBatch(next);
    setBatches((current) => {
      const others = current.filter((item) => item.id !== next.id);
      return [next, ...others];
    });
  }

  const savedBatches = useMemo(() => batches.filter((item) => item.saved), [batches]);
  const selectBatches = useMemo(() => {
    if (batch && !batch.saved) {
      return [batch, ...savedBatches.filter((item) => item.id !== batch.id)];
    }
    return savedBatches;
  }, [batch, savedBatches]);

  function persistBatch(id: string) {
    try {
      if (id) sessionStorage.setItem(BATCH_STORAGE_KEY, id);
      else sessionStorage.removeItem(BATCH_STORAGE_KEY);
    } catch {
      // ignore quota / private mode
    }
    const next = id ? `/ops/center?${BATCH_QUERY_KEY}=${encodeURIComponent(id)}` : "/ops/center";
    window.history.replaceState(window.history.state, "", next);
  }

  function openBatch(id: string, found?: EvalBatch) {
    setActiveId(id);
    setBatch(found ?? null);
    persistBatch(id);
  }

  const defaultHint = useMemo(() => {
    if (!firstBatch?.caseIds.length) return "不勾选用例则运行全部启用项";
    return `第二批默认可复用最早批次 ${firstBatch.caseIds.length} 条`;
  }, [firstBatch]);

  useEffect(() => {
    if (!activeId) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      void tick();
    }, 900);
    async function tick() {
      if (stopped) return;
      try {
        const result = await api<{ batch: EvalBatch }>(`/api/eval/batch/${activeId}`);
        if (stopped) return;
        pollError.current = 0;
        applyBatch(result.batch);
        if (isTerminalBatchStatus(result.batch.status)) {
          stopped = true;
          window.clearInterval(timer);
        }
      } catch (error) {
        pollError.current += 1;
        if (pollError.current >= 3) {
          stopped = true;
          window.clearInterval(timer);
          setBatch((current) =>
            current
              ? { ...current, status: "error", errorMessage: error instanceof Error ? error.message : "轮询失败" }
              : current,
          );
        }
      }
    }
    void tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeId]);

  useEffect(() => {
    if (restoredId) {
      try {
        sessionStorage.setItem(BATCH_STORAGE_KEY, restoredId);
      } catch {
        // ignore
      }
      return;
    }
    let stored = "";
    try {
      stored = sessionStorage.getItem(BATCH_STORAGE_KEY) ?? "";
    } catch {
      stored = "";
    }
    if (!stored) return;
    const found = initialBatches.find((item) => item.id === stored);
    if (!found) return;
    setActiveId(stored);
    setBatch(found);
    persistBatch(stored);
  }, []);

  useEffect(() => {
    if (!batchMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!batchMenuRef.current?.contains(event.target as Node)) setBatchMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [batchMenuOpen]);

  useEffect(() => {
    try {
      setAutoSave(localStorage.getItem(AUTO_SAVE_KEY) === "1");
    } catch {
      setAutoSave(false);
    }
  }, []);

  const lastActiveId = useRef(activeId);
  const loadedRunIds = useRef(new Set<string>());

  useEffect(() => {
    if (lastActiveId.current === activeId) return;
    lastActiveId.current = activeId;
    setExpandedCaseId("");
  }, [activeId]);

  async function loadRun(runId: string) {
    if (!runId || loadedRunIds.current.has(runId)) return;
    loadedRunIds.current.add(runId);
    setRunLoadingId(runId);
    try {
      const result = await api<{ run: RunRecord }>(`/api/runs/${encodeURIComponent(runId)}`);
      setRunById((current) => ({ ...current, [runId]: result.run ?? null }));
    } catch {
      setRunById((current) => ({ ...current, [runId]: null }));
    } finally {
      setRunLoadingId("");
    }
  }

  useEffect(() => {
    const item = batch?.caseResults.find((entry) => entry.caseId === expandedCaseId);
    if (item?.runId) void loadRun(item.runId);
  }, [expandedCaseId, batch]);

  function toggleCase(item: EvalCaseResult) {
    setExpandedCaseId((current) => (current === item.caseId ? "" : item.caseId));
  }

  function startRun() {
    if (submitting.current) return;
    if (requireSelection && selectedCaseIds.length === 0) return;
    submitting.current = true;
    runAction.run(async () => {
      try {
        const result = await api<{ batchId: string; batch: EvalBatch }>("/api/eval/batch/run", {
          method: "POST",
          body: JSON.stringify({
            name,
            versionLabel,
            changeNote,
            caseIds: selectedCaseIds.length ? selectedCaseIds : undefined,
            saveOnComplete: autoSave,
          }),
        });
        setActiveId(result.batchId);
        applyBatch(result.batch);
        persistBatch(result.batchId);
        pollError.current = 0;
        scrollToResults();
        return autoSave ? `已创建 ${result.batchId}，跑完后将保存` : `已创建 ${result.batchId}，跑完默认不保存`;
      } finally {
        window.setTimeout(() => {
          submitting.current = false;
        }, 800);
      }
    }, "创建批次失败");
  }

  function deleteSavedBatch(item: EvalBatch) {
    if (!item.saved) return;
    if (item.status === "running" || item.status === "queued") return;
    const label = item.versionLabel || item.name;
    if (!window.confirm(`删除已保存批次「${label}」？删除后无法从回归列表恢复。`)) return;
    const id = item.id;
    deleteAction.run(async () => {
      await api(`/api/eval/batch/${encodeURIComponent(id)}`, { method: "DELETE" });
      setBatches((current) => current.filter((entry) => entry.id !== id));
      setCompareFrom((current) => (current === id ? "" : current));
      setCompareTo((current) => (current === id ? "" : current));
      if (activeId === id) {
        setActiveId("");
        setBatch(null);
        persistBatch("");
      }
      return "已删除该回归批次";
    }, "删除失败");
  }

  function saveCurrent() {
    if (!batch || batch.saved) return;
    saveAction.run(async () => {
      const result = await api<{ batch: EvalBatch }>(`/api/eval/batch/${batch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ saved: true }),
      });
      applyBatch(result.batch);
      return result.message || "已保存为回归批次";
    }, "保存失败");
  }

  function toggleAutoSave() {
    const next = !autoSave;
    rememberAutoSave(next);
    if (!batch || batch.saved || isTerminalBatchStatus(batch.status)) return;
    void api<{ batch: EvalBatch }>(`/api/eval/batch/${batch.id}`, {
      method: "PATCH",
      body: JSON.stringify({ saveOnComplete: next }),
    })
      .then((result) => applyBatch(result.batch))
      .catch(() => {
        // keep the local toggle even if the in-flight batch cannot be updated
      });
  }

  useEffect(() => {
    if (runNonce === 0) return;
    startRun();
    scrollToResults();
    // Only trigger when the parent asks to start; startRun reads the latest form/selection from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runNonce]);

  return (
    <div className="space-y-3">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>批量测评</CardTitle>
          <CardDescription>
            用当前勾选用例跑同一条 Agent 链、规则评分和 LLM-as-Judge。跑完默认不保存为回归批次。
            {requireSelection ? "勾选后点上方「批量测试」即可开跑。" : defaultHint}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-xs text-muted-foreground">
            名称
            <Input value={name} onChange={(event) => setName(event.target.value)} className="mt-1" />
          </label>
          <label className="block text-xs text-muted-foreground">
            versionLabel
            <Input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} className="mt-1" />
          </label>
          <label className="block text-xs text-muted-foreground">
            changeNote
            <Textarea value={changeNote} onChange={(event) => setChangeNote(event.target.value)} className="mt-1 min-h-16" />
          </label>
          <p className="text-xs text-muted-foreground">
            本次将运行{" "}
            {selectedCaseIds.length
              ? `${selectedCaseIds.length} 条勾选用例`
              : requireSelection
                ? "0 条（尚未勾选）"
                : `全部 ${cases.filter((item) => item.enabled).length} 条启用用例`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={runAction.phase === "loading" || submitting.current || (requireSelection && selectedCaseIds.length === 0)}
              onClick={() => startRun()}
            >
              运行批次
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!batch || batch.saved || saveAction.phase === "loading"}
              onClick={() => saveCurrent()}
            >
              {batch?.saved ? "已保存当前批次" : "保存当前批次"}
            </Button>
            <Button
              type="button"
              variant={autoSave ? "default" : "outline"}
              aria-pressed={autoSave}
              onClick={() => toggleAutoSave()}
            >
              {autoSave ? "自动保存：已启动" : "自动保存：未启动"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {autoSave ? "之后每次批量测试跑完会自动保存为回归批次。" : "跑完只保留本次结果，点「保存当前批次」才写入回归列表。"}
          </p>
          <FeedbackBanner phase={runAction.phase} message={runAction.message} />
          <FeedbackBanner phase={saveAction.phase} message={saveAction.message} />
          <FeedbackBanner phase={deleteAction.phase} message={deleteAction.message} />
          <div ref={batchMenuRef} className="relative">
            <p className="text-xs text-muted-foreground">查看已保存批次</p>
            <button
              type="button"
              className="mt-1 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-left text-sm"
              aria-expanded={batchMenuOpen}
              aria-haspopup="listbox"
              onClick={() => setBatchMenuOpen((open) => !open)}
            >
              <span className={`min-w-0 truncate ${selectBatches.some((item) => item.id === activeId) ? "" : "text-muted-foreground"}`}>
                {selectBatches.find((item) => item.id === activeId)
                  ? batchOptionLabel(selectBatches.find((item) => item.id === activeId)!)
                  : "选择批次以回看报告"}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
            {batchMenuOpen ? (
              <ul
                className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-background shadow-md"
                role="listbox"
              >
                {selectBatches.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-muted-foreground">还没有可回看的批次。</li>
                ) : (
                  selectBatches.map((item) => {
                    const active = item.id === activeId;
                    const canDelete =
                      item.saved && item.status !== "running" && item.status !== "queued" && deleteAction.phase !== "loading";
                    return (
                      <li
                        key={item.id}
                        className={`flex items-center gap-1 ${active ? "bg-secondary" : "hover:bg-muted/50"}`}
                        role="option"
                        aria-selected={active}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
                          onClick={() => {
                            openBatch(item.id, item);
                            setBatchMenuOpen(false);
                          }}
                        >
                          {batchOptionLabel(item)}
                        </button>
                        {item.saved ? (
                          <button
                            type="button"
                            className="mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                            aria-label={`删除批次 ${item.versionLabel || item.name}`}
                            disabled={!canDelete}
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteSavedBatch(item);
                            }}
                          >
                            <X className="size-4" />
                          </button>
                        ) : null}
                      </li>
                    );
                  })
                )}
              </ul>
            ) : null}
          </div>
          <div ref={resultsRef} id="eval-batch-results" className="scroll-mt-24">
          {batch ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusLabel text={batchStatusLabel(batch.status)} tone={tone(batch.status)} />
                      {batch.status === "running" || batch.status === "queued" ? (
                        <LoaderCircle className="size-4 animate-spin text-amber-800" aria-hidden="true" />
                      ) : null}
                    </span>
                    <StatusLabel
                      text={batch.saved ? "已保存" : batch.saveOnComplete ? "跑完后保存" : "未保存"}
                      tone={batch.saved ? "ok" : batch.saveOnComplete ? "info" : "neutral"}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {batch.versionLabel || batch.name} · {batch.currentIndex}/{batch.total}
                  </p>
                </div>
                {batch.status === "running" || batch.status === "queued" ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${batch.total ? Math.min(100, Math.round((batch.currentIndex / batch.total) * 100)) : 0}%` }}
                    />
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    { label: "通过", value: batch.passed },
                    { label: "未通过", value: batch.failed },
                    { label: "待复核", value: batch.review },
                    { label: "系统错误", value: batch.errors },
                    { label: "通过率", value: formatQualityPassRate(batch.qualityPassRate) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-md bg-background px-2 py-2 text-center">
                      <p className="text-base font-semibold leading-6">{item.value}</p>
                      <p className="text-[11px] text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {batch.judgeEnabled ? "规则 + LLM-as-Judge" : "规则评测，Judge 未启用"} · {batch.provider} / {batch.model}
                  <span className="ml-1">（通过率不含 ERROR，REVIEW 不作 PASS）</span>
                </p>
              </div>
              {batch.errorMessage ? <p className="text-red-800">{batch.errorMessage}</p> : null}
              <JudgeBatchSummary results={batch.caseResults} />
              {batch.caseResults.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-left text-sm">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="pb-2 font-medium">原问题</th>
                        <th className="pb-2 font-medium">关键词命中</th>
                        <th className="pb-2 font-medium">风险</th>
                        <th className="pb-2 font-medium">是否通过</th>
                        <th className="pb-2 font-medium">未通过原因</th>
                        <th className="w-[8.5rem] pb-2 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.caseResults.map((item) => {
                        const open = expandedCaseId === item.caseId;
                        return (
                          <Fragment key={`${item.caseId}-${item.runId || item.status}`}>
                            <tr
                              className={`cursor-pointer border-t border-border ${open ? "bg-secondary" : "hover:bg-muted/50"}`}
                              onClick={() => toggleCase(item)}
                            >
                              <td className="max-w-[16rem] py-2 pr-3 align-top">
                                <span className="line-clamp-2 leading-6">{item.question || item.name}</span>
                              </td>
                              <td className="max-w-[10rem] py-2 pr-3 align-top text-xs">
                                {item.keywordHits.join("、") || "无"}
                              </td>
                              <td className="max-w-[10rem] py-2 pr-3 align-top text-xs">{briefEvalRisk(item)}</td>
                              <td className="py-2 pr-3 align-top">
                                <StatusLabel text={passedLabel(item.status)} tone={tone(item.status)} />
                              </td>
                              <td className="max-w-[14rem] py-2 pr-3 align-top text-xs text-muted-foreground">
                                {briefFailReason(item) ? (
                                  <span className="line-clamp-2 leading-5">{briefFailReason(item)}</span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="py-2 align-top">
                                <div className="flex flex-col gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleCase(item);
                                    }}
                                  >
                                    {open ? "收起" : "展开"}
                                  </Button>
                                  {item.runId && (item.status === "FAIL" || item.status === "REVIEW") ? (
                                    <a
                                      href={`/ops/annotate?run=${encodeURIComponent(item.runId)}`}
                                      className="inline-flex h-8 items-center justify-center rounded-md border border-input px-2 text-xs hover:bg-muted"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      去标注
                                    </a>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                            {open ? (
                              <tr className="border-t border-border bg-muted/20">
                                <td colSpan={6} className="px-3 py-4">
                                  <div className="mb-3 flex items-start justify-between gap-3">
                                    <div>
                                      <p className="font-medium">{item.name}</p>
                                      <p className="text-xs text-muted-foreground">{item.question}</p>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setExpandedCaseId("");
                                      }}
                                    >
                                      收起
                                    </Button>
                                  </div>
                                  <EvalCaseResultDetail
                                      item={item}
                                      batchLabel={batch.versionLabel || batch.name}
                                      run={item.runId ? runById[item.runId] : null}
                                      runPending={Boolean(item.runId) && runLoadingId === item.runId && !(item.runId in runById)}
                                      embedded
                                    />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">点右侧「展开」在下方查看回复、Judge 和 Trace，再点「收起」即可合上。</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">本批还没有用例结果。</p>
              )}
            </div>
          ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>版本对比</CardTitle>
          <CardDescription>
            相同 caseIds、用例快照、评分器和运行条件才能直接比较。skill 变更不阻断对比，但会单独展示 skillVersion / skillHash。分数上涨不足以代表变好。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)}>
              <option value="">baseline</option>
              {savedBatches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.versionLabel || item.name} · {item.id.slice(0, 10)}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={compareTo} onChange={(event) => setCompareTo(event.target.value)}>
              <option value="">candidate</option>
              {savedBatches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.versionLabel || item.name} · {item.id.slice(0, 10)}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              compareAction.run(async () => {
                if (!compareFrom || !compareTo) throw new Error("请选择两个批次");
                const result = await api<{ compare: EvalBatchCompare }>(`/api/eval/compare?from=${compareFrom}&to=${compareTo}`);
                setCompare(result.compare);
                return result.compare.comparable ? "可比较" : "不可直接比较";
              }, "对比失败")
            }
          >
            比较两个批次
          </Button>
          <FeedbackBanner phase={compareAction.phase} message={compareAction.message} />
          {compare ? (
            <div className="space-y-3 text-sm">
              {compare.comparable ? (
                <p>可比较：评分器与运行条件一致</p>
              ) : (
                <p className="text-amber-800">{compare.reasons.join(" ")}</p>
              )}
              <div className={`rounded-md border px-3 py-2 text-xs ${compare.skills.same ? "border-border bg-muted/30" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                <p className="font-medium">技能配置 {compare.skills.same ? "相同" : "不同"}</p>
                <p className="mt-1 break-all">
                  Baseline：{compare.skills.baseline.skillVersion || "（空）"} · hash {shortHash(compare.skills.baseline.skillHash)}
                </p>
                <p className="break-all">
                  Candidate：{compare.skills.candidate.skillVersion || "（空）"} · hash {shortHash(compare.skills.candidate.skillHash)}
                </p>
                {(compare.notes ?? []).map((note) => (
                  <p key={note} className="mt-1">
                    {note}
                  </p>
                ))}
              </div>
              <p>
                通过率 {formatQualityPassRate(compare.counts.baseline.qualityPassRate)} →{" "}
                {formatQualityPassRate(compare.counts.candidate.qualityPassRate)} · 状态{" "}
                {compare.counts.baseline.passed}/{compare.counts.baseline.failed}/{compare.counts.baseline.review}/
                {compare.counts.baseline.errors} → {compare.counts.candidate.passed}/{compare.counts.candidate.failed}/
                {compare.counts.candidate.review}/{compare.counts.candidate.errors}
              </p>
              <p className="text-xs">
                Provider {compare.conditions.providerSame ? "一致" : "不同"} · 模型 {compare.conditions.modelSame ? "一致" : "不同"} ·
                参数 {compare.conditions.paramsSame ? "一致" : "不同"} · 评分器 {compare.conditions.evaluatorSame ? "一致" : "不同"} ·
                Skill {compare.conditions.skillSame ? "一致" : "不同"}
              </p>
              <p className="text-xs">
                平均耗时 {compare.avgDurationMs.baseline}ms → {compare.avgDurationMs.candidate}ms（{compare.avgDurationMs.delta}）
              </p>
              {compare.comparable ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="font-medium">已修复（{compare.fixed.length}）</p>
                    {compare.fixed.length ? (
                      compare.fixed.map((item) => (
                        <CompareCaseReplyCard
                          key={`fixed-${item.caseId}`}
                          title={item.name}
                          statusLine={`${item.from} → ${item.to}`}
                          baselineReply={item.baselineReply}
                          candidateReply={item.candidateReply}
                        />
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">无</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">新增失败 / 回归（{compare.newFailures.length}）</p>
                    {compare.newFailures.length ? (
                      compare.newFailures.map((item) => (
                        <CompareCaseReplyCard
                          key={`fail-${item.caseId}`}
                          title={item.name}
                          statusLine={`${item.from} → ${item.to}`}
                          baselineReply={item.baselineReply}
                          candidateReply={item.candidateReply}
                        />
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">无</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">状态不变但回复改变（{compare.replyChangedSameStatus.length}）</p>
                    {compare.replyChangedSameStatus.length ? (
                      compare.replyChangedSameStatus.map((item) => (
                        <CompareCaseReplyCard
                          key={`reply-${item.caseId}`}
                          title={item.name}
                          statusLine={`状态仍为 ${item.status}`}
                          baselineReply={item.baselineReply}
                          candidateReply={item.candidateReply}
                        />
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">无</p>
                    )}
                  </div>
                </div>
              ) : (
                <p>因不可直接比较，不展示“已修复 / 版本变好”。</p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
