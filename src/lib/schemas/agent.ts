import { z } from "zod";

export const conversationTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const agentRunSchema = z.object({
  question: z.string().min(1),
  source: z.enum(["workbench", "demo", "retry", "eval"]).default("workbench"),
  conversationId: z.string().optional(),
  conversationHistory: z.array(conversationTurnSchema).optional(),
  debug: z
    .object({
      failToolId: z.string().optional(),
    })
    .optional(),
});

export const runRetrySchema = z.object({
  runId: z.string().min(1),
});

export const handoffSchema = z.object({
  reason: z.string().min(1),
});

export const annotateSchema = z.object({
  label: z.string().min(1),
  note: z.string().min(1),
  createdBy: z.string().optional(),
});

export const explainSchema = z.object({
  runId: z.string().min(1),
  focus: z.enum(["run", "risk"]).optional(),
});
