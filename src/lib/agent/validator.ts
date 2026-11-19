import "server-only";

import { LOGISTICS_TOOLS, ORDER_TOOLS, PRICE_TOOLS, RISK_SKILLS } from "@/lib/agent/capabilities";
import type { AgentPlan, PlanValidationIssue, PlanValidationReport, SkillRecord, Tool } from "@/lib/types";

export function validatePlan(
  plan: AgentPlan,
  availableSkills: SkillRecord[],
  availableTools: Tool[],
): PlanValidationReport {
  const issues: PlanValidationIssue[] = [];
  const skillIds = new Set(availableSkills.map((item) => item.id));
  const toolIds = new Set(availableTools.map((item) => item.id));

  for (const skillId of plan.selectedSkills) {
    if (!skillIds.has(skillId)) {
      issues.push({
        code: "UNKNOWN_SKILL",
        severity: "error",
        message: `计划选择了不存在或未启用的 Skill：${skillId}`,
        capability: skillId,
      });
    }
  }
  for (const toolId of plan.selectedTools) {
    if (!toolIds.has(toolId)) {
      issues.push({
        code: "UNKNOWN_TOOL",
        severity: "error",
        message: `计划选择了不存在或未启用的 Tool：${toolId}`,
        capability: toolId,
      });
    }
  }

  const selectedTools = new Set(plan.selectedTools);
  const selectedSkills = new Set(plan.selectedSkills);

  if (plan.mandatoryCapabilities.includes("price") && !PRICE_TOOLS.some((id) => selectedTools.has(id))) {
    issues.push({
      code: "MISSING_PRICE_TOOL",
      severity: "error",
      message: "价格场景缺少价格 Tool（calculate_price / query_coupons）",
      capability: "price",
    });
  }
  if (plan.mandatoryCapabilities.includes("order") && !ORDER_TOOLS.some((id) => selectedTools.has(id))) {
    issues.push({
      code: "MISSING_ORDER_TOOL",
      severity: "error",
      message: "订单场景缺少 query_orders",
      capability: "order",
    });
  }
  if (plan.mandatoryCapabilities.includes("logistics") && !LOGISTICS_TOOLS.some((id) => selectedTools.has(id))) {
    issues.push({
      code: "MISSING_LOGISTICS_TOOL",
      severity: "error",
      message: "物流场景缺少 query_logistics",
      capability: "logistics",
    });
  }

  const needsRisk =
    plan.mandatoryCapabilities.includes("risk") || plan.risk.needsRiskCheck || plan.risk.level === "high";
  if (needsRisk && !RISK_SKILLS.some((id) => selectedSkills.has(id))) {
    issues.push({
      code: "MISSING_RISK_CHECK",
      severity: "block",
      message: "风险场景缺少 risk-check，已阻断，不会伪装成功。",
      capability: "risk",
    });
  }

  const blocked = issues.some((item) => item.severity === "block");
  const ok = !blocked && !issues.some((item) => item.severity === "error");
  return { ok, blocked, issues };
}
