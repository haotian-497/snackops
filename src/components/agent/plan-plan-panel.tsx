"use client";

import { annotatePlanNodes, groupStepsByStage, stepStatusTone, type PlanNode } from "@/lib/agent/plan-path";
import { StatusLabel } from "@/components/status-label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentPlan, AgentStep } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  planner: "Planner",
  validator: "校验",
  tool: "Tool",
  skill: "Skill",
  "risk-check": "风险",
  rewrite: "改写",
};

function nodeTone(status: PlanNode["status"]) {
  return stepStatusTone(status);
}

export function PlanPlanPanel({ plan, steps }: { plan: AgentPlan | null; steps: AgentStep[] }) {
  const nodes = annotatePlanNodes(plan, steps);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle>Plan计划</CardTitle>
        <CardDescription>预期执行顺序（末尾固定含 risk-check）</CardDescription>
      </CardHeader>
      <CardContent>
        {nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">等待 Planner 产出计划…</p>
        ) : (
          <div className="space-y-3">
            {groupStepsByStage(nodes).map((group) => (
              <section key={group.id}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
                <ol className="space-y-0">
                  {group.steps.map((node) => {
                    const index = nodes.findIndex((item) => item.key === node.key);
                    return (
                      <li key={node.key} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < nodes.length - 1 ? (
                          <span
                            className="absolute top-7 bottom-0 left-[0.95rem] w-px bg-border"
                            aria-hidden
                          />
                        ) : null}
                        <span
                          className={cn(
                            "relative z-[1] mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
                            node.status === "running" && "border-amber-600 bg-amber-50 text-amber-900",
                            node.status === "succeeded" && "border-emerald-700/40 bg-emerald-50 text-emerald-900",
                            node.status === "failed" && "border-red-700/40 bg-red-50 text-red-900",
                            (node.status === "pending" || node.status === "skipped") &&
                              "border-border bg-card text-muted-foreground",
                          )}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              <span className="text-muted-foreground">{TYPE_LABEL[node.type] || node.type}</span>
                              {" · "}
                              {node.name}
                            </p>
                            <StatusLabel text={node.status} tone={nodeTone(node.status)} />
                          </div>
                        </div>
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
