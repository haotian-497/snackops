import type { AgentPlan, PlanValidationReport } from "@/lib/types";

export type ExecutionPathNode = {
  id: string;
  kind: "planner" | "validator" | "tool" | "skill" | "risk" | "rewrite" | "handoff" | "reply";
  title: string;
  detail?: string;
  status: "run" | "stop" | "optional";
};

export function buildPreviewExecutionPath(input: {
  plan: AgentPlan;
  validation: PlanValidationReport;
  skillNames?: Record<string, string>;
  toolNames?: Record<string, string>;
  availableSkillIds?: string[];
}): ExecutionPathNode[] {
  const nameOf = (id: string, map?: Record<string, string>) => map?.[id] || id;
  const blocked = input.validation.blocked || !input.validation.ok;
  const nodes: ExecutionPathNode[] = [
    {
      id: "planner",
      kind: "planner",
      title: "Planner",
      detail: "生成 selectedSkills / selectedTools",
      status: "run",
    },
    {
      id: "validator",
      kind: "validator",
      title: "计划校验",
      detail: blocked ? input.validation.issues[0]?.message || "未通过，停止执行" : "通过后进入执行",
      status: blocked ? "stop" : "run",
    },
  ];

  if (blocked) {
    nodes.push({
      id: "stop",
      kind: "reply",
      title: "停止",
      detail: "不会调用 Tool / Skill，也不会伪装成功",
      status: "stop",
    });
    return nodes;
  }

  for (const toolId of input.plan.selectedTools) {
    nodes.push({
      id: `tool:${toolId}`,
      kind: "tool",
      title: nameOf(toolId, input.toolNames),
      detail: "查询事实",
      status: "run",
    });
  }

  for (const skillId of input.plan.selectedSkills.filter((id) => id !== "risk-check")) {
    nodes.push({
      id: `skill:${skillId}`,
      kind: "skill",
      title: nameOf(skillId, input.skillNames),
      detail: skillId === "response-generator" ? "起草回复" : "处理本步",
      status: "run",
    });
  }

  const riskAvailable = input.availableSkillIds?.includes("risk-check") ?? input.plan.selectedSkills.includes("risk-check");
  if (riskAvailable || input.plan.risk.needsRiskCheck || input.plan.selectedSkills.includes("risk-check")) {
    nodes.push({
      id: "risk",
      kind: "risk",
      title: "风险审核",
      detail: `风险 ${input.plan.risk.level}`,
      status: "run",
    });
    nodes.push({
      id: "rewrite",
      kind: "rewrite",
      title: "安全改写",
      detail: "仅当风控拦截时",
      status: "optional",
    });
  }

  if (input.plan.handoff) {
    nodes.push({
      id: "handoff",
      kind: "handoff",
      title: "转人工",
      detail: input.plan.handoffReason || "计划要求接管",
      status: "run",
    });
  }

  nodes.push({
    id: "reply",
    kind: "reply",
    title: "输出回复",
    detail: input.plan.degradation ? `降级：${input.plan.degradation}` : undefined,
    status: "run",
  });

  return nodes;
}

export function executionPathSummary(nodes: ExecutionPathNode[]) {
  return nodes.map((item) => item.title).join(" → ");
}
