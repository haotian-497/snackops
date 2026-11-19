import "server-only";

import { getJudgeConfig } from "@/lib/eval/judge-config";
import { attachJudge, EMPTY_JUDGE_DIMENSIONS, parseJudgeContent } from "@/lib/eval/judge-parse";
import { completeLlm } from "@/lib/llm";
import type { EvalCase, EvalScoreResult, LlmJudgeResult, RunRecord } from "@/lib/types";

export { attachJudge, EMPTY_JUDGE_DIMENSIONS, parseJudgeContent } from "@/lib/eval/judge-parse";

export async function runLlmJudge(input: {
  case: EvalCase;
  run?: RunRecord | null;
  score?: EvalScoreResult;
}): Promise<LlmJudgeResult> {
  const reply = input.run?.finalReply ?? "";
  const extra = input.case.llmJudgePrompt?.trim();
  const score = input.score;
  const judgeConfig = await getJudgeConfig();
  const response = await completeLlm({
    purpose: "judge",
    temperature: 0.1,
    maxTokens: 800,
    messages: [
      {
        role: "system",
        content: extra ? `${judgeConfig.systemPrompt}\n补充评分要求：${extra}` : judgeConfig.systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify({
          question: input.case.question,
          expectedBehavior: input.case.expectedBehavior,
          expectedReply: input.case.expectedReply || "",
          expectedKeywords: input.case.expectedKeywords ?? [],
          forbiddenWords: input.case.forbiddenWords ?? [],
          expectedSkillId: input.case.expectedSkillId || "",
          extraRubric: extra || "",
          finalReply: reply,
          scoringNotes: input.case.expectedReply?.trim()
            ? "若提供了 expectedReply（人工金标），请对照金标评估正确性/完整性/语气，但不要因措辞不完全一致就直接给最低分。"
            : "",
          ruleScore: score
            ? {
                status: score.status,
                reason: score.reason,
                safetyHardFail: score.safetyHardFail,
                qualityFail: score.qualityFail,
                keywordHits: score.keywordHits,
                keywordMisses: score.keywordMisses,
                forbiddenHits: score.forbiddenHits,
                replySafe: score.replySafe,
                riskIssues: score.riskIssues,
              }
            : undefined,
        }),
      },
    ],
  });
  const parsed = parseJudgeContent(response.content);
  return {
    enabled: true,
    status: "ok",
    ...parsed,
    provider: response.provider,
    model: response.model,
    fixture: response.fixture,
  };
}

export async function scoreEvalWithJudge(
  score: EvalScoreResult,
  input: { case: EvalCase; run?: RunRecord | null },
): Promise<EvalScoreResult> {
  if (score.status === "ERROR" || !input.run?.finalReply) {
    return attachJudge(score, {
      enabled: true,
      status: "skipped",
      overall: 0,
      dimensions: EMPTY_JUDGE_DIMENSIONS,
      rationale: score.status === "ERROR" ? "系统错误，跳过 Judge" : "没有最终回复，跳过 Judge",
      highlights: [],
      issues: [],
    });
  }
  try {
    const judge = await runLlmJudge({ ...input, score });
    return attachJudge(score, judge);
  } catch (error) {
    return attachJudge(score, {
      enabled: true,
      status: "error",
      overall: 0,
      dimensions: EMPTY_JUDGE_DIMENSIONS,
      rationale: "",
      highlights: [],
      issues: [],
      error: error instanceof Error ? error.message : "Judge 调用失败",
    });
  }
}
