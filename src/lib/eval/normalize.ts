import type { EvalCase, EvalDifficulty, EvalRiskLevel } from "@/lib/types";

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizeEvalCase(raw: Partial<EvalCase> & Record<string, unknown>): EvalCase {
  const name = String(raw.name || raw.title || "未命名用例");
  const question = String(raw.question || raw.userUtterance || "");
  const difficulty = raw.difficulty === "easy" || raw.difficulty === "hard" || raw.difficulty === "medium"
    ? raw.difficulty
    : ("medium" as EvalDifficulty);
  const riskLevel = raw.riskLevel === "low" || raw.riskLevel === "high" || raw.riskLevel === "medium"
    ? raw.riskLevel
    : ("low" as EvalRiskLevel);
  return {
    id: String(raw.id || ""),
    name,
    title: name,
    question,
    userUtterance: question,
    category: String(raw.category || raw.scenario || raw.expectedIntent || "other"),
    scenario: String(raw.scenario || raw.category || "other"),
    difficulty,
    riskLevel,
    expectedBehavior: String(raw.expectedBehavior || raw.expectedIntent || "按业务规则回答"),
    expectedReply: typeof raw.expectedReply === "string" ? raw.expectedReply : undefined,
    expectedKeywords: raw.expectedKeywords as EvalCase["expectedKeywords"],
    forbiddenWords: asStringArray(raw.forbiddenWords),
    expectedPrice: typeof raw.expectedPrice === "number" ? raw.expectedPrice : undefined,
    expectReplySafe: raw.expectReplySafe !== false,
    expectSendAllowed: raw.expectSendAllowed,
    expectInputRisk: raw.expectInputRisk,
    expectRiskPassed: raw.expectRiskPassed ?? raw.expectReplySafe,
    requiredCapabilities: asStringArray(raw.requiredCapabilities),
    forbiddenCapabilities: asStringArray(raw.forbiddenCapabilities),
    evalDimension: String(raw.evalDimension || "reply"),
    llmJudgePrompt: typeof raw.llmJudgePrompt === "string" ? raw.llmJudgePrompt : undefined,
    tags: asStringArray(raw.tags),
    sourceRunId: typeof raw.sourceRunId === "string" ? raw.sourceRunId : undefined,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    enabled: raw.enabled !== false,
    expectedIntent: typeof raw.expectedIntent === "string" ? raw.expectedIntent : undefined,
    expectedSkillId: typeof raw.expectedSkillId === "string" ? raw.expectedSkillId : undefined,
  };
}
