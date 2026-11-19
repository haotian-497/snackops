import "server-only";

import type { ImprovementTarget, RunRecord } from "@/lib/types";

export function inferIssueType(text: string) {
  if (/价格|券|优惠|满减|算价/.test(text)) return "price";
  if (/退|换|破损|售后|补偿/.test(text)) return "after_sale";
  if (/物流|快递|运单|到货/.test(text)) return "logistics";
  if (/中奖|诈骗|转账|验证码|风险/.test(text)) return "risk";
  if (/推荐|送礼|礼盒|零食/.test(text)) return "recommend";
  return "other";
}

export function inferImprovementTarget(run: RunRecord | null, issueType: string): ImprovementTarget {
  // 自动推断仅作默认值；运营可在改进建议页手动改成 skill / planner / tool。
  if (issueType === "risk" || run?.riskResult?.verdict === "block") return "skill";
  if (issueType === "price" || issueType === "logistics") return "tool";
  // 计划校验失败（缺 Tool/Skill、被 block）→ 默认归 Planner；空回复也可能因此产生，但不等于只能改 Planner。
  if (run?.validation && !run.validation.ok) return "planner";
  return "skill";
}

export function inferSkillId(run: RunRecord | null, issueType: string) {
  if (issueType === "risk") return "risk-check";
  if (issueType === "after_sale") return "after-sales-classification";
  if (issueType === "recommend") return "recommendation-decision";
  return run?.skillVersions[0]?.skillId || "response-generator";
}

export function clusterKey(source: string, issueType: string) {
  return `${source}:${issueType}`;
}
