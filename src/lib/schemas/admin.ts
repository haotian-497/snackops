import { z } from "zod";

import { LLM_PROVIDER_IDS } from "@/lib/llm/config";

export const plannerPatchSchema = z.object({
  version: z.string().min(1).optional(),
  enabledSkillIds: z.array(z.string()).optional(),
  enabledToolIds: z.array(z.string()).optional(),
  mandatoryCapabilities: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  changeNote: z.string().optional(),
});

export const plannerPreviewSchema = z.object({
  question: z.string().min(1),
  enabledSkillIds: z.array(z.string()).optional(),
  enabledToolIds: z.array(z.string()).optional(),
  mandatoryCapabilities: z.array(z.string()).optional(),
});

export const llmConfigPutSchema = z.object({
  provider: z.enum(LLM_PROVIDER_IDS).optional(),
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  apiKey: z.string().optional().nullable(),
  clearApiKey: z.boolean().optional(),
  baseUrl: z.string().optional(),
  vendorPresetId: z.string().optional(),
});

export const llmSwitchSchema = z.object({
  provider: z.enum(LLM_PROVIDER_IDS),
  model: z.string().min(1).optional(),
});

export const llmTestSchema = z.object({
  provider: z.enum(LLM_PROVIDER_IDS).optional(),
});
