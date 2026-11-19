import "server-only";

import { completeLlm } from "@/lib/llm";
import { readSkillPrompt } from "@/lib/skills/files";
import type { AgentPlan, PlanRiskJudgment, SkillRecord, Tool } from "@/lib/types";
import { parseJsonFromText } from "@/lib/agent/json";

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type PlannerInput = {
  userInput: string;
  conversationHistory: ConversationTurn[];
  availableSkills: SkillRecord[];
  availableTools: Tool[];
  mandatoryCapabilities: string[];
  /** 覆盖磁盘上的 planner.md，不写生产 */
  plannerPrompt?: string;
};

export const DEFAULT_PLANNER_PROMPT = `你是零食客服 Agent 的 Planner。只输出一个 JSON 对象，不要 Markdown。
字段：
- selectedSkills: string[] 只能从 availableSkills 的 id 里选（Skill = 推理/话术能力，如 need-extraction、response-generator、risk-check）
- selectedTools: string[] 只能从 availableTools 的 id 里选（Tool = 查数接口，id 使用下划线，如 query_logistics）
- reasoning: string
- mandatoryCapabilities: string[] 原样带回
- risk: { level: low|medium|high, needsRiskCheck: boolean, notes: string }
- handoff?: boolean
- handoffReason?: string
- degradation?: string

硬性区分（禁止混淆）：
- 查商品/活动/券/订单/物流/算价 → 一律放进 selectedTools，禁止放进 selectedSkills
- 正确示例：快递到哪了 → selectedTools 含 "query_logistics"；不要写 "query-logistics"，也不要当 Skill
- Skill 与 Tool 的 id 不可互换；不要自造 id，不要把连字符版 Tool 名写进 Skills

规则：
1. 涉及价格必须在 selectedTools 选 calculate_price 或 query_coupons（若已启用）。
2. 涉及订单必须在 selectedTools 选 query_orders；涉及物流/快递必须在 selectedTools 选 query_logistics。
3. 风险/诈骗/投诉必须在 selectedSkills 包含 risk-check，或明确 handoff。
4. 无法满足强制能力时设置 degradation 或 handoff，不要假装能完成。
5. 不要选择未出现在可用列表中的 id。
6. availableSkills / availableTools 含 id、name、description，请结合描述选择。
7. 常规回复链路还应包含 need-extraction、response-generator（若已启用）。`;

const PLANNER_SYSTEM = DEFAULT_PLANNER_PROMPT;

export async function loadPlannerPrompt(): Promise<string> {
  try {
    return await readSkillPrompt("planner.md");
  } catch {
    return PLANNER_SYSTEM;
  }
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function idAliases(id: string) {
  const base = id.trim();
  if (!base) return [];
  return [...new Set([base, base.replaceAll("-", "_"), base.replaceAll("_", "-")])];
}

/** Move Tool ids (and hyphen aliases) out of selectedSkills into selectedTools. */
export function sanitizePlanSelections(
  selectedSkills: string[],
  selectedTools: string[],
  availableSkills: SkillRecord[],
  availableTools: Tool[],
): { selectedSkills: string[]; selectedTools: string[] } {
  const skillIds = new Set(availableSkills.map((item) => item.id));
  const toolByAlias = new Map<string, string>();
  for (const tool of availableTools) {
    for (const alias of idAliases(tool.id)) {
      toolByAlias.set(alias, tool.id);
    }
  }
  const skillByAlias = new Map<string, string>();
  for (const skill of availableSkills) {
    for (const alias of idAliases(skill.id)) {
      skillByAlias.set(alias, skill.id);
    }
  }

  const skills = new Set<string>();
  const tools = new Set<string>();

  const place = (rawId: string, prefer: "skill" | "tool") => {
    const asTool = toolByAlias.get(rawId.trim());
    const asSkill = skillByAlias.get(rawId.trim());
    if (prefer === "tool") {
      if (asTool) {
        tools.add(asTool);
        return;
      }
      if (asSkill) {
        skills.add(asSkill);
        return;
      }
    } else {
      // Prefer skill only if it is a real skill; otherwise remapped tools win.
      if (asSkill && skillIds.has(asSkill) && !asTool) {
        skills.add(asSkill);
        return;
      }
      if (asTool) {
        tools.add(asTool);
        return;
      }
      if (asSkill) {
        skills.add(asSkill);
        return;
      }
    }
    // Unknown: keep on the declared side so validator can surface it.
    if (prefer === "tool") tools.add(rawId.trim());
    else skills.add(rawId.trim());
  };

  for (const id of selectedTools) place(id, "tool");
  for (const id of selectedSkills) place(id, "skill");

  return { selectedSkills: [...skills], selectedTools: [...tools] };
}

function ensureMandatoryTools(plan: AgentPlan, availableTools: Tool[]): AgentPlan {
  const enabled = new Set(availableTools.filter((item) => item.enabled !== false).map((item) => item.id));
  const tools = new Set(plan.selectedTools);
  const addIfEnabled = (id: string) => {
    if (enabled.has(id)) tools.add(id);
  };

  if (plan.mandatoryCapabilities.includes("logistics")) addIfEnabled("query_logistics");
  if (plan.mandatoryCapabilities.includes("order")) addIfEnabled("query_orders");
  if (plan.mandatoryCapabilities.includes("price")) {
    if (!tools.has("calculate_price") && !tools.has("query_coupons")) {
      if (enabled.has("calculate_price")) addIfEnabled("calculate_price");
      else addIfEnabled("query_coupons");
    }
  }

  return { ...plan, selectedTools: [...tools] };
}

function fallbackPlan(input: PlannerInput, reason: string): AgentPlan {
  const skillIds = input.availableSkills.map((item) => item.id);
  const pick = (...ids: string[]) => ids.filter((id) => skillIds.includes(id));
  const risk: PlanRiskJudgment = {
    level: input.mandatoryCapabilities.includes("risk") ? "high" : "medium",
    needsRiskCheck: true,
    notes: reason,
  };
  const base: AgentPlan = {
    selectedSkills: pick("need-extraction", "clarification-question", "response-generator", "risk-check"),
    selectedTools: [],
    reasoning: reason,
    mandatoryCapabilities: input.mandatoryCapabilities,
    risk,
    degradation: "planner_json_fallback",
    handoff: input.mandatoryCapabilities.includes("risk"),
    handoffReason: input.mandatoryCapabilities.includes("risk") ? "计划解析失败且存在风险输入，转人工核验。" : undefined,
  };
  return ensureMandatoryTools(base, input.availableTools);
}

function normalizePlan(raw: Record<string, unknown>, input: PlannerInput): AgentPlan {
  const riskRaw = raw.risk && typeof raw.risk === "object" ? (raw.risk as Record<string, unknown>) : {};
  const level = riskRaw.level === "high" || riskRaw.level === "medium" || riskRaw.level === "low" ? riskRaw.level : "medium";
  const sanitized = sanitizePlanSelections(
    asStringArray(raw.selectedSkills),
    asStringArray(raw.selectedTools),
    input.availableSkills,
    input.availableTools,
  );
  const plan: AgentPlan = {
    selectedSkills: sanitized.selectedSkills,
    selectedTools: sanitized.selectedTools,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "Planner 未给出理由",
    mandatoryCapabilities: asStringArray(raw.mandatoryCapabilities).length
      ? asStringArray(raw.mandatoryCapabilities)
      : input.mandatoryCapabilities,
    risk: {
      level,
      needsRiskCheck: riskRaw.needsRiskCheck !== false,
      notes: typeof riskRaw.notes === "string" ? riskRaw.notes : "",
    },
    degradation: typeof raw.degradation === "string" ? raw.degradation : undefined,
    handoff: raw.handoff === true,
    handoffReason: typeof raw.handoffReason === "string" ? raw.handoffReason : undefined,
  };
  return ensureMandatoryTools(plan, input.availableTools);
}

export async function createPlan(input: PlannerInput): Promise<{ plan: AgentPlan; raw: string; fallback: boolean }> {
  const payload = {
    userInput: input.userInput,
    conversationHistory: input.conversationHistory,
    availableSkills: input.availableSkills.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
    })),
    availableTools: input.availableTools.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
    })),
    mandatoryCapabilities: input.mandatoryCapabilities,
  };

  const systemPrompt = input.plannerPrompt?.trim() || (await loadPlannerPrompt());
  const response = await completeLlm({
    purpose: "planner",
    messages: [
      { role: "system", content: `${systemPrompt}\n\n只输出 JSON。字段用中文。不要输出思考过程或英文分析。` },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.1,
    maxTokens: 900,
    timeoutMs: 40_000,
  });

  const parsed = parseJsonFromText<Record<string, unknown>>(response.content);
  if (!parsed) {
    return { plan: fallbackPlan(input, "Planner JSON 解析失败，已降级为澄清与风险审核，页面不会崩溃。"), raw: response.content, fallback: true };
  }
  return { plan: normalizePlan(parsed, input), raw: response.content, fallback: false };
}
