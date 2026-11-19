import "server-only";

import { validatePlan } from "@/lib/agent/validator";
import type { AgentPlan, PlanValidationReport, RiskResult, SkillRecord, Tool } from "@/lib/types";

export type GenerationScoreReport = {
  kind: "plan" | "risk";
  passed: boolean;
  summary: string;
  details: string[];
};

export function scorePlanGeneration(
  plan: AgentPlan,
  availableSkills: SkillRecord[],
  availableTools: Tool[],
): { validation: PlanValidationReport; report: GenerationScoreReport } {
  const validation = validatePlan(plan, availableSkills, availableTools);
  const details = validation.issues.map((item) => `${item.severity}:${item.code} ${item.message}`);
  return {
    validation,
    report: {
      kind: "plan",
      passed: validation.ok,
      summary: validation.ok ? "计划通过校验评分" : "计划未通过校验评分",
      details,
    },
  };
}

export function scoreRiskGeneration(result: RiskResult): GenerationScoreReport {
  return {
    kind: "risk",
    passed: result.verdict === "allow",
    summary: result.verdict === "allow" ? "风险审核允许发送" : "风险审核阻断危险回复",
    details: result.triggeredRules,
  };
}
