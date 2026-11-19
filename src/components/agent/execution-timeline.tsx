"use client";

import { formatStepIo, groupStepsByStage, stepStatusTone } from "@/lib/agent/plan-path";
import { runStepDomId } from "@/lib/agent/risk-labels";
import { StatusLabel } from "@/components/status-label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentStep } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  planner: "Planner",
  validator: "校验",
  tool: "Tool",
  skill: "Skill",
  "risk-check": "风险",
  rewrite: "改写",
};

export function ExecutionTimeline({
  steps,
  live,
  highlightStepId,
  title = "执行路径",
  description,
}: {
  steps: AgentStep[];
  live?: boolean;
  /** 高亮并作为定位目标的步骤 */
  highlightStepId?: string | null;
  title?: string;
  description?: string;
}) {
  const currentId = [...steps].reverse().find((item) => item.status === "running")?.stepId;

  return (
    <Card className="h-full" id="run-execution-timeline">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ?? (
            <>
              实际逐步执行
              {live ? <span className="text-amber-800"> · 进行中</span> : null}
              {currentId ? " · 当前步已高亮" : null}
              {highlightStepId ? " · 已定位失败步骤" : null}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">运行后逐步出现。</p>
        ) : (
          <div className="max-h-[36rem] space-y-3 overflow-auto">
            {groupStepsByStage(steps).map((group) => (
              <section key={`${group.id}-${group.steps[0]?.stepId}`}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
                <ol className="space-y-2">
                  {group.steps.map((step) => {
                    const index = steps.findIndex((item) => item.stepId === step.stepId);
                    const active =
                      step.stepId === currentId ||
                      (live && index === steps.length - 1 && step.status === "running");
                    const focused = highlightStepId === step.stepId;
                    const failed = step.status === "failed";
                    return (
                      <li
                        key={step.stepId}
                        id={runStepDomId(step.stepId)}
                        className={cn(
                          "scroll-mt-24 rounded-md border px-2.5 py-2 text-sm transition-colors",
                          focused
                            ? "border-red-500 bg-red-50 ring-2 ring-red-300"
                            : failed
                              ? "border-red-200 bg-red-50/50"
                              : active
                                ? "border-amber-700/40 bg-amber-50/60"
                                : "border-border bg-card",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">
                            <span className="text-muted-foreground">{index + 1}.</span>{" "}
                            {TYPE_LABEL[step.type] || step.type} · {step.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {step.durationMs ? <span>{step.durationMs}ms</span> : null}
                            <StatusLabel text={step.status} tone={stepStatusTone(step.status)} />
                          </div>
                        </div>
                        {step.error ? <p className="mt-1 text-xs text-red-800">{step.error}</p> : null}
                        <details className="mt-2" open={focused && failed}>
                          <summary className="cursor-pointer text-xs text-muted-foreground">查看输入 / 输出</summary>
                          <div className="mt-2 grid gap-2">
                            <div>
                              <p className="mb-1 text-[11px] font-medium text-muted-foreground">输入</p>
                              <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-[11px] whitespace-pre-wrap break-words">
                                {formatStepIo(step.input)}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-1 text-[11px] font-medium text-muted-foreground">输出</p>
                              <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 text-[11px] whitespace-pre-wrap break-words">
                                {step.status === "running" ? "执行中…" : formatStepIo(step.output)}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
