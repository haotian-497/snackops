import { z } from "zod";

const keywordGroupSchema = z.object({
  op: z.enum(["and", "or"]),
  terms: z.array(z.string().min(1)).min(1),
});

export const evalCaseFieldsSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  question: z.string().min(1).optional(),
  userUtterance: z.string().min(1).optional(),
  category: z.string().optional(),
  scenario: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  expectedBehavior: z.string().optional(),
  expectedReply: z.string().optional(),
  expectedKeywords: z.array(z.union([z.string(), keywordGroupSchema])).optional(),
  forbiddenWords: z.array(z.string()).optional(),
  expectedPrice: z.number().optional(),
  expectReplySafe: z.boolean().optional(),
  expectSendAllowed: z.boolean().optional(),
  expectInputRisk: z.boolean().optional(),
  expectRiskPassed: z.boolean().optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  forbiddenCapabilities: z.array(z.string()).optional(),
  evalDimension: z.string().optional(),
  llmJudgePrompt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sourceRunId: z.string().optional(),
  enabled: z.boolean().optional(),
  expectedIntent: z.string().optional(),
  expectedSkillId: z.string().optional(),
  copyFrom: z.string().optional(),
});

export const evalCaseCreateSchema = evalCaseFieldsSchema.refine(
  (value) => Boolean(value.question || value.userUtterance || value.copyFrom || value.sourceRunId),
  { message: "必须提供 question、copyFrom 或 sourceRunId" },
);

export const evalRuleProbeSchema = z.object({
  question: z.string().min(1),
  replies: z
    .array(
      z.object({
        label: z.string().min(1),
        text: z.string().min(1),
      }),
    )
    .min(1)
    .max(4),
});

export const evalScoreSchema = z.object({
  caseId: z.string().min(1),
  runId: z.string().optional(),
  error: z.object({ message: z.string(), code: z.string().optional() }).optional(),
});

export const evalBatchRunSchema = z.object({
  name: z.string().min(1).optional(),
  versionLabel: z.string().min(1).optional(),
  changeNote: z.string().optional(),
  caseIds: z.array(z.string()).nullable().optional(),
  saveOnComplete: z.boolean().optional(),
});

export const evalBatchPatchSchema = z
  .object({
    saved: z.boolean().optional(),
    saveOnComplete: z.boolean().optional(),
  })
  .refine((value) => value.saved !== undefined || value.saveOnComplete !== undefined, {
    message: "至少提供 saved 或 saveOnComplete",
  });

export const evalCompareQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const judgeConfigPutSchema = z.object({
  systemPrompt: z.string().max(20000),
});
