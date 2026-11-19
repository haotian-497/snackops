"use client";

import Link from "next/link";

import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deriveRiskDisposition,
  dispositionCopy,
  failedStepSummary,
  normalizeRuleIds,
  planRiskLevelLabel,
  replySourceLabel,
  riskRuleById,
} from "@/lib/agent/risk-labels";
import type { AgentPlan, AgentStep, PlanValidationReport, RiskResult } from "@/lib/types";

export function PlanRiskSummary({
  plan,
  validation,
  riskResult,
  finalReply,
  runId,
  steps = [],
  showRunDetailLink = true,
  onLocateFailedStep,
}: {
  plan: AgentPlan | null;
  validation: PlanValidationReport | null;
  riskResult: RiskResult | null;
  finalReply: string;
  runId?: string;
  steps?: AgentStep[];
  /** 已在 Run 详情页时关掉「本 Run 详情」入口，避免自链 */
  showRunDetailLink?: boolean;
  /** 滚动到执行路径中的失败步骤 */
  onLocateFailedStep?: (stepId: string) => void;
}) {
  const disposition = deriveRiskDisposition({ plan, riskResult, steps });
  const copy = dispositionCopy(disposition);
  const failed = failedStepSummary(steps);
  const hitRules = normalizeRuleIds(riskResult?.triggeredRules);
  const handbook = "/help/risk-rules";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>计划与风险</CardTitle>
            <CardDescription>
              Planner 结论与发送前审核摘要
              {runId && showRunDetailLink ? (
                <>
                  {" · "}
                  <Link className="underline" href={`/runs/${runId}` as "/"}>
                    {runId}
                  </Link>
                </>
              ) : runId ? (
                <> · {runId}</>
              ) : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              className="rounded-md border border-border bg-secondary/80 px-2 py-1 text-muted-foreground hover:text-foreground"
              href={handbook as "/"}
            >
              规则手册
            </Link>
            {runId && showRunDetailLink ? (
              <Link
                className="rounded-md border border-border bg-secondary/80 px-2 py-1 text-muted-foreground hover:text-foreground"
                href={`/runs/${runId}` as "/"}
              >
                本 Run 详情
              </Link>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!plan ? (
          <p className="text-muted-foreground">运行后显示计划总览、审核结论与最终回复。</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2 rounded-md border border-border bg-[#fffaf3] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusLabel text={copy.title} tone={copy.tone} />
                <StatusLabel
                  text={`风险评估 · ${planRiskLevelLabel(plan.risk.level)}`}
                  tone={plan.risk.level === "high" ? "warn" : "neutral"}
                />
                {riskResult ? (
                  <StatusLabel
                    text={`审核 ${riskResult.verdict === "block" ? "block · 拦截草稿" : "allow · 可发送"}`}
                    tone={riskResult.verdict === "block" ? "danger" : "ok"}
                  />
                ) : (
                  <StatusLabel text="审核尚未出结论" tone="neutral" />
                )}
                {plan.degradation ? <StatusLabel text="Planner 已降级" tone="warn" /> : null}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{copy.hint}</p>
              <p className="text-[11px] text-muted-foreground">
                提示：「block」≠ 整单失败；通常表示草稿踩线后走安全改写。详见{" "}
                <Link className="underline" href={handbook as "/"}>
                  规则手册
                </Link>
                。
              </p>
            </div>

            <div className="space-y-2">
              <p className="leading-6">{plan.reasoning}</p>
              <p>
                <span className="text-muted-foreground">Skill：</span>
                {plan.selectedSkills.join("、") || "无"}
              </p>
              <p>
                <span className="text-muted-foreground">Tool：</span>
                {plan.selectedTools.join("、") || "无"}
              </p>
              <p>
                <span className="text-muted-foreground">强制能力：</span>
                {plan.mandatoryCapabilities.join("、") || "无"}
              </p>
              {plan.degradation ? (
                <p className="text-xs text-amber-800">
                  降级标记：{plan.degradation}
                  {plan.handoffReason ? ` · ${plan.handoffReason}` : ""}
                </p>
              ) : null}

              {hitRules.length > 0 ? (
                <div className="space-y-1.5 rounded-md border border-[#e8c4a0] bg-[#fff6eb] p-2.5">
                  <p className="text-xs font-medium text-[#8a4b24]">
                    命中规则
                    <span className="ml-1 font-normal text-[#9a5b2f]">
                      （草稿触发了哪些不允许的检查项 → 所以 block）
                    </span>
                  </p>
                  <ul className="space-y-1.5">
                    {hitRules.map((id) => {
                      const rule = riskRuleById(id);
                      return (
                        <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span>
                            <strong>{id}</strong>
                            {rule ? ` · ${rule.title}` : ""}
                            {rule ? <span className="text-muted-foreground"> — {rule.summary}</span> : null}
                          </span>
                          <Link className="shrink-0 underline" href={`${handbook}#${id}` as "/"}>
                            查看详细规则
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : riskResult?.verdict === "allow" ? (
                <p className="text-xs text-muted-foreground">未命中禁止规则（allow）。</p>
              ) : null}

              {riskResult?.safeRewriteHint ? (
                <p className="text-xs text-muted-foreground">改写提示：{riskResult.safeRewriteHint}</p>
              ) : null}

              {failed.length > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50/80 p-2.5 text-xs text-red-900">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">失败节点</p>
                    {onLocateFailedStep ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => onLocateFailedStep(failed[0].stepId)}
                      >
                        定位到失败位置
                      </Button>
                    ) : null}
                  </div>
                  <ul className="space-y-1.5">
                    {failed.map((item) => (
                      <li key={item.stepId} className="flex flex-wrap items-start justify-between gap-2">
                        <span>
                          {item.name}：{item.error}
                        </span>
                        {onLocateFailedStep ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 text-xs"
                            onClick={() => onLocateFailedStep(item.stepId)}
                          >
                            定位
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {validation?.issues.length ? (
                <ul className="list-disc space-y-1 pl-5 text-red-800">
                  {validation.issues.map((issue) => (
                    <li key={issue.code}>{issue.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="mb-1 text-xs text-muted-foreground">
                最终回复 · {replySourceLabel(disposition)}
              </p>
              {finalReply ? (
                <p className="whitespace-pre-wrap leading-6">{finalReply}</p>
              ) : (
                <p className="text-muted-foreground">执行完成后显示。</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
