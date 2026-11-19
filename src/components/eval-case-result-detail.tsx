import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { JudgeChart } from "@/components/judge-chart";
import { RunTrace } from "@/components/run-trace";
import { StatusLabel } from "@/components/status-label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvalCaseResult, EvalScoreStatus, RunRecord } from "@/lib/types";

export function evalStatusTone(status: string) {
  if (status === "PASS" || status === "done") return "ok" as const;
  if (status === "REVIEW" || status === "running" || status === "queued") return "warn" as const;
  if (status === "ERROR" || status === "error" || status === "cancelled") return "info" as const;
  return "danger" as const;
}

export function briefEvalRisk(item: EvalCaseResult) {
  if (item.riskIssues.length) return item.riskIssues.join("；");
  const bits: string[] = [];
  if (item.inputRisk) bits.push("用户有风险意图");
  if (!item.replySafe) bits.push("回复不安全");
  return bits.join("；") || "无";
}

export function briefFailReason(item: EvalCaseResult) {
  if (item.status === "PASS") return "";
  return item.reason || "未通过";
}

export function EvalCaseResultDetail({
  item,
  batchLabel,
  run,
  embedded = false,
  runPending = false,
}: {
  item: EvalCaseResult;
  batchLabel?: string;
  run?: RunRecord | null;
  embedded?: boolean;
  runPending?: boolean;
}) {
  const body = (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">用户问题</p>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words leading-6">
            {item.question || "（无问题）"}
          </p>
        </div>
        <div className="min-w-0 rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">真实回复</p>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words leading-6">
            {item.finalReply || "（无回复）"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">规则 / 综合判定</span>
        <StatusLabel text={item.status} tone={evalStatusTone(item.status)} />
        {item.judge?.status === "ok" ? (
          <span className="text-xs text-muted-foreground">
            Judge 总分 {item.judge.overall}/5
            {item.judge.verdict ? ` · ${item.judge.verdict}` : ""}
          </span>
        ) : null}
      </div>
      <p>{item.reason}</p>
      <div className="grid gap-1">
        <p className="text-xs break-words">
          <span className="text-muted-foreground">命中：</span>
          {item.keywordHits.join("、") || "无"}
        </p>
        <p className="text-xs break-words">
          <span className="text-muted-foreground">缺失：</span>
          {item.keywordMisses.join("、") || "无"}
        </p>
        <p className="text-xs break-words">
          <span className="text-muted-foreground">禁词：</span>
          {item.forbiddenHits.join("、") || "无"}
        </p>
      </div>
      <p className="text-xs">
        价格期望 {item.expectedPrice ?? "无"} / 识别 {item.mentionedPrice.join("、") || "无"}
      </p>
      <p className="text-xs">风险：{briefEvalRisk(item)}</p>
      <JudgeChart judge={item.judge} />
      <p className="text-xs">
        {item.durationMs}ms
        {item.runId ? ` · runId ${item.runId}` : null}
        {item.runId && (item.status === "FAIL" || item.status === "REVIEW") ? (
          <>
            {" · "}
            <Link
              href={`/ops/annotate?run=${encodeURIComponent(item.runId)}` as "/ops/annotate"}
              className="underline"
              onClick={(event) => event.stopPropagation()}
            >
              去标注
            </Link>
          </>
        ) : null}
      </p>
      <div>
        <p className="mb-1 text-sm font-medium">执行链路 Trace</p>
        <p className="mb-2 text-xs text-muted-foreground">按规划、计划校验、Executor 执行、风险收尾分组，可展开每步输入和结果</p>
        {run ? (
          <RunTrace steps={run.steps} plan={run.plan} error={run.error} />
        ) : runPending ? (
          <p className="text-xs text-muted-foreground">正在加载 Trace…</p>
        ) : (
          <EmptyState title="没有可展示的 Trace" description="本条没有关联 RunRecord，或运行记录已被清理。" />
        )}
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {item.name}
            <StatusLabel text={item.status} tone={evalStatusTone(item.status)} />
          </CardTitle>
          <CardDescription>{batchLabel ? `${batchLabel} · ${item.caseId}` : item.caseId}</CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
}

export function passedLabel(status: EvalScoreStatus) {
  if (status === "PASS") return "通过";
  if (status === "REVIEW") return "待复核";
  if (status === "ERROR") return "系统错误";
  return "未通过";
}
