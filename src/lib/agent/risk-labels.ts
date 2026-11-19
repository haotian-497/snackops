import type { AgentPlan, AgentStep, RiskResult } from "@/lib/types";

export type RiskRuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";

export const RISK_RULES: Array<{
  id: RiskRuleId;
  title: string;
  summary: string;
  detail: string;
}> = [
  {
    id: "R1",
    title: "价格一致性",
    summary: "回复里的价格必须和查询结果一致；核不清的价格不能当定论。",
    detail:
      "文中单价、合计、券后价须与 Tool facts 一致；不得把活动价说成日常价或少报门槛。无法核验的价格数字视为危险并阻断。",
  },
  {
    id: "R2",
    title: "禁止极限词与夸大功效",
    summary: "不能说最便宜、绝对、包治、降血糖等夸大表述。",
    detail:
      "命中「最便宜/第一/绝对/100%/包治/减肥/降血糖/增强免疫」等则阻断。普通口味形容词如「香辣」允许。",
  },
  {
    id: "R3",
    title: "不超出售后政策承诺",
    summary: "不能乱承诺一律包退、一定补偿、全额+运费等。",
    detail: "只能复述政策文本中的窗口和条件；开封仅口味不喜欢不得承诺退款。",
  },
  {
    id: "R4",
    title: "新客优惠判断",
    summary: "新人券只有确认是新客才能说「您能用」。",
    detail:
      "newCustomerOnly 券仅当 facts.user.isNewCustomer === true 才可说可领/可用；老客应说明不适用，不伪造资格。",
  },
  {
    id: "R5",
    title: "儿童 / 孕妇 / 过敏",
    summary: "特殊人群相关表述不能绝对化，过敏必须提示配料。",
    detail:
      "儿童须提示适量；孕妇不给医疗建议；过敏须点名已知过敏原，不得说「不过敏/绝对安全」。",
  },
  {
    id: "R6",
    title: "投诉售后不得推诿",
    summary: "不能把责任全推给用户或不接处理。",
    detail: "不得要求用户先去找快递而自己不登记；可协同物流/质检，但必须承接处理。",
  },
  {
    id: "R7",
    title: "疑似中奖诈骗",
    summary: "中奖/转账/验证码场景必须防诈提醒并引导官方渠道。",
    detail:
      "须提醒不要转账、不要提供验证码等敏感信息；不承诺兑奖；引导订单页/官方客服核验。缺任一提醒则阻断。",
  },
];

export function riskRuleById(id: string) {
  return RISK_RULES.find((item) => item.id === id.toUpperCase());
}

export function normalizeRuleIds(ids: string[] | undefined) {
  return (ids ?? []).map((id) => id.toUpperCase());
}

export type RiskDisposition =
  | "pending"
  | "plan_only"
  | "allow"
  | "block_rewritten"
  | "block_rewrite_failed"
  | "block_no_rewrite"
  | "check_failed";

const PLAN_LEVEL_LABEL: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function planRiskLevelLabel(level: string | undefined) {
  if (!level) return "未知";
  return PLAN_LEVEL_LABEL[level] || level;
}

export function deriveRiskDisposition(input: {
  plan: AgentPlan | null;
  riskResult: RiskResult | null;
  steps: AgentStep[];
}): RiskDisposition {
  const { plan, riskResult, steps } = input;
  if (!plan) return "pending";

  const riskStep = [...steps].reverse().find((item) => item.type === "risk-check");
  if (riskStep?.status === "failed") return "check_failed";
  if (!riskResult) return "plan_only";

  if (riskResult.verdict === "allow") return "allow";

  const rewrite = [...steps].reverse().find((item) => item.type === "rewrite");
  if (rewrite?.status === "succeeded") return "block_rewritten";
  if (rewrite?.status === "failed") return "block_rewrite_failed";
  return "block_no_rewrite";
}

export function dispositionCopy(disposition: RiskDisposition) {
  switch (disposition) {
    case "pending":
      return { title: "尚未运行", hint: "运行 Agent 后这里会显示审核结论。", tone: "neutral" as const };
    case "plan_only":
      return {
        title: "仅风险评估",
        hint: "最终审核尚未完成；上方等级只是 Planner 风险评估，不是能不能发。",
        tone: "info" as const,
      };
    case "allow":
      return {
        title: "审核通过 · 可发送",
        hint: "草稿通过 risk-check，最终回复一般就是草稿原文。",
        tone: "ok" as const,
      };
    case "block_rewritten":
      return {
        title: "草稿拦截 · 已安全改写",
        hint: "risk-check 判定 block（草稿踩线），已走 safe-rewrite；下面最终回复是改写后的版本。",
        tone: "warn" as const,
      };
    case "block_rewrite_failed":
      return {
        title: "草稿拦截 · 改写失败",
        hint: "审核 block 后改写未成功，可能使用了安全兜底句。",
        tone: "danger" as const,
      };
    case "block_no_rewrite":
      return {
        title: "草稿拦截",
        hint: "审核结论为 block；若未见 rewrite 步骤，请看执行路径是否已跑完。",
        tone: "danger" as const,
      };
    case "check_failed":
      return {
        title: "审核步骤失败",
        hint: "risk-check 调用本身失败（超时/报错），与「block=草稿踩线」不是一回事。",
        tone: "danger" as const,
      };
  }
}

export function replySourceLabel(disposition: RiskDisposition) {
  if (disposition === "block_rewritten") return "来源：安全改写（safe-rewrite）";
  if (disposition === "block_rewrite_failed") return "来源：改写失败兜底句";
  if (disposition === "allow") return "来源：草稿原文（未改写）";
  if (disposition === "block_no_rewrite") return "来源：待确认（拦截后未见改写）";
  return "来源：执行完成后显示";
}

export function failedStepSummary(steps: AgentStep[]) {
  return steps
    .filter((item) => item.status === "failed")
    .map((item) => ({
      stepId: item.stepId,
      name: `${item.type} · ${item.name}`,
      error: item.error || "失败",
    }));
}

/** 详情页步骤锚点 id，供「定位到失败位置」滚动 */
export function runStepDomId(stepId: string) {
  return `run-step-${stepId}`;
}
