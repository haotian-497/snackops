"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ExecutionTimeline } from "@/components/agent/execution-timeline";
import { PlanRiskSummary } from "@/components/agent/plan-risk-summary";
import { FeedbackBanner } from "@/components/feedback-banner";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/hooks/use-action-state";
import { failedStepSummary, runStepDomId } from "@/lib/agent/risk-labels";
import { runStatusLabel } from "@/lib/labels";
import type { RunHubBundle } from "@/lib/ops/run-hub";
import type { Annotation, Rating, RunRecord } from "@/lib/types";

export function RunDetail({
  hub,
  fromRating = false,
  focusRatingId,
}: {
  hub: RunHubBundle;
  fromRating?: boolean;
  focusRatingId?: string;
}) {
  const [run, setRun] = useState(hub.run);
  const [annotations, setAnnotations] = useState(hub.annotations);
  const [ratings, setRatings] = useState(hub.ratings);
  const [disposition, setDisposition] = useState(hub.disposition);
  const [label, setLabel] = useState("review");
  const [note, setNote] = useState("");
  const [score, setScore] = useState("2");
  const [ratingComment, setRatingComment] = useState("");
  const [explanation, setExplanation] = useState("");
  const retryAction = useActionFeedback();
  const handoffAction = useActionFeedback();
  const annotateAction = useActionFeedback();
  const ratingAction = useActionFeedback();
  const explainAction = useActionFeedback();
  const evalAction = useActionFeedback();

  const replayHref = `/?q=${encodeURIComponent(run.question)}` as "/";
  const doneCount = disposition.filter((item) => item.done).length;

  const [highlightStepId, setHighlightStepId] = useState<string | null>(null);

  const focusRating = useMemo(() => {
    if (!fromRating && !focusRatingId) return null;
    if (focusRatingId) {
      const matched = ratings.find((item) => item.id === focusRatingId);
      if (matched) return matched;
    }
    return ratings[0] ?? null;
  }, [focusRatingId, fromRating, ratings]);

  const failedSteps = useMemo(() => failedStepSummary(run.steps), [run.steps]);
  const canLocateFailure = run.status === "failed" || failedSteps.length > 0;

  const locateFailure = useCallback(
    (stepId?: string) => {
      const targetId = stepId || failedSteps[0]?.stepId;
      if (!targetId) {
        toast.message("没有可定位的失败步骤");
        return;
      }
      setHighlightStepId(targetId);
      const el = document.getElementById(runStepDomId(targetId));
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        document.getElementById("run-execution-timeline")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [failedSteps],
  );

  function markDisposition(id: RunHubBundle["disposition"][number]["id"], detail: string) {
    setDisposition((current) =>
      current.map((item) => (item.id === id ? { ...item, done: true, detail } : item)),
    );
  }

  return (
    <div className="space-y-3">
      {fromRating ? <RatingFocusCard rating={focusRating} run={run} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {run.id}
            <StatusLabel
              text={runStatusLabel[run.status]}
              tone={run.status === "succeeded" ? "ok" : run.status === "failed" ? "danger" : "warn"}
            />
          </CardTitle>
          <CardDescription>
            {run.provider} · {run.model} · {run.durationMs}ms · 来源 {run.source}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!fromRating ? <p className="font-medium leading-6">{run.question}</p> : null}
          {run.error ? <p className="text-red-800">{run.error}</p> : null}
          <p className="text-xs text-muted-foreground">
            {fromRating ? (
              <>
                上方是<strong>本次服务评价</strong>；本区为 Run 档案与处置入口。完整 Plan/执行路径请到工作台。
              </>
            ) : (
              <>
                本页是<strong>档案与处置中枢</strong>：看下游关联、走运营动作。完整 Plan/执行路径请到工作台。
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {fromRating ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={"/ops/ratings" as "/"}>回服务评价</Link>
              </Button>
            ) : null}
            {canLocateFailure ? (
              <Button type="button" size="sm" variant="destructive" onClick={() => locateFailure()}>
                定位到失败位置
                {failedSteps.length > 1 ? `（${failedSteps.length}）` : ""}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href={replayHref}>在工作台重放 / 看完整链路</Link>
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href={"/help/risk-rules" as "/"}>规则手册</Link>
            </Button>
          </div>
          {canLocateFailure && failedSteps.length > 1 ? (
            <ul className="space-y-1 rounded-md border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-950">
              {failedSteps.map((item) => (
                <li key={item.stepId} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {item.name}：{item.error}
                  </span>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => locateFailure(item.stepId)}>
                    定位此处
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <PlanRiskSummary
        plan={run.plan}
        validation={run.validation ?? null}
        riskResult={run.riskResult}
        finalReply={run.finalReply || ""}
        runId={run.id}
        steps={run.steps}
        showRunDetailLink={false}
        onLocateFailedStep={canLocateFailure ? locateFailure : undefined}
      />

      {(canLocateFailure || run.steps.length > 0) && (
        <ExecutionTimeline
          steps={run.steps}
          highlightStepId={highlightStepId}
          title="执行路径"
          description="本 Run 逐步执行记录；失败步骤可从上方「定位到失败位置」跳转"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>运行操作</CardTitle>
          <CardDescription>
            重试 Agent、转人工、解读风险文案、写入测评集
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                retryAction.run(async () => {
                  const response = await fetch("/api/run/retry", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ runId: run.id }),
                  });
                  const json = (await response.json()) as { ok?: boolean; message?: string; run?: RunRecord };
                  if (!response.ok || !json.run) throw new Error(json.message || "重试失败");
                  setRun(json.run);
                  toast.success(json.message || "已重试");
                  return json.message || "已重试";
                }, "重试失败")
              }
            >
              重试
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                handoffAction.run(async () => {
                  const response = await fetch(`/api/runs/${run.id}/handoff`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason: "运营手动接管" }),
                  });
                  const json = (await response.json()) as { ok?: boolean; message?: string; run?: RunRecord };
                  if (!response.ok || !json.run) throw new Error(json.message || "接管失败");
                  setRun(json.run);
                  return json.message || "已接管";
                }, "接管失败")
              }
            >
              人工接管
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                explainAction.run(async () => {
                  const response = await fetch("/api/explain", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ runId: run.id, focus: "risk" }),
                  });
                  const json = (await response.json()) as { ok?: boolean; message?: string; explanation?: string };
                  if (!response.ok || !json.explanation) throw new Error(json.message || "解释失败");
                  setExplanation(json.explanation);
                  return "已生成解释";
                }, "解释失败")
              }
            >
              解释风险
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                evalAction.run(async () => {
                  const response = await fetch("/api/eval/cases", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sourceRunId: run.id, name: `来自 ${run.id}` }),
                  });
                  const json = (await response.json()) as {
                    ok?: boolean;
                    message?: string;
                    case?: { id: string; name?: string };
                  };
                  if (!response.ok || json.ok === false) throw new Error(json.message || "转入失败");
                  markDisposition("eval_case", json.case?.name || json.case?.id || "已写入测评集");
                  toast.success(json.message || "已写入测评集");
                  return `${json.message || "已写入测评集"} ${json.case?.id ?? ""}`.trim();
                }, "转入测评集失败")
              }
            >
              加入测评集
            </Button>
          </div>
          <FeedbackBanner phase={retryAction.phase} message={retryAction.message} />
          <FeedbackBanner phase={handoffAction.phase} message={handoffAction.message} />
          <FeedbackBanner phase={explainAction.phase} message={explainAction.message} />
          <FeedbackBanner phase={evalAction.phase} message={evalAction.message} />
          {explanation ? (
            <pre className="overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap">
              {explanation}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>下游业务进度</CardTitle>
          <CardDescription>
            本 Run 在评分 / 标注 / 改进 / 测评 / A/B 等业务模块里做到哪一步（{doneCount}/{disposition.length}）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 sm:grid-cols-5">
            {disposition.map((step, index) => (
              <li key={step.id} className="rounded-md border border-border bg-card p-2.5 text-sm">
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className="text-xs text-muted-foreground">{index + 1}</span>
                  <StatusLabel text={step.done ? "已完成" : "未做"} tone={step.done ? "ok" : "neutral"} />
                </div>
                <p className="font-medium">{step.label}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{step.detail}</p>
                <Link className="mt-2 inline-block text-xs underline" href={step.href as "/"}>
                  打开
                </Link>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>关联图谱</CardTitle>
          <CardDescription>这条 Run 牵出的评分、标注、改进、测评与 A/B</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
          <RelationBlock
            title="评分"
            empty="暂无评分"
            items={ratings.map((item) => ({
              key: item.id,
              primary: `${item.score} 分 · ${item.channel}`,
              secondary: item.comment || item.createdAt,
              href: "/ops/ratings",
            }))}
          />
          <RelationBlock
            title="标注"
            empty="暂无标注"
            items={annotations.map((item) => ({
              key: item.id,
              primary: item.label,
              secondary: item.note,
              href: `/ops/annotate?run=${encodeURIComponent(run.id)}`,
            }))}
          />
          <RelationBlock
            title="改进单"
            empty="未挂入改进建议"
            items={hub.improvements.map((item) => ({
              key: item.id,
              primary: item.title,
              secondary: `${item.status}${item.diagnosis?.summary ? ` · ${item.diagnosis.summary}` : ""}`,
              href: `/ops/improvements?id=${encodeURIComponent(item.id)}`,
            }))}
          />
          <RelationBlock
            title="测评用例"
            empty="尚未转入测评集"
            items={hub.evalCases.map((item) => ({
              key: item.id,
              primary: item.name || item.id,
              secondary: item.id,
              href: "/ops/center",
            }))}
          />
          <RelationBlock
            title="Prompt A/B"
            empty="未关联实验"
            items={hub.promptAbs.map((item) => ({
              key: item.id,
              primary: item.name,
              secondary: item.status,
              href: `/ops/prompt-ab?id=${encodeURIComponent(item.id)}`,
            }))}
          />
          <RelationBlock
            title="相关 Run"
            empty="无同会话/同问题的其他 Run"
            items={hub.relatedRuns.map((item) => ({
              key: item.id,
              primary: item.id,
              secondary: `${runStatusLabel[item.status]} · ${(item.finalReply || "").slice(0, 48)}`,
              href: `/runs/${item.id}`,
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>服务评分</CardTitle>
            <CardDescription>
              给这次客服回复打 1–5 分并写备注；会进入运营「服务评价」，低分可触发改进建议
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input type="number" min={1} max={5} value={score} onChange={(event) => setScore(event.target.value)} />
            <Textarea
              value={ratingComment}
              onChange={(event) => setRatingComment(event.target.value)}
              className="min-h-16"
              placeholder="评分备注（可选）"
            />
            <Button
              type="button"
              onClick={() =>
                ratingAction.run(async () => {
                  const response = await fetch("/api/ratings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      runId: run.id,
                      score: Number(score),
                      comment: ratingComment,
                      channel: "ops",
                      createdBy: "运营",
                    }),
                  });
                  const json = (await response.json()) as { ok?: boolean; message?: string; rating?: (typeof ratings)[number] };
                  if (!response.ok || json.ok === false) throw new Error(json.message || "评分失败");
                  if (json.rating) setRatings((current) => [json.rating!, ...current.filter((item) => item.id !== json.rating!.id)]);
                  markDisposition("rated", `已有评分 ${score} 分`);
                  toast.success(json.message || "已评分");
                  return json.message || "已评分";
                }, "评分失败")
              }
            >
              记录评分
            </Button>
            <FeedbackBanner phase={ratingAction.phase} message={ratingAction.message} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>快捷标注</CardTitle>
            <CardDescription>
              给这条对话打标签+备注（问题类型等），写入标注库；完整六维请到{" "}
              <Link href={`/ops/annotate?run=${encodeURIComponent(run.id)}` as "/ops"} className="underline">
                数据标注
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="标签" />
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20" placeholder="备注" />
            <Button
              type="button"
              onClick={() =>
                annotateAction.run(async () => {
                  const response = await fetch(`/api/runs/${run.id}/annotate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ label, note }),
                  });
                  const json = (await response.json()) as { ok?: boolean; message?: string; annotation?: Annotation };
                  if (!response.ok || !json.annotation) throw new Error(json.message || "标注失败");
                  setAnnotations((current) => [json.annotation!, ...current]);
                  markDisposition("annotated", `已有标注`);
                  setNote("");
                  return json.message || "已保存标注";
                }, "标注失败")
              }
            >
              保存标注
            </Button>
            <FeedbackBanner phase={annotateAction.phase} message={annotateAction.message} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RatingFocusCard({ rating, run }: { rating: Rating | null; run: RunRecord }) {
  const question = rating?.question?.trim() || run.question || "（无问题）";
  const reply = rating?.reply?.trim() || run.finalReply || "（无回复）";
  const channelLabel = rating?.channel === "user" ? "用户评价" : rating ? "运营代评" : "暂无评价";

  return (
    <Card className="border-[#c45c26]/35 bg-[#fbf6f1]">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          本次服务评价
          {rating ? (
            <StatusLabel
              text={`${rating.score} 分`}
              tone={rating.score <= 2 ? "danger" : rating.score >= 4 ? "ok" : "warn"}
            />
          ) : (
            <StatusLabel text="未找到评价" tone="neutral" />
          )}
          <StatusLabel text={channelLabel} tone="neutral" />
        </CardTitle>
        <CardDescription>
          {rating
            ? `评价时间 ${new Date(rating.createdAt).toLocaleString()}${rating.createdBy ? ` · ${rating.createdBy}` : ""}`
            : "从服务评价进入，但本 Run 下没有匹配到对应评分记录"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">用户问题</p>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="max-h-48 overflow-y-auto text-sm whitespace-pre-wrap break-words leading-6">{question}</p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">客服回复（被评分对象）</p>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="max-h-48 overflow-y-auto text-sm whitespace-pre-wrap break-words leading-6">{reply}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {rating && rating.score <= 2 ? (
            <Link
              href={`/ops/annotate?run=${encodeURIComponent(run.id)}` as "/ops"}
              className="underline"
            >
              低分去标注
            </Link>
          ) : null}
          <Link href={"/ops/ratings" as "/"} className="underline">
            回服务评价列表
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function RelationBlock({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; primary: string; secondary: string; href: string }>;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key}>
              <Link className="font-medium underline" href={item.href as "/"}>
                {item.primary}
              </Link>
              <p className="text-xs text-muted-foreground line-clamp-2">{item.secondary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
