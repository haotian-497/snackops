import { LOGISTICS_TOOLS, PRICE_TOOLS } from "../agent/capabilities";
import type {
  ImprovementDiagnosis,
  ImprovementDiagnosisConfidence,
  ImprovementTarget,
  RunRecord,
} from "../types/runtime";

export type AnalyzeRootCauseInput = {
  run: RunRecord | null;
  issueType?: string;
  label?: string;
  note?: string;
};

function clip(text: string, max = 80) {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}

function build(
  partial: Omit<ImprovementDiagnosis, "needsConfirm" | "rootCauseKey" | "summary"> & {
    summary?: string;
    rootCauseKey?: string;
  },
): ImprovementDiagnosis {
  const confidence = partial.confidence;
  const needsConfirm = confidence !== "high";
  const target = partial.target;
  const subject =
    target === "planner"
      ? "Planner"
      : target === "tool"
        ? `Tool · ${partial.toolId || "未指定"}`
        : `Skill · ${partial.skillId || "未指定"}`;
  const summary = partial.summary || `嫌疑 ${subject}`;
  const rootCauseKey =
    partial.rootCauseKey ||
    (target === "planner"
      ? "planner"
      : target === "tool"
        ? `tool:${partial.toolId || "unknown"}`
        : `skill:${partial.skillId || "unknown"}`);
  return {
    target,
    skillId: partial.skillId,
    toolId: partial.toolId,
    confidence,
    needsConfirm,
    summary,
    rationale: partial.rationale,
    evidence: partial.evidence,
    rootCauseKey,
  };
}

function planSelected(run: RunRecord | null) {
  return {
    skills: new Set(run?.plan?.selectedSkills ?? []),
    tools: new Set(run?.plan?.selectedTools ?? []),
  };
}

function questionText(run: RunRecord | null, note?: string, label?: string) {
  return [run?.question, note, label].filter(Boolean).join(" ");
}

/** 基于 Run 全链路做可解释归因；低/中置信度仍给建议但 needsConfirm=true */
export function analyzeRunRootCause(input: AnalyzeRootCauseInput): ImprovementDiagnosis {
  const { run, issueType = "other", label = "", note = "" } = input;
  const evidence: string[] = [];
  const text = questionText(run, note, label);
  const emptyReply = !(run?.finalReply || "").trim();
  const { skills, tools } = planSelected(run);
  const issues = run?.validation?.issues ?? [];

  if (run?.validation && !run.validation.ok) {
    const blockOrError = issues.filter((item) => item.severity === "block" || item.severity === "error");
    for (const item of blockOrError) evidence.push(`${item.code}：${item.message}`);

    const missingTool = blockOrError.find((item) => item.code.startsWith("MISSING_") && item.code.endsWith("_TOOL"));
    if (missingTool) {
      const toolHint =
        missingTool.code === "MISSING_PRICE_TOOL"
          ? "calculate_price"
          : missingTool.code === "MISSING_ORDER_TOOL"
            ? "query_orders"
            : missingTool.code === "MISSING_LOGISTICS_TOOL"
              ? "query_logistics"
              : undefined;
      return build({
        target: "planner",
        confidence: "high",
        rationale: "计划校验失败：该选的 Tool 没选上，优先改 Planner 路由。",
        evidence,
        summary: toolHint ? `嫌疑 Planner（漏选 ${toolHint}）` : "嫌疑 Planner（漏选 Tool）",
        rootCauseKey: toolHint ? `planner:missing_tool:${toolHint}` : "planner:missing_tool",
      });
    }

    const missingRisk = blockOrError.find((item) => item.code === "MISSING_RISK_CHECK");
    if (missingRisk) {
      return build({
        target: "planner",
        confidence: "high",
        rationale: "风险场景未选入 risk-check，属 Planner 路由问题（不是 risk-check 话术本身）。",
        evidence,
        summary: "嫌疑 Planner（漏选 risk-check）",
        rootCauseKey: "planner:missing_skill:risk-check",
      });
    }

    const unknown = blockOrError.find((item) => item.code === "UNKNOWN_SKILL" || item.code === "UNKNOWN_TOOL");
    if (unknown) {
      return build({
        target: "planner",
        confidence: "high",
        rationale: "计划选了不可用的 Skill/Tool，优先检查 Planner 可选列表与路由。",
        evidence,
        summary: "嫌疑 Planner（选了不可用能力）",
        rootCauseKey: "planner:unknown_capability",
      });
    }

    return build({
      target: "planner",
      confidence: "high",
      rationale: "计划校验未通过，优先改 Planner。",
      evidence: evidence.length ? evidence : ["validation.ok=false"],
      summary: "嫌疑 Planner（计划校验失败）",
      rootCauseKey: "planner:validation",
    });
  }

  if (run?.riskResult?.verdict === "block") {
    evidence.push(`risk-check 阻断：${(run.riskResult.triggeredRules || []).join("、") || "见 raw"}`);
    return build({
      target: "skill",
      skillId: "risk-check",
      confidence: "high",
      rationale: "发送前风险审核阻断，优先改 risk-check Prompt / 规则。",
      evidence,
      summary: "嫌疑 Skill · risk-check",
      rootCauseKey: "skill:risk-check",
    });
  }

  if (label === "dangerous_claim" || label === "efficacy" || /绝对|包治|降血糖|增强免疫|最便宜|第一/.test(text)) {
    evidence.push(label ? `标注 ${label}` : "文案含极限/功效表述");
    return build({
      target: "skill",
      skillId: "risk-check",
      confidence: label ? "high" : "medium",
      rationale: "危险宣称/功效相关，优先收紧 risk-check。",
      evidence,
      summary: "嫌疑 Skill · risk-check",
      rootCauseKey: "skill:risk-check",
    });
  }

  if (label === "empty_reply" || emptyReply) {
    evidence.push(emptyReply ? "finalReply 为空" : `标注 ${label}`);
    if (/过敏/.test(text)) {
      return build({
        target: "skill",
        skillId: "allergy-risk-reminder",
        confidence: "medium",
        rationale: "空回复且涉及过敏：计划已过校验时，更可能是过敏提醒/生成 Skill 未给出有效回复。",
        evidence,
        summary: "嫌疑 Skill · allergy-risk-reminder（待确认）",
        rootCauseKey: "skill:allergy-risk-reminder",
      });
    }
    return build({
      target: "skill",
      skillId: "response-generator",
      confidence: "medium",
      rationale: "空回复且计划校验通过：优先检查回复生成 Skill。",
      evidence,
      summary: "嫌疑 Skill · response-generator（待确认）",
      rootCauseKey: "skill:response-generator",
    });
  }

  if (issueType === "price" || /价格|多少钱|算价|券后/.test(text)) {
    const hasPriceTool = PRICE_TOOLS.some((id) => tools.has(id));
    if (!hasPriceTool) {
      evidence.push("价格意图但计划未选价格 Tool");
      return build({
        target: "planner",
        confidence: "medium",
        rationale: "价格相关但未选价格 Tool，优先 Planner。",
        evidence,
        summary: "嫌疑 Planner（价格未选 Tool）（待确认）",
        rootCauseKey: "planner:missing_tool:calculate_price",
      });
    }
    evidence.push(`计划已选价格 Tool：${PRICE_TOOLS.filter((id) => tools.has(id)).join("、")}`);
    return build({
      target: "tool",
      toolId: tools.has("calculate_price") ? "calculate_price" : "query_coupons",
      confidence: "medium",
      rationale: "价格场景已选 Tool 仍出错，优先核对该 Tool 描述/启用或算价结果使用方式。",
      evidence,
      summary: "嫌疑 Tool · calculate_price（待确认）",
      rootCauseKey: "tool:calculate_price",
    });
  }

  if (issueType === "logistics" || /物流|快递|运单|到哪/.test(text)) {
    const hasLogistics = LOGISTICS_TOOLS.some((id) => tools.has(id));
    if (!hasLogistics) {
      evidence.push("物流意图但计划未选 query_logistics");
      return build({
        target: "planner",
        confidence: "medium",
        rationale: "物流相关但未选物流 Tool，优先 Planner。",
        evidence,
        summary: "嫌疑 Planner（漏选 query_logistics）（待确认）",
        rootCauseKey: "planner:missing_tool:query_logistics",
      });
    }
    evidence.push("计划已选 query_logistics");
    return build({
      target: "tool",
      toolId: "query_logistics",
      confidence: "medium",
      rationale: "物流 Tool 已选仍出错，优先核对 query_logistics。",
      evidence,
      summary: "嫌疑 Tool · query_logistics（待确认）",
      rootCauseKey: "tool:query_logistics",
    });
  }

  if (issueType === "risk" || label === "scam" || /中奖|诈骗|转账|验证码/.test(text)) {
    evidence.push(label || issueType || "风险话术线索");
    return build({
      target: "skill",
      skillId: "risk-check",
      confidence: "medium",
      rationale: "风险/诈骗场景，优先 risk-check。",
      evidence,
      summary: "嫌疑 Skill · risk-check（待确认）",
      rootCauseKey: "skill:risk-check",
    });
  }

  if (/过敏/.test(text) || label === "allergy") {
    evidence.push("过敏相关问题");
    const skillId = skills.has("allergy-risk-reminder") ? "allergy-risk-reminder" : "allergy-risk-reminder";
    return build({
      target: "skill",
      skillId,
      confidence: "medium",
      rationale: "过敏场景优先改 allergy-risk-reminder。",
      evidence,
      summary: "嫌疑 Skill · allergy-risk-reminder（待确认）",
      rootCauseKey: "skill:allergy-risk-reminder",
    });
  }

  if (issueType === "after_sale" || /退|换|破损|售后/.test(text)) {
    return build({
      target: "skill",
      skillId: "after-sales-classification",
      confidence: "medium",
      rationale: "售后场景优先 after-sales-classification。",
      evidence: [label || issueType || "售后线索"],
      summary: "嫌疑 Skill · after-sales-classification（待确认）",
      rootCauseKey: "skill:after-sales-classification",
    });
  }

  if (issueType === "recommend" || /推荐|送礼|零食/.test(text)) {
    const skillId = skills.has("recommendation-decision")
      ? "recommendation-decision"
      : "recommendation-decision";
    return build({
      target: "skill",
      skillId,
      confidence: "low",
      rationale: "推荐类问题默认指向 recommendation-decision，证据较弱，请人工确认。",
      evidence: [label || issueType || clip(run?.question || "推荐场景")],
      summary: "嫌疑 Skill · recommendation-decision（待确认）",
      rootCauseKey: "skill:recommendation-decision",
    });
  }

  const fallbackSkill =
    run?.skillVersions?.find((item) => item.skillId === "response-generator")?.skillId ||
    run?.plan?.selectedSkills?.slice(-1)[0] ||
    "response-generator";

  return build({
    target: "skill",
    skillId: fallbackSkill,
    confidence: "low",
    rationale: "未命中强信号，默认怀疑回复生成链路，请结合 Trace 人工确认。",
    evidence: [
      label ? `标注 ${label}` : "",
      issueType ? `issueType=${issueType}` : "",
      run?.status ? `run.status=${run.status}` : "",
    ].filter(Boolean),
    summary: `嫌疑 Skill · ${fallbackSkill}（待确认）`,
    rootCauseKey: `skill:${fallbackSkill}`,
  });
}

export function diagnosisConfidenceLabel(confidence: ImprovementDiagnosisConfidence) {
  if (confidence === "high") return "高";
  if (confidence === "medium") return "中";
  return "低";
}

export function mergeDiagnosis(
  existing: ImprovementDiagnosis | undefined,
  incoming: ImprovementDiagnosis,
): ImprovementDiagnosis {
  if (!existing) return incoming;
  const rank = { high: 3, medium: 2, low: 1 } as const;
  if (rank[incoming.confidence] > rank[existing.confidence]) return incoming;
  if (existing.rootCauseKey === incoming.rootCauseKey) {
    return {
      ...existing,
      evidence: [...new Set([...(existing.evidence || []), ...(incoming.evidence || [])])].slice(0, 12),
      rationale: existing.rationale || incoming.rationale,
    };
  }
  return existing;
}

export function rootCauseClusterKey(source: string, diagnosis: ImprovementDiagnosis) {
  return `${source}:${diagnosis.rootCauseKey}`;
}

export function subjectIdFromDiagnosis(diagnosis: ImprovementDiagnosis): string | undefined {
  if (diagnosis.target === "tool") return diagnosis.toolId;
  if (diagnosis.target === "skill") return diagnosis.skillId;
  return undefined;
}

export function isDiagnosedTarget(target?: ImprovementTarget): target is "planner" | "skill" | "tool" {
  return target === "planner" || target === "skill" || target === "tool";
}
