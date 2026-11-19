import type { AgentPlan, AgentStep, AgentStepStatus, AgentStepType, ExecutionStageId } from "@/lib/types";
import { EXECUTION_STAGES } from "@/lib/types";

export type PlanNodeStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export type PlanNode = {
  key: string;
  type: AgentStepType;
  stage: ExecutionStageId;
  name: string;
  status: PlanNodeStatus;
};

/** 与 executor 一致的预期路径（不含 rewrite；rewrite 仅执行出现时在时间线可见） */
export function buildPlanNodes(plan: AgentPlan | null | undefined): PlanNode[] {
  if (!plan) return [];
  const stageFor = (type: AgentStepType) =>
    EXECUTION_STAGES.find((stage) => (stage.types as readonly string[]).includes(type))?.id ?? "execute";
  const nodes: PlanNode[] = [
    { key: "planner", type: "planner", stage: "plan", name: "planner", status: "pending" },
    { key: "validator", type: "validator", stage: "validate", name: "plan-validator", status: "pending" },
  ];
  for (const toolId of plan.selectedTools) {
    nodes.push({ key: `tool:${toolId}`, type: "tool", stage: stageFor("tool"), name: toolId, status: "pending" });
  }
  for (const skillId of plan.selectedSkills.filter((id) => id !== "risk-check")) {
    nodes.push({ key: `skill:${skillId}`, type: "skill", stage: stageFor("skill"), name: skillId, status: "pending" });
  }
  // Executor 在 Skill 启用时总会跑 risk-check（不依赖 selectedSkills 是否写出）
  nodes.push({ key: "risk-check", type: "risk-check", stage: "risk", name: "risk-check", status: "pending" });
  return nodes;
}

function matchStep(node: PlanNode, step: AgentStep) {
  if (node.type === "planner") return step.type === "planner";
  if (node.type === "validator") return step.type === "validator";
  if (node.type === "risk-check") return step.type === "risk-check";
  return step.type === node.type && step.name === node.name;
}

export function annotatePlanNodes(plan: AgentPlan | null | undefined, steps: AgentStep[]): PlanNode[] {
  const nodes = buildPlanNodes(plan);
  return nodes.map((node) => {
    const matched = [...steps].reverse().find((step) => matchStep(node, step));
    if (!matched) return node;
    const status: PlanNodeStatus =
      matched.status === "running"
        ? "running"
        : matched.status === "failed"
          ? "failed"
          : matched.status === "skipped"
            ? "skipped"
            : "succeeded";
    return { ...node, status };
  });
}

export function upsertAgentStep(steps: AgentStep[], step: AgentStep): AgentStep[] {
  const index = steps.findIndex((item) => item.stepId === step.stepId);
  if (index === -1) return [...steps, step];
  const next = [...steps];
  next[index] = step;
  return next;
}

export function executionStageFor(type: string): { id: ExecutionStageId; label: string } {
  const matched = EXECUTION_STAGES.find((stage) => (stage.types as readonly string[]).includes(type));
  return matched ? { id: matched.id, label: matched.label } : { id: "execute", label: "Executor 执行" };
}

/** 按连续步骤的阶段分组，只用于展示，不写入 RunRecord。优先使用 step.stage。 */
export function groupStepsByStage<T extends { type: string; stage?: ExecutionStageId }>(steps: T[]) {
  const groups: { id: ExecutionStageId; label: string; steps: T[] }[] = [];
  for (const step of steps) {
    const stage = step.stage
      ? { id: step.stage, label: EXECUTION_STAGES.find((s) => s.id === step.stage)?.label ?? step.stage }
      : executionStageFor(step.type);
    const last = groups.at(-1);
    if (last && last.id === stage.id) last.steps.push(step);
    else groups.push({ id: stage.id, label: stage.label, steps: [step] });
  }
  return groups;
}

export function stepStatusTone(status: AgentStepStatus | PlanNodeStatus) {
  if (status === "failed") return "danger" as const;
  if (status === "running") return "warn" as const;
  if (status === "pending" || status === "skipped") return "neutral" as const;
  return "ok" as const;
}

export function formatStepIo(value: unknown, max = 4000) {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (!text) return "(空)";
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n…（已截断，共 ${text.length} 字符）`;
  } catch {
    return String(value);
  }
}
