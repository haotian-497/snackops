import { z } from "zod";

export const skillPatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  requiredTools: z.array(z.string()).optional(),
  version: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
  systemPrompt: z.string().optional(),
  changeNote: z.string().optional(),
  snapshotBefore: z.boolean().optional(),
});

export const skillVersionSaveSchema = z.object({
  changeNote: z.string().min(1),
  version: z.string().optional(),
});

export const toolPatchSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  changeNote: z.string().optional(),
});

export const toolTestSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
});
