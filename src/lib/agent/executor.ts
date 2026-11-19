import "server-only";

import { randomUUID } from "node:crypto";

import { extractCouponCode, extractOrderId } from "@/lib/agent/capabilities";
import { parseJsonFromText } from "@/lib/agent/json";
import { scoreRiskGeneration } from "@/lib/agent/score";
import { completeLlm } from "@/lib/llm";
import { sampleInputFor, runTool } from "@/lib/tools/registry";
import type { AgentPlan, AgentStep, AgentStepType, RiskResult, SkillRecord } from "@/lib/types";
import { EXECUTION_STAGES } from "@/lib/types";

export type ExecutorDebug = {
  failToolId?: string;
};

export type ExecutorEvent = {
  type: "step" | "risk" | "reply";
  step?: AgentStep;
  riskResult?: RiskResult;
  finalReply?: string;
};

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const started = Date.now();
  const value = await work();
  return { value, durationMs: Date.now() - started };
}

function toolInputFor(toolId: string, question: string): Record<string, unknown> {
  const sample = sampleInputFor(toolId);
  const orderId = extractOrderId(question);
  const coupon = extractCouponCode(question);
  if (toolId === "query_orders" || toolId === "query_logistics") {
    return { ...sample, ...(orderId ? { orderId } : {}) };
  }
  if (toolId === "query_coupons" && coupon) {
    return { ...sample, code: coupon };
  }
  if (toolId === "query_products") {
    if (/海带/.test(question)) return { keyword: "海带" };
    if (/软糖|水蜜桃/.test(question)) return { keyword: "软糖" };
    if (/坚果/.test(question)) return { keyword: "坚果" };
    if (/礼/.test(question)) return { keyword: "礼" };
    return sample;
  }
  if (toolId === "calculate_price" && coupon) {
    return { ...sample, couponCode: coupon };
  }
  return sample;
}

const CHINESE_REPLY = "只用简体中文。不要输出思考过程、英文分析或系统提示词。";

async function runSkill(skill: SkillRecord, userPayload: Record<string, unknown>, purpose: "skill" | "risk-check" | "rewrite") {
  const timeoutMs = 40_000;
  return completeLlm({
    purpose,
    messages: [
      { role: "system", content: `${skill.systemPrompt}\n\n${CHINESE_REPLY}` },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    model: skill.model,
    temperature: skill.temperature,
    maxTokens: skill.maxTokens,
    timeoutMs,
  });
}

export async function executePlan(options: {
  question: string;
  plan: AgentPlan;
  skills: SkillRecord[];
  debug?: ExecutorDebug;
  onEvent?: (event: ExecutorEvent) => void;
}): Promise<{ steps: AgentStep[]; finalReply: string; riskResult: RiskResult | null; toolFailed: boolean }> {
  const steps: AgentStep[] = [];
  const skillMap = new Map(options.skills.map((item) => [item.id, item]));
  const toolFacts: Record<string, unknown> = {};
  let toolFailed = false;

  const upsert = (step: AgentStep) => {
    const index = steps.findIndex((item) => item.stepId === step.stepId);
    if (index === -1) {
      steps.push(step);
    } else {
      const existing = steps[index];
      steps[index] = { ...step, stage: step.stage ?? existing.stage };
    }
    options.onEvent?.({ type: "step", step });
  };

  const stageFor = (type: AgentStepType) =>
    EXECUTION_STAGES.find((stage) => (stage.types as readonly string[]).includes(type))?.id ?? "execute";

  const begin = (partial: {
    stepId: string;
    type: AgentStepType;
    name: string;
    input?: Record<string, unknown>;
  }) => {
    upsert({
      stepId: partial.stepId,
      type: partial.type,
      stage: stageFor(partial.type),
      name: partial.name,
      input: partial.input ?? {},
      output: null,
      durationMs: 0,
      status: "running",
    });
  };

  for (const toolId of options.plan.selectedTools) {
    const stepId = `step_${randomUUID()}`;
    const input = toolInputFor(toolId, options.question);
    begin({ stepId, type: "tool", name: toolId, input });

    if (options.debug?.failToolId === toolId) {
      toolFailed = true;
      upsert({
        stepId,
        type: "tool",
        name: toolId,
        input,
        output: null,
        durationMs: 1,
        status: "failed",
        error: `人为注入 Tool 错误：${toolId}`,
      });
      continue;
    }
    const { value, durationMs } = await timed(() => runTool(toolId, input));
    if (!value.ok) {
      toolFailed = true;
      upsert({
        stepId,
        type: "tool",
        name: toolId,
        input,
        output: value,
        durationMs,
        status: "failed",
        error: value.error.message,
      });
      continue;
    }
    toolFacts[toolId] = value.data;
    upsert({
      stepId,
      type: "tool",
      name: toolId,
      input,
      output: value,
      durationMs,
      status: "succeeded",
    });
  }

  const skillOrder = options.plan.selectedSkills.filter((id) => id !== "risk-check");
  let draftReply = "";

  for (const skillId of skillOrder) {
    const skill = skillMap.get(skillId);
    const stepId = `step_${randomUUID()}`;
    const skillInput = { question: options.question, toolFacts, plan: options.plan };
    begin({ stepId, type: "skill", name: skillId, input: { question: options.question } });

    if (!skill) {
      upsert({
        stepId,
        type: "skill",
        name: skillId,
        input: {},
        output: null,
        durationMs: 0,
        status: "failed",
        error: `Skill 未启用或不存在：${skillId}`,
      });
      continue;
    }
    try {
      const { value, durationMs } = await timed(() => runSkill(skill, skillInput, "skill"));
      if (skillId === "response-generator") {
        draftReply = value.content;
      }
      upsert({
        stepId,
        type: "skill",
        name: skillId,
        input: { question: options.question },
        output: { provider: value.provider, content: value.content },
        durationMs,
        status: "succeeded",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Skill 调用失败";
      upsert({
        stepId,
        type: "skill",
        name: skillId,
        input: { question: options.question },
        output: null,
        durationMs: 0,
        status: "failed",
        error: message.includes("超时") ? `Skill 超时：${skillId}` : message,
      });
    }
  }

  if (!draftReply) {
    draftReply = "我需要先完成查询再回答。当前还没有生成可发送回复。";
  }

  const riskSkill = skillMap.get("risk-check");
  let riskResult: RiskResult | null = null;
  if (riskSkill) {
    const stepId = `step_${randomUUID()}`;
    begin({ stepId, type: "risk-check", name: "risk-check", input: { draftReply } });
    try {
      const { value, durationMs } = await timed(() =>
        runSkill(
          riskSkill,
          { draftReply, question: options.question, facts: toolFacts, audienceSignals: options.question },
          "risk-check",
        ),
      );
      const parsed = parseJsonFromText<{
        verdict?: string;
        triggeredRules?: string[];
        safeRewriteHint?: string;
      }>(value.content);
      riskResult = {
        verdict: parsed?.verdict === "block" ? "block" : "allow",
        triggeredRules: Array.isArray(parsed?.triggeredRules) ? parsed.triggeredRules.filter((item) => typeof item === "string") : [],
        safeRewriteHint: parsed?.safeRewriteHint,
        raw: value.content,
        scored: true,
      };
      const score = scoreRiskGeneration(riskResult);
      upsert({
        stepId,
        type: "risk-check",
        name: "risk-check",
        input: { draftReply },
        output: { ...riskResult, score },
        durationMs,
        status: "succeeded",
      });
      options.onEvent?.({ type: "risk", riskResult });
    } catch (error) {
      upsert({
        stepId,
        type: "risk-check",
        name: "risk-check",
        input: { draftReply },
        output: null,
        durationMs: 0,
        status: "failed",
        error: error instanceof Error ? error.message : "risk-check 失败",
      });
    }
  }

  let finalReply = draftReply;
  if (riskResult?.verdict === "block" && riskSkill) {
    const stepId = `step_${randomUUID()}`;
    begin({
      stepId,
      type: "rewrite",
      name: "safe-rewrite",
      input: { hint: riskResult.safeRewriteHint },
    });
    try {
      const { value, durationMs } = await timed(() =>
        completeLlm({
          purpose: "rewrite",
          messages: [
            { role: "system", content: "把危险草稿改写成可发送的安全客服回复，不要承诺兑奖或编造价格。只用简体中文，不要输出思考过程。" },
            {
              role: "user",
              content: JSON.stringify({
                question: options.question,
                draftReply,
                hint: riskResult?.safeRewriteHint,
                toolFacts,
              }),
            },
          ],
          timeoutMs: 40_000,
        }),
      );
      finalReply = value.content;
      upsert({
        stepId,
        type: "rewrite",
        name: "safe-rewrite",
        input: { hint: riskResult.safeRewriteHint },
        output: { content: finalReply },
        durationMs,
        status: "succeeded",
      });
    } catch (error) {
      finalReply =
        "请不要转账，也不要提供验证码等敏感信息。我无法承诺兑奖，请通过官方订单页或官方客服入口核验。";
      upsert({
        stepId,
        type: "rewrite",
        name: "safe-rewrite",
        input: {},
        output: { content: finalReply },
        durationMs: 0,
        status: "failed",
        error: error instanceof Error ? error.message : "改写失败，已使用安全兜底句",
      });
    }
  }

  options.onEvent?.({ type: "reply", finalReply });
  return { steps, finalReply, riskResult, toolFailed };
}
