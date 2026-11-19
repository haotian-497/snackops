import "server-only";

import { randomUUID } from "node:crypto";

import { inferMandatoryCapabilities } from "@/lib/agent/capabilities";
import { executePlan, type ExecutorDebug } from "@/lib/agent/executor";
import { createPlan, type ConversationTurn } from "@/lib/agent/planner";
import { saveRunRecord } from "@/lib/agent/runs";
import { scorePlanGeneration } from "@/lib/agent/score";
import { LlmConfigError, loadLlmConfig, resolveProviderId } from "@/lib/llm";
import { hashSkillSnapshot } from "@/lib/skills/hash";
import { listEnabledSkills } from "@/lib/skills/registry";
import { listEnabledTools, listTools } from "@/lib/tools/registry";
import type { AgentEvent } from "@/lib/agent/events";
import type { RunRecord, RunStatus, Tool } from "@/lib/types";

export type { AgentEvent } from "@/lib/agent/events";

export type RunAgentInput = {
  question: string;
  source: RunRecord["source"];
  conversationId?: string;
  conversationHistory?: ConversationTurn[];
  debug?: ExecutorDebug;
  retryOf?: string;
  /** 按 skillId 临时覆盖 systemPrompt，不写磁盘 */
  skillPromptOverrides?: Record<string, string>;
  /** 临时覆盖 Planner prompt，不写磁盘 */
  plannerPromptOverride?: string;
  /** 临时覆盖 Tool description / enabled，不写磁盘 */
  toolOverrides?: Record<string, { description?: string; enabled?: boolean }>;
};

function applyToolOverrides(
  enabledTools: Tool[],
  allTools: Tool[],
  overrides: Record<string, { description?: string; enabled?: boolean }>,
): Tool[] {
  if (Object.keys(overrides).length === 0) return enabledTools;
  const byId = new Map(allTools.map((tool) => [tool.id, tool]));
  const result: Tool[] = [];

  for (const tool of enabledTools) {
    const patch = overrides[tool.id];
    if (patch?.enabled === false) continue;
    result.push({
      ...tool,
      description: patch?.description ?? tool.description,
      enabled: true,
    });
  }

  for (const [id, patch] of Object.entries(overrides)) {
    if (patch.enabled !== true) continue;
    if (result.some((tool) => tool.id === id)) continue;
    const base = byId.get(id);
    if (!base) continue;
    result.push({
      ...base,
      description: patch.description ?? base.description,
      enabled: true,
    });
  }

  return result;
}

export async function runAgent(input: RunAgentInput, onEvent?: (event: AgentEvent) => void): Promise<RunRecord> {
  const started = Date.now();
  const id = `run_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const config = await loadLlmConfig();
  const provider = resolveProviderId(config);

  const toolOverrides = input.toolOverrides ?? {};
  const [baseSkills, enabledTools, allTools] = await Promise.all([
    listEnabledSkills(),
    listEnabledTools(),
    Object.keys(toolOverrides).length ? listTools() : Promise.resolve([] as Tool[]),
  ]);
  const skillOverrides = input.skillPromptOverrides ?? {};
  const skills = baseSkills.map((skill) =>
    skillOverrides[skill.id] !== undefined ? { ...skill, systemPrompt: skillOverrides[skill.id] } : skill,
  );
  const tools = applyToolOverrides(enabledTools, allTools.length ? allTools : enabledTools, toolOverrides);
  const mandatoryCapabilities = inferMandatoryCapabilities(input.question);

  let status: RunStatus = "running";
  let error: string | undefined;
  let record: RunRecord = {
    id,
    question: input.question,
    source: input.source,
    conversationId: input.conversationId || `conv_${randomUUID()}`,
    createdAt,
    status,
    finalReply: "",
    plan: null,
    steps: [],
    riskResult: null,
    durationMs: 0,
    provider,
    model: config.model,
    skillVersions: skills.map((skill) => ({
      skillId: skill.id,
      version: skill.version,
      hash: hashSkillSnapshot(skill, skill.systemPrompt),
    })),
    toolVersions: tools.map((tool) => ({
      toolId: tool.id,
      enabled: tool.enabled,
      timeoutMs: tool.timeoutMs,
    })),
  };

  try {
    const planned = await createPlan({
      userInput: input.question,
      conversationHistory: input.conversationHistory ?? [],
      availableSkills: skills,
      availableTools: tools,
      mandatoryCapabilities,
      plannerPrompt: input.plannerPromptOverride,
    });
    const scored = scorePlanGeneration(planned.plan, skills, tools);
    onEvent?.({ type: "plan", plan: planned.plan, validation: scored.validation });

    const plannerStepId = `step_${randomUUID()}`;
    const validatorStepId = `step_${randomUUID()}`;
    onEvent?.({
      type: "step",
      step: {
        stepId: plannerStepId,
        type: "planner",
        stage: "plan",
        name: planned.fallback ? "planner-fallback" : "planner",
        input: { mandatoryCapabilities },
        output: null,
        durationMs: 0,
        status: "running",
      },
    });
    const plannerStep = {
      stepId: plannerStepId,
      type: "planner" as const,
      stage: "plan" as const,
      name: planned.fallback ? "planner-fallback" : "planner",
      input: { mandatoryCapabilities },
      output: { raw: planned.raw, plan: planned.plan, score: scored.report },
      durationMs: 0,
      status: "succeeded" as const,
    };
    onEvent?.({ type: "step", step: plannerStep });

    onEvent?.({
      type: "step",
      step: {
        stepId: validatorStepId,
        type: "validator",
        stage: "validate",
        name: "plan-validator",
        input: { plan: planned.plan },
        output: null,
        durationMs: 0,
        status: "running",
      },
    });
    const validatorStep = {
      stepId: validatorStepId,
      type: "validator" as const,
      stage: "validate" as const,
      name: "plan-validator",
      input: { plan: planned.plan },
      output: scored,
      durationMs: 0,
      status: (scored.validation.ok ? "succeeded" : "failed") as "succeeded" | "failed",
      error: scored.validation.ok ? undefined : scored.report.details.join("；"),
    };
    onEvent?.({ type: "step", step: validatorStep });

    record = {
      ...record,
      plan: planned.plan,
      validation: scored.validation,
      steps: [plannerStep, validatorStep],
    };

    if (scored.validation.blocked || !scored.validation.ok) {
      status = "failed";
      error = scored.report.details.join("；") || "计划校验未通过，已停止执行，不会伪装成功。";
      record = { ...record, status, error, finalReply: "", durationMs: Date.now() - started };
      await saveRunRecord(record);
      onEvent?.({ type: "error", message: error });
      onEvent?.({ type: "done", run: record });
      return record;
    }

    const executed = await executePlan({
      question: input.question,
      plan: planned.plan,
      skills,
      debug: input.debug,
      onEvent: (event) => {
        if (event.step) onEvent?.({ type: "step", step: event.step });
        if (event.riskResult) onEvent?.({ type: "risk", riskResult: event.riskResult });
        if (event.finalReply) onEvent?.({ type: "reply", finalReply: event.finalReply });
      },
    });

    if (executed.toolFailed) {
      status = "failed";
      error = executed.steps.find((step) => step.type === "tool" && step.status === "failed")?.error || "Tool 执行失败";
    } else if (planned.plan.handoff) {
      status = "handed_off";
    } else {
      status = "succeeded";
    }

    record = {
      ...record,
      status,
      error,
      finalReply: executed.finalReply,
      steps: [...record.steps, ...executed.steps],
      riskResult: executed.riskResult,
      durationMs: Date.now() - started,
    };
  } catch (caught) {
    status = "failed";
    error = caught instanceof Error ? caught.message : "Agent 运行失败";
    if (caught instanceof LlmConfigError) {
      error = `${caught.message} ${caught.hint}`;
    }
    record = { ...record, status, error, durationMs: Date.now() - started };
    onEvent?.({
      type: "error",
      message: error,
      hint: caught instanceof LlmConfigError ? caught.hint : undefined,
      code: caught instanceof LlmConfigError ? caught.code : undefined,
      provider: caught instanceof LlmConfigError ? caught.provider : undefined,
    });
  }

  await saveRunRecord(record);
  onEvent?.({ type: "done", run: record });
  return record;
}
