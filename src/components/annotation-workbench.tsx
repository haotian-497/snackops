"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { FeedbackBanner } from "@/components/feedback-banner";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/hooks/use-action-state";
import { JUDGE_DIMENSIONS } from "@/lib/eval/judge-dimensions";
import { formatJudgeScore, toJudgeFive } from "@/lib/eval/judge-scale";
import {
  ANNOTATION_LABELS,
  annotationLabelTitle,
  defaultLabelForSeverity,
  isKnownAnnotationLabel,
} from "@/lib/ops/annotation-labels";
import {
  annotationScoresFromJudge,
  annotationStats,
  BAD_CASE_SEVERITY_LABEL,
  isNeedsReview,
  isRunUnmarked,
  latestAnnotationByRun,
  type AnnotationQueueItem,
} from "@/lib/ops/annotation-queue";
import { cn } from "@/lib/utils";
import type { Annotation, AnnotationScores, AnnotationStatus } from "@/lib/types";

type ApiOk<T> = { ok?: boolean; message?: string } & T;
type ScoreForm = Record<(typeof JUDGE_DIMENSIONS)[number]["key"], string>;
type ListFilter = "unmarked" | "review" | "marked" | "all" | "P0" | "P1" | "P2";

const selectClass =
  "mt-1 h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const GOLD_HINTS = [
  {
    id: "refuse-claim",
    label: "补拒绝话术",
    apply: (current: string) =>
      `${current.trim() ? `${current.trim()}\n\n` : ""}抱歉，该商品不能宣称具有治疗或保健功效，请以包装与说明书信息为准。`,
  },
  {
    id: "no-transfer",
    label: "补防诈提醒",
    apply: (current: string) =>
      `${current.trim() ? `${current.trim()}\n\n` : ""}请勿向陌生人转账或提供验证码，如遇可疑中奖信息请及时联系官方客服核实。`,
  },
  {
    id: "clarify",
    label: "补澄清追问",
    apply: (current: string) =>
      `${current.trim() ? `${current.trim()}\n\n` : ""}为了更准确帮您，请补充一下具体商品名称、购买时间或您遇到的问题细节。`,
  },
] as const;

async function api<T>(url: string, init?: RequestInit): Promise<ApiOk<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await response.json()) as ApiOk<T>;
  if (!response.ok || json.ok === false) throw new Error(json.message || "请求失败");
  return json;
}

function emptyScores(): ScoreForm {
  return {
    correctness: "",
    relevance: "",
    completeness: "",
    safety: "",
    tone: "",
    overall: "",
  };
}

function scoresToForm(scores?: AnnotationScores): ScoreForm {
  const next = emptyScores();
  for (const item of JUDGE_DIMENSIONS) {
    const value = scores?.[item.key];
    next[item.key] = typeof value === "number" ? String(value) : "";
  }
  return next;
}

function formToScores(form: ScoreForm): AnnotationScores | undefined {
  const scores: AnnotationScores = {};
  for (const item of JUDGE_DIMENSIONS) {
    const raw = form[item.key].trim();
    if (!raw) continue;
    const number = Number(raw);
    if (!Number.isFinite(number)) continue;
    scores[item.key] = number;
  }
  return Object.keys(scores).length ? scores : undefined;
}

function queueItemBadge(annotation?: Annotation) {
  if (isRunUnmarked(annotation)) return { text: "未标注", tone: "warn" as const };
  if (isNeedsReview(annotation)) return { text: "待二审", tone: "warn" as const };
  if (annotation?.status === "accepted") return { text: "已通过", tone: "ok" as const };
  if (annotation?.status === "rejected") return { text: "已拒绝", tone: "danger" as const };
  return { text: "已标记", tone: "neutral" as const };
}

export function AnnotationWorkbench({
  queue,
  initialAnnotations,
  initialRunId,
}: {
  queue: AnnotationQueueItem[];
  initialAnnotations: Annotation[];
  initialRunId?: string;
}) {
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const [listFilter, setListFilter] = useState<ListFilter>("unmarked");
  const [createdBy, setCreatedBy] = useState("运营");
  const [label, setLabel] = useState("bad_case");
  const [note, setNote] = useState("");
  const [goldReply, setGoldReply] = useState("");
  const [scores, setScores] = useState(emptyScores);
  const [promoteImprovement, setPromoteImprovement] = useState(false);
  const [promoteEval, setPromoteEval] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const saveAction = useActionFeedback();
  const extraAction = useActionFeedback();

  const latest = useMemo(() => latestAnnotationByRun(annotations), [annotations]);
  const stats = useMemo(() => annotationStats(queue, annotations), [annotations, queue]);

  const visible = useMemo(() => {
    return queue.filter((item) => {
      const annotation = latest[item.runId];
      if (listFilter === "unmarked") return isRunUnmarked(annotation);
      if (listFilter === "review") return isNeedsReview(annotation);
      if (listFilter === "marked") return Boolean(annotation);
      if (listFilter === "P0" || listFilter === "P1" || listFilter === "P2") return item.priority === listFilter;
      return true;
    });
  }, [latest, listFilter, queue]);

  const defaultRunId =
    initialRunId && queue.some((item) => item.runId === initialRunId)
      ? initialRunId
      : visible[0]?.runId || queue[0]?.runId || "";
  const [runId, setRunId] = useState(defaultRunId);
  const selected = queue.find((item) => item.runId === runId) ?? visible[0];
  const currentAnnotation = selected ? latest[selected.runId] : undefined;
  const humanScores = formToScores(scores);
  const verdictTitle = annotationLabelTitle(label);

  useEffect(() => {
    if (!selected) return;
    fillForm(selected, latest[selected.runId]);
    setEvidenceOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.runId]);

  function fillForm(item: AnnotationQueueItem, annotation?: Annotation) {
    setRunId(item.runId);
    setLabel(annotation?.label && isKnownAnnotationLabel(annotation.label) ? annotation.label : defaultLabelForSeverity(item.severity));
    setNote(annotation?.note || "");
    setGoldReply(annotation?.goldReply || "");
    setCreatedBy(annotation?.createdBy || "运营");
    const hasHumanScores = Boolean(annotation?.scores && Object.keys(annotation.scores).length > 0);
    const seedScores = hasHumanScores ? annotation?.scores : annotationScoresFromJudge(item.judgeDimensions);
    setScores(scoresToForm(seedScores));
    setPromoteImprovement(false);
    setPromoteEval(false);
  }

  function selectCase(item: AnnotationQueueItem) {
    fillForm(item, latest[item.runId]);
  }

  function setScoreValue(key: (typeof JUDGE_DIMENSIONS)[number]["key"], value: number) {
    setScores((current) => ({ ...current, [key]: String(value) }));
  }

  async function saveWithStatus(nextStatus: AnnotationStatus, advance: boolean) {
    if (!selected) throw new Error("请先选择一条 Bad Case");
    const promote: Array<"improvement" | "eval"> = [];
    if (nextStatus === "accepted") {
      if (promoteImprovement) promote.push("improvement");
      if (promoteEval) promote.push("eval");
    }
    const payload = {
      runId: selected.runId,
      label: label.trim() || "bad_case",
      note,
      goldReply,
      createdBy,
      status: nextStatus,
      scores: formToScores(scores),
      promote,
    };
    const result = currentAnnotation
      ? await api<{ annotation: Annotation; improvementId?: string; evalCaseId?: string }>(
          `/api/annotations/${currentAnnotation.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        )
      : await api<{ annotation: Annotation; improvementId?: string; evalCaseId?: string }>("/api/annotations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
    const saved = result.annotation;
    if (!saved) throw new Error("未返回标注");
    const nextAnnotations = [saved, ...annotations.filter((item) => item.id !== saved.id)];
    setAnnotations(nextAnnotations);
    toast.success(result.message || "已保存标注");
    if (result.improvementId) {
      toast.message("已转入改进建议", {
        description: "可按用户问题在改进列表里认出来",
        action: {
          label: "去看这条",
          onClick: () => {
            window.location.href = `/ops/improvements?id=${result.improvementId}`;
          },
        },
      });
    }
    if (result.evalCaseId) {
      toast.message(`已转入测评集：${result.evalCaseId}`);
    }
    if (advance) {
      const nextLatest = latestAnnotationByRun(nextAnnotations);
      const next = queue.find((item) => item.runId !== selected.runId && isRunUnmarked(nextLatest[item.runId]));
      if (next) fillForm(next, nextLatest[next.runId]);
    }
    return result.message || "已保存标注";
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>标注监控</CardTitle>
            <CardDescription className="mt-1.5">
              左窄队列，右侧单列：上证据、下判定。未标注 ≠ 待二审。
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              extraAction.run(async () => {
                const response = await fetch("/api/annotations/export");
                if (!response.ok) throw new Error("导出失败");
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "annotations.csv";
                link.click();
                URL.revokeObjectURL(url);
                return "已导出 annotations.csv";
              }, "导出失败")
            }
          >
            导出 CSV
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <Metric label="Bad Case" value={String(stats.queueTotal)} />
          <Metric label="P0 安全" value={String(stats.byPriority.P0)} />
          <Metric label="P1 质量" value={String(stats.byPriority.P1)} />
          <Metric label="P2 复核" value={String(stats.byPriority.P2)} />
          <Metric label="未标注" value={String(stats.unmarked)} />
          <Metric label="待二审" value={String(stats.pendingReview)} />
          <Metric label="标记通过率" value={stats.decided ? `${stats.passRate}%` : "—"} />
        </CardContent>
        <FeedbackBanner phase={extraAction.phase} message={extraAction.message} />
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)]">
        <Card className="lg:max-h-[calc(100vh-15rem)] lg:overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">队列</CardTitle>
            <CardDescription>
              {listFilter === "unmarked"
                ? `未标注 ${visible.length}`
                : listFilter === "review"
                  ? `待二审 ${visible.length}`
                  : `${visible.length} 条`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 lg:max-h-[calc(100vh-21rem)] lg:overflow-y-auto">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: "unmarked", label: "未标注" },
                  { id: "review", label: "待二审" },
                  { id: "marked", label: "已标记" },
                  { id: "P0", label: "P0" },
                  { id: "P1", label: "P1" },
                  { id: "P2", label: "P2" },
                  { id: "all", label: "全部" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "rounded-md px-2 py-1 text-xs",
                    listFilter === item.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                  onClick={() => setListFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <EmptyState title="没有 Bad Case" description="跑测评或记低分后会出现在这里。" />
            ) : (
              <ul className="space-y-2">
                {visible.map((item) => {
                  const annotation = latest[item.runId];
                  const badge = queueItemBadge(annotation);
                  return (
                    <li key={item.runId}>
                      <button
                        type="button"
                        onClick={() => selectCase(item)}
                        className={cn(
                          "w-full rounded-md border border-border p-2.5 text-left text-sm",
                          selected?.runId === item.runId ? "bg-secondary" : "hover:bg-muted",
                        )}
                      >
                        <span className="line-clamp-2 font-medium leading-5">{item.question || item.runId}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <StatusLabel
                            text={item.priority}
                            tone={item.priority === "P0" ? "danger" : item.priority === "P1" ? "warn" : "info"}
                          />
                          <StatusLabel text={badge.text} tone={badge.tone} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {!selected ? (
          <Card>
            <CardContent className="py-10">
              <EmptyState title="请选择左侧一条 Bad Case" description="或先跑测评 / 记录低分评分以产生队列。" />
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
            <CardHeader>
              <CardTitle className="text-base">标注详情</CardTitle>
              <CardDescription>上证据、下判定：先看清问题与回复，再写金标并处置。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{selected.runId}</span>
                <span>
                  {selected.provider || "provider?"} / {selected.model || "model?"}
                </span>
                <span>测评 {selected.evalStatus || "—"}</span>
                <span>运行 {selected.runStatus}</span>
                {(selected.skillPins.length ? selected.skillPins : selected.selectedSkills).length ? (
                  <span className="truncate">
                    Skill {(selected.skillPins.length ? selected.skillPins : selected.selectedSkills).slice(0, 3).join(" · ")}
                  </span>
                ) : null}
                <Link href={`/runs/${selected.runId}` as "/"} className="underline">
                  运行详情
                </Link>
              </div>

              <section>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">1. 入库原因</p>
                <div
                  className={cn(
                    "rounded-md border p-4",
                    selected.priority === "P0" ? "border-red-200 bg-red-50/60" : "border-border bg-muted/20",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusLabel
                      text={`${selected.priority} ${BAD_CASE_SEVERITY_LABEL[selected.severity]}`}
                      tone={selected.priority === "P0" ? "danger" : selected.priority === "P1" ? "warn" : "info"}
                    />
                    <StatusLabel text={selected.qualityLabel} tone="neutral" />
                  </div>
                  <p className="mt-3 text-sm font-medium leading-6">{selected.primaryReason}</p>
                  <p className="mt-2 text-sm text-muted-foreground leading-6">证据：{selected.evidence}</p>
                  {selected.reasons.length > 1 ? (
                    <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                      {selected.reasons
                        .filter((reason) => reason !== selected.primaryReason)
                        .map((reason) => (
                          <li key={reason}>· {reason}</li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">2. 用户问题</p>
                <ReadPanel title="" maxHeightClass="max-h-48" minHeightClass="min-h-24">
                  {selected.question || "无"}
                </ReadPanel>
              </section>

              <section className="space-y-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">3. 模型回复</p>
                <ReadPanel title="" muted={!selected.reply} maxHeightClass="max-h-[36rem]" minHeightClass="min-h-56">
                  {selected.reply || "空回复"}
                </ReadPanel>
              </section>

              <details
                className="rounded-md border border-border"
                open={evidenceOpen}
                onToggle={(event) => setEvidenceOpen((event.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium">
                  系统证据（规则命中 / Skill 路径，默认收起）
                </summary>
                <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
                  <EvidenceRow label="关键词命中" value={selected.keywordHits.join("、") || "无"} />
                  <EvidenceRow label="关键词缺失" value={selected.keywordMisses.join("、") || "无"} />
                  <EvidenceRow label="禁词" value={selected.forbiddenHits.join("、") || "无"} />
                  <EvidenceRow label="价格核验" value={selected.priceMiss ? "存在未核验/缺失价格信号" : "无明显价格问题"} />
                  <EvidenceRow label="风险问题" value={selected.riskIssues.join("、") || "无"} />
                  <EvidenceRow
                    label="输入风险 / 风控"
                    value={`${selected.riskLevel === "none" ? "未评估" : selected.riskLevel} / ${
                      selected.riskVerdict === "none" ? "无" : selected.riskVerdict
                    }`}
                  />
                  <EvidenceRow label="触发规则" value={selected.riskRules.join("、") || "无"} />
                  <EvidenceRow label="计划 Skills" value={selected.selectedSkills.join("、") || "无"} />
                  <EvidenceRow label="Tools" value={selected.selectedTools.join("、") || "无"} />
                  <EvidenceRow label="Skill pins" value={selected.skillPins.join("、") || "无"} />
                  <EvidenceRow label="执行路径" value={selected.stepPath.length ? selected.stepPath.join(" → ") : "无"} />
                  {selected.evidenceLines.length ? (
                    <div>
                      <p className="mb-1 text-muted-foreground">测评 evidence</p>
                      <ul className="max-h-40 space-y-1 overflow-auto rounded-md bg-muted/40 p-3">
                        {selected.evidenceLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </details>

              <div className="border-t border-border pt-5">
                <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">4. 判定</p>
                <div className="space-y-4">
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
                    <p className="text-xs text-muted-foreground">判定结论</p>
                    <p className="mt-1 text-sm font-medium">
                      {verdictTitle}
                      {humanScores?.overall != null ? ` · 整体 ${humanScores.overall}/5` : ""}
                    </p>
                    <label className="mt-3 block text-xs text-muted-foreground">
                      错误类型
                      <select className={selectClass} value={label} onChange={(event) => setLabel(event.target.value)}>
                        {ANNOTATION_LABELS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                        {!isKnownAnnotationLabel(label) ? <option value={label}>{label}（历史）</option> : null}
                      </select>
                    </label>
                  </div>

                  <div className="rounded-md border border-foreground/15 bg-card p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">5. 金标回复</p>
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => setGoldReply(selected.reply)}>
                          复制模型回复
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setGoldReply("")}>
                          清空
                        </Button>
                        {GOLD_HINTS.map((hint) => (
                          <Button
                            key={hint.id}
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setGoldReply(hint.apply(goldReply))}
                          >
                            {hint.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <Textarea
                      className="min-h-48 text-sm leading-6"
                      value={goldReply}
                      onChange={(event) => setGoldReply(event.target.value)}
                      placeholder="写下你认为合格的客服回复"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">6. 六维打分</p>
                    <DimensionScoreRows
                      judge={selected.judgeDimensions}
                      form={scores}
                      onChange={setScoreValue}
                      seeded={!currentAnnotation && Boolean(selected.judgeDimensions)}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                    <label className="block text-xs text-muted-foreground">
                      备注 / 判定说明
                      <Textarea
                        className="mt-1 min-h-20"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="例如：应先拒功效宣称，再给购买建议"
                      />
                    </label>
                    <label className="block text-xs text-muted-foreground">
                      标注人
                      <Input className="mt-1" value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 space-y-3 rounded-md border border-border bg-background/95 p-4 backdrop-blur">
                <p className="text-sm font-medium">7. 处置</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={promoteImprovement}
                      onChange={(event) => setPromoteImprovement(event.target.checked)}
                    />
                    通过时转入改进建议
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={promoteEval}
                      onChange={(event) => setPromoteEval(event.target.checked)}
                    />
                    通过时转入测评集
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => saveAction.run(() => saveWithStatus("accepted", true), "保存失败")}>
                    通过并下一条
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => saveAction.run(() => saveWithStatus("pending", false), "保存失败")}
                  >
                    送二审
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => saveAction.run(() => saveWithStatus("rejected", true), "保存失败")}
                  >
                    拒绝
                  </Button>
                </div>
                <FeedbackBanner phase={saveAction.phase} message={saveAction.message} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DimensionScoreRows({
  judge,
  form,
  onChange,
  seeded,
}: {
  judge?: AnnotationScores;
  form: ScoreForm;
  onChange: (key: (typeof JUDGE_DIMENSIONS)[number]["key"], value: number) => void;
  seeded: boolean;
}) {
  const hasJudge = Boolean(judge && Object.values(judge).some((value) => typeof value === "number"));

  return (
    <section className="rounded-md border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">六维打分（人工与 Judge 同行）</p>
        {seeded ? <p className="text-xs text-muted-foreground">已用 Judge 预填，可改</p> : null}
      </div>
      {!hasJudge ? (
        <p className="mb-2 text-xs text-muted-foreground">暂无 Judge 分，仅人工打分。</p>
      ) : null}
      <div className="space-y-2">
        {JUDGE_DIMENSIONS.map((item) => {
          const j = judge?.[item.key];
          const jFive = typeof j === "number" ? toJudgeFive(j) : undefined;
          const humanRaw = form[item.key].trim();
          const human = humanRaw ? Number(humanRaw) : undefined;
          const delta =
            typeof jFive === "number" && typeof human === "number" && Number.isFinite(human) ? human - jFive : undefined;
          return (
            <div key={item.key} className="grid gap-2 rounded-md border border-border/70 px-2 py-2 sm:grid-cols-[5.5rem_4.5rem_1fr_3rem]">
              <p className="text-xs font-medium leading-8">{item.name}</p>
              <p className="text-xs leading-8 text-muted-foreground">
                J {typeof j === "number" ? formatJudgeScore(j) : "—"}
              </p>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "h-8 w-8 rounded-md border text-xs",
                      human === value ? "border-foreground bg-secondary font-medium" : "border-border hover:bg-muted",
                    )}
                    onClick={() => onChange(item.key, value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <p
                className={cn(
                  "text-xs leading-8",
                  typeof delta === "number" && Math.abs(delta) >= 2 ? "font-medium text-amber-800" : "text-muted-foreground",
                )}
              >
                {typeof delta === "number" ? (delta > 0 ? `+${delta}` : String(delta)) : "—"}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">差值 = 人工 − Judge（折到 1–5）。差 ≥2 适合用来校准 Judge。</p>
    </section>
  );
}

function ReadPanel({
  title,
  children,
  muted = false,
  maxHeightClass = "max-h-56",
  minHeightClass = "",
}: {
  title: string;
  children: ReactNode;
  muted?: boolean;
  maxHeightClass?: string;
  minHeightClass?: string;
}) {
  return (
    <section className="rounded-md border border-border p-3">
      {title ? <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p> : null}
      <div
        className={cn(
          "overflow-auto rounded-md bg-muted/30 p-4 text-sm leading-6 whitespace-pre-wrap break-words",
          maxHeightClass,
          minHeightClass,
          muted && "text-muted-foreground",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[6.5rem_1fr]">
      <p className="text-muted-foreground">{label}</p>
      <p className="break-words text-foreground">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
