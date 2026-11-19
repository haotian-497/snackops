import "server-only";

import type { LlmProviderId } from "@/lib/types";
import { readJson } from "@/lib/store";
import type { LlmConfig } from "@/lib/types";

export const LLM_PROVIDER_IDS = ["demo", "openai-compatible"] as const;

export function isLlmProviderId(value: string): value is LlmProviderId {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Map legacy IDs so old env / config still resolve. */
export function normalizeProviderId(raw: string): string {
  const value = String(raw || "").trim();
  if (value === "classroom-fixture") return "demo";
  return value;
}

const RETIRED_KIMI_MODELS = new Set(["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"]);

export function normalizeModelId(provider: string, model: string): string {
  const value = String(model || "").trim();
  if (provider === "demo" && (value === "classroom-fixture-v1" || !value)) return "demo-v1";
  if (RETIRED_KIMI_MODELS.has(value)) return "kimi-k3";
  return value;
}

export async function loadLlmConfig(): Promise<LlmConfig> {
  const file = await readJson<LlmConfig>("llm-config.json");
  const provider = normalizeProviderId(
    file.provider || process.env.LLM_PROVIDER?.trim() || "demo",
  );
  const model = normalizeModelId(
    provider,
    file.model || process.env.LLM_MODEL?.trim() || (provider === "demo" ? "demo-v1" : "deepseek-v4-flash"),
  );
  return {
    ...file,
    provider,
    model,
  };
}

export function resolveProviderId(config: LlmConfig): LlmProviderId {
  const provider = normalizeProviderId(String(config.provider || ""));
  if (isLlmProviderId(provider)) {
    return provider;
  }
  throw new Error(`未知 LLM provider：${provider || "空"}。允许值：${LLM_PROVIDER_IDS.join("、")}`);
}
