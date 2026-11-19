import "server-only";

import { randomUUID } from "node:crypto";

import { assertProviderReady, completeLlm, loadLlmConfig, resolveProviderId } from "@/lib/llm";
import { LlmCallError, LlmConfigError } from "@/lib/llm/errors";
import { isLlmProviderId, normalizeModelId, normalizeProviderId } from "@/lib/llm/config";
import { allCompatibleModels, LLM_VENDOR_PRESETS } from "@/lib/llm/presets";
import {
  isDemoResetAllowed,
  maskApiKey,
  resolveOpenAiCredentials,
  saveLlmSecrets,
} from "@/lib/llm/secrets";
import { ensureJsonFile, updateJson, writeJson } from "@/lib/store";
import type { LlmConfig, LlmProviderId, LlmVersionSnapshot, PublicLlmConfig } from "@/lib/types";

export const PROVIDER_CATALOG: Record<
  LlmProviderId,
  { description: string; models: Array<{ id: string; label: string; demo?: boolean }> }
> = {
  demo: {
    description: "Demo 演示稳定模式：确定性输出，走完整 Planner / Tool / 风险链路，不调用外部模型。",
    models: [{ id: "demo-v1", label: "demo-v1（Demo 演示稳定）", demo: true }],
  },
  "openai-compatible": {
    description:
      "兼容 OpenAI Chat Completions 的真实模型。可在页面粘贴各厂商 API Key / Base URL，或使用环境变量。",
    models: allCompatibleModels(),
  },
};

function envFlag(name: string) {
  return process.env[name]?.trim() ? ("set" as const) : ("missing" as const);
}

export async function getPublicLlmConfig(): Promise<PublicLlmConfig> {
  const config = await loadLlmConfig();
  const provider = resolveProviderId(config);
  const catalog = PROVIDER_CATALOG[provider];
  const credentials = await resolveOpenAiCredentials();
  return {
    provider,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    updatedAt: config.updatedAt,
    mode: provider === "demo" ? "demo" : "live",
    modeLabel: provider === "demo" ? "Demo 演示稳定模式" : `真实 Provider：${provider}`,
    providerDescription: catalog.description,
    models: catalog.models,
    providers: (Object.keys(PROVIDER_CATALOG) as LlmProviderId[]).map((id) => ({
      id,
      description: PROVIDER_CATALOG[id].description,
      demo: id === "demo",
      models: PROVIDER_CATALOG[id].models,
    })),
    presets: LLM_VENDOR_PRESETS,
    connection: {
      apiKeySet: credentials.apiKeySource !== "missing",
      apiKeyMasked: credentials.apiKey ? maskApiKey(credentials.apiKey) : "",
      apiKeySource: credentials.apiKeySource,
      baseUrl: credentials.baseUrl,
      baseUrlSource: credentials.baseUrlSource,
      vendorPresetId: credentials.vendorPresetId,
      slots: credentials.slots,
    },
    allowDemoReset: isDemoResetAllowed(),
    env: {
      LLM_PROVIDER: envFlag("LLM_PROVIDER"),
      LLM_MODEL: envFlag("LLM_MODEL"),
      OPENAI_API_KEY: envFlag("OPENAI_API_KEY"),
      OPENAI_BASE_URL: envFlag("OPENAI_BASE_URL"),
    },
  };
}

export async function listLlmVersions(): Promise<LlmVersionSnapshot[]> {
  const versions = await ensureJsonFile<LlmVersionSnapshot[]>("llm-versions.json", []);
  return [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteLlmVersion(versionId: string): Promise<{ id: string }> {
  const versions = await listLlmVersions();
  if (!versions.some((item) => item.id === versionId)) {
    throw new Error(`未找到 LLM 版本：${versionId}`);
  }
  await updateJson<LlmVersionSnapshot[]>("llm-versions.json", (items) =>
    (items ?? []).filter((item) => item.id !== versionId),
  );
  return { id: versionId };
}

async function snapshotLlm(changeNote: string): Promise<void> {
  const current = await loadLlmConfig();
  const snapshot: LlmVersionSnapshot = {
    id: `lv_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    changeNote,
    config: { ...current },
  };
  await updateJson<LlmVersionSnapshot[]>("llm-versions.json", (items) => [snapshot, ...(items ?? [])]);
}

export async function saveLlmConfig(
  patch: Partial<Pick<LlmConfig, "provider" | "model" | "temperature" | "maxTokens">> & {
    apiKey?: string | null;
    clearApiKey?: boolean;
    baseUrl?: string;
    vendorPresetId?: string;
  },
  changeNote?: string,
) {
  const hasConnectionPatch =
    patch.apiKey !== undefined ||
    patch.clearApiKey === true ||
    patch.baseUrl !== undefined ||
    patch.vendorPresetId !== undefined;

  if (hasConnectionPatch) {
    await saveLlmSecrets({
      apiKey: patch.clearApiKey ? null : patch.apiKey,
      clearApiKey: patch.clearApiKey,
      baseUrl: patch.baseUrl,
      vendorPresetId: patch.vendorPresetId,
      model: patch.model,
    });
  }

  const touchesCore =
    patch.provider !== undefined ||
    patch.model !== undefined ||
    patch.temperature !== undefined ||
    patch.maxTokens !== undefined;

  if (!touchesCore && hasConnectionPatch) {
    return getPublicLlmConfig();
  }

  await ensureJsonFile<LlmVersionSnapshot[]>("llm-versions.json", []);
  await snapshotLlm(changeNote || "修改前自动快照");
  const current = await loadLlmConfig();
  const nextProvider = normalizeProviderId(patch.provider ?? current.provider);
  if (!isLlmProviderId(nextProvider)) {
    throw new LlmConfigError(
      String(patch.provider ?? current.provider),
      `未知 Provider：${patch.provider ?? current.provider}`,
      "允许值：demo、openai-compatible",
    );
  }
  const next: LlmConfig = {
    provider: nextProvider,
    model: normalizeModelId(nextProvider, patch.model ?? current.model),
    temperature: patch.temperature ?? current.temperature,
    maxTokens: patch.maxTokens ?? current.maxTokens,
    updatedAt: new Date().toISOString(),
  };
  await writeJson("llm-config.json", next);
  return getPublicLlmConfig();
}

export async function rollbackLlm(versionId: string) {
  const versions = await listLlmVersions();
  const version = versions.find((item) => item.id === versionId);
  if (!version) {
    throw new Error(`未找到 LLM 版本：${versionId}`);
  }
  return saveLlmConfig(
    {
      provider: normalizeProviderId(String(version.config.provider)) as LlmProviderId,
      model: version.config.model,
      temperature: version.config.temperature,
      maxTokens: version.config.maxTokens,
    },
    `回滚到 ${version.id} 前自动快照`,
  );
}

export async function switchLlmProvider(provider: LlmProviderId, model?: string) {
  const catalog = PROVIDER_CATALOG[provider];
  return saveLlmConfig({
    provider,
    model: model || catalog.models[0]?.id,
  });
}

export async function testLlmConnection(provider?: LlmProviderId) {
  if (provider) {
    const current = await loadLlmConfig();
    if (resolveProviderId(current) !== provider) {
      return {
        ok: false,
        provider,
        code: "PROVIDER_NOT_ACTIVE",
        message: `当前生效 Provider 是 ${resolveProviderId(current)}，请先切换到 ${provider} 再测试。`,
        hint: "切换会写入 data/llm-config.json，后续 RunRecord 会使用新 Provider。",
      };
    }
  }
  try {
    await assertProviderReady();
    const response = await completeLlm({
      purpose: "explain",
      messages: [
        { role: "system", content: "只回复 ok，不要输出密钥。" },
        { role: "user", content: JSON.stringify({ runId: "llm-config-test", focus: "run" }) },
      ],
      temperature: 0,
      maxTokens: 32,
      timeoutMs: 12_000,
    });
    return {
      ok: true,
      provider: response.provider,
      model: response.model,
      fixture: response.fixture,
      message: response.fixture
        ? "Demo 演示稳定模式连接成功，未调用外部密钥。"
        : "真实 Provider 连接成功。",
    };
  } catch (error) {
    if (error instanceof LlmConfigError) {
      return {
        ok: false,
        provider: error.provider,
        code: error.code,
        message: error.message,
        hint: error.hint,
      };
    }
    if (error instanceof LlmCallError) {
      return {
        ok: false,
        provider: error.provider,
        code: error.code,
        message: error.message,
        hint: error.hint,
      };
    }
    return {
      ok: false,
      code: "LLM_REQUEST_FAILED",
      message: error instanceof Error ? error.message : "连接测试失败",
      hint: "请检查 Base URL、模型名与网络后重试。",
    };
  }
}
