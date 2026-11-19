import { z } from "zod";

const scoreField = z.number().min(1).max(5).optional();

export const ratingCreateSchema = z.object({
  runId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  issueType: z.string().optional(),
  channel: z.enum(["user", "ops"]).optional(),
  createdBy: z.string().optional(),
});

export const annotationCreateSchema = z.object({
  runId: z.string().min(1),
  label: z.string().min(1),
  note: z.string().optional().default(""),
  createdBy: z.string().optional(),
  status: z.enum(["pending", "accepted", "rejected"]).optional(),
  scores: z
    .object({
      correctness: scoreField,
      relevance: scoreField,
      completeness: scoreField,
      safety: scoreField,
      tone: scoreField,
      overall: scoreField,
    })
    .optional(),
  goldReply: z.string().optional(),
  promote: z.array(z.enum(["improvement", "eval"])).optional(),
});

export const annotationPatchSchema = annotationCreateSchema.partial().omit({ runId: true });

export const generatePromptSchema = z.object({
  improvementId: z.string().min(1),
  skillId: z.string().optional(),
  mode: z.enum(["rule", "llm"]).optional(),
});

export const applyPromptSchema = z.object({
  improvementId: z.string().min(1),
  skillId: z.string().optional(),
});

export const improvementCreateSchema = z.object({
  title: z.string().min(1),
  source: z.enum(["rating", "annotation", "eval", "bad_case"]),
  issueType: z.string().min(1).optional(),
  runId: z.string().optional(),
  skillId: z.string().optional(),
  note: z.string().optional(),
  owner: z.string().optional(),
  target: z.enum(["planner", "skill", "tool", "eval"]).optional(),
});

export const improvementPatchSchema = z.object({
  owner: z.string().min(1).optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
  note: z.string().optional(),
  skillId: z.string().optional(),
  title: z.string().min(1).optional(),
  target: z.enum(["planner", "skill", "tool", "eval"]).optional(),
  diagnosisConfirmed: z.boolean().optional(),
});

export const improvementSplitSchema = z.object({
  improvementId: z.string().min(1),
  runIds: z.array(z.string().min(1)).min(1),
});

export const improvementIdSchema = z.object({
  improvementId: z.string().min(1),
});

export const abTestCreateSchema = z.object({
  name: z.string().min(1),
  controlSkillId: z.string().min(1),
  treatmentSkillId: z.string().min(1),
  trafficPct: z.number().min(1).max(100),
  status: z.enum(["draft", "running", "stopped"]).optional(),
});

export const abTestPatchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  trafficPct: z.number().min(1).max(100).optional(),
  status: z.enum(["draft", "running", "stopped"]).optional(),
});

export const evalCaseCreateSchema = z.object({
  title: z.string().optional(),
  userUtterance: z.string().optional(),
  expectedIntent: z.string().optional(),
  expectedSkillId: z.string().optional(),
  sourceRunId: z.string().optional(),
});

export const rollbackSchema = z.object({
  versionId: z.string().min(1),
});

export const rollbackActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rollback-skill"), skillId: z.string().min(1), versionId: z.string().min(1) }),
  z.object({ action: z.literal("rollback-planner"), versionId: z.string().min(1) }),
  z.object({ action: z.literal("rollback-tool"), toolId: z.string().min(1), versionId: z.string().min(1) }),
  z.object({ action: z.literal("rollback-judge"), versionId: z.string().min(1) }),
  z.object({ action: z.literal("rollback-llm"), versionId: z.string().min(1) }),
  z.object({ action: z.literal("delete-skill-version"), skillId: z.string().min(1), versionId: z.string().min(1) }),
  z.object({ action: z.literal("delete-planner-version"), versionId: z.string().min(1) }),
  z.object({ action: z.literal("delete-tool-version"), toolId: z.string().min(1), versionId: z.string().min(1) }),
  z.object({ action: z.literal("delete-judge-version"), versionId: z.string().min(1) }),
  z.object({ action: z.literal("delete-llm-version"), versionId: z.string().min(1) }),
  z.object({ action: z.literal("undo-promote"), experimentId: z.string().min(1) }),
  z.object({ action: z.literal("restore-batch"), batchId: z.string().min(1) }),
  z.object({ action: z.literal("set-skill-enabled"), skillId: z.string().min(1), enabled: z.boolean() }),
  z.object({ action: z.literal("set-tool-enabled"), toolId: z.string().min(1), enabled: z.boolean() }),
]);
