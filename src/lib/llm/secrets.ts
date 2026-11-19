import "server-only";

import { ensureJsonFile, writeJson } from "@/lib/store";

export type LlmVendorSlot = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type LlmSecretsFile = {
  apiKey?: string;
  baseUrl?: string;
  vendorPresetId?: string;
  slots?: Record<string, LlmVendorSlot>;
  updatedAt?: string;
};

const SECRETS_FILE = "llm-secrets.json";

export async function loadLlmSecrets(): Promise<LlmSecretsFile> {
  const file = await ensureJsonFile<LlmSecretsFile>(SECRETS_FILE, {});
  const { next, changed } = migrateSecretsFile(file);
  if (!changed) return file;
  const saved: LlmSecretsFile = { ...next, updatedAt: new Date().toISOString() };
  await writeJson(SECRETS_FILE, saved);
  return saved;
}

const RETIRED_KIMI_MODELS = new Set(["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"]);

export function canonicalizeVendorId(vendorPresetId: string | undefined) {
  const value = (vendorPresetId || "custom").trim() || "custom";
  if (value === "moonshot") return "kimi";
  return value;
}

function slotId(vendorPresetId: string | undefined) {
  return canonicalizeVendorId(vendorPresetId);
}

function migrateSecretsFile(file: LlmSecretsFile): { next: LlmSecretsFile; changed: boolean } {
  const slots = { ...(file.slots || {}) };
  let changed = false;
  if (slots.moonshot) {
    const legacy = slots.moonshot;
    const current = slots.kimi || {};
    slots.kimi = {
      ...legacy,
      ...current,
      apiKey: current.apiKey?.trim() || legacy.apiKey,
      baseUrl: current.baseUrl?.trim() || legacy.baseUrl || "https://api.moonshot.cn/v1",
      model: current.model?.trim() || legacy.model,
    };
    delete slots.moonshot;
    changed = true;
  }
  const kimi = slots.kimi;
  if (kimi && (!kimi.model || RETIRED_KIMI_MODELS.has(kimi.model))) {
    kimi.model = "kimi-k3";
    changed = true;
  }
  const vendorPresetId = canonicalizeVendorId(file.vendorPresetId);
  if (vendorPresetId !== (file.vendorPresetId || "custom")) changed = true;
  const active = slots[vendorPresetId];
  return {
    changed,
    next: {
      ...file,
      vendorPresetId,
      slots,
      apiKey: active?.apiKey ?? file.apiKey,
      baseUrl: active?.baseUrl ?? file.baseUrl,
    },
  };
}

export async function saveLlmSecrets(patch: {
  apiKey?: string | null;
  baseUrl?: string;
  vendorPresetId?: string;
  model?: string;
  clearApiKey?: boolean;
}): Promise<LlmSecretsFile> {
  const current = await loadLlmSecrets();
  const vendorId = slotId(patch.vendorPresetId ?? current.vendorPresetId);
  const slots = { ...(current.slots || {}) };

  // One-time migrate legacy root key into the first activated slot.
  if (!current.slots && current.apiKey?.trim() && !slots[vendorId]?.apiKey) {
    slots[vendorId] = {
      ...(slots[vendorId] || {}),
      apiKey: current.apiKey.trim(),
      baseUrl: current.baseUrl,
    };
  }

  const currentSlot: LlmVendorSlot = { ...(slots[vendorId] || {}) };
  if (patch.baseUrl !== undefined) {
    currentSlot.baseUrl = patch.baseUrl.trim();
  }
  if (patch.model !== undefined && patch.model.trim()) {
    currentSlot.model = patch.model.trim();
  }
  if (patch.clearApiKey || patch.apiKey === null) {
    delete currentSlot.apiKey;
  } else if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    currentSlot.apiKey = patch.apiKey.trim();
  }

  slots[vendorId] = currentSlot;

  const next: LlmSecretsFile = {
    vendorPresetId: vendorId,
    slots,
    apiKey: currentSlot.apiKey,
    baseUrl: currentSlot.baseUrl,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(SECRETS_FILE, next);
  return next;
}

export type ResolvedOpenAiCredentials = {
  apiKey: string;
  baseUrl: string;
  apiKeySource: "local" | "env" | "missing";
  baseUrlSource: "local" | "env" | "default";
  vendorPresetId: string;
  slotModel?: string;
  slots: Record<string, { apiKeySet: boolean; apiKeyMasked: string; baseUrl: string; model?: string }>;
};

export function maskApiKey(apiKey: string) {
  const value = apiKey.trim();
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function resolveOpenAiCredentials(): Promise<ResolvedOpenAiCredentials> {
  const secrets = await loadLlmSecrets();
  const vendorPresetId = slotId(secrets.vendorPresetId);
  const slot = secrets.slots?.[vendorPresetId] || {};
  const envKey = process.env.OPENAI_API_KEY?.trim() || "";
  const envBase = process.env.OPENAI_BASE_URL?.trim() || "";

  const localKey = slot.apiKey?.trim() || "";
  const localBase = slot.baseUrl?.trim() || "";

  const apiKey = localKey || envKey;
  const apiKeySource: ResolvedOpenAiCredentials["apiKeySource"] = localKey
    ? "local"
    : envKey
      ? "env"
      : "missing";

  let baseUrl = localBase || envBase || "https://api.openai.com/v1";
  const baseUrlSource: ResolvedOpenAiCredentials["baseUrlSource"] = localBase
    ? "local"
    : envBase
      ? "env"
      : "default";
  baseUrl = baseUrl.replace(/\/$/, "");

  const slots: ResolvedOpenAiCredentials["slots"] = {};
  for (const [id, item] of Object.entries(secrets.slots || {})) {
    const key = item.apiKey?.trim() || "";
    slots[id] = {
      apiKeySet: Boolean(key),
      apiKeyMasked: key ? maskApiKey(key) : "",
      baseUrl: (item.baseUrl || "").replace(/\/$/, ""),
      model: item.model,
    };
  }

  return {
    apiKey,
    baseUrl,
    apiKeySource,
    baseUrlSource,
    vendorPresetId,
    slotModel: slot.model,
    slots,
  };
}

export function isDemoResetAllowed() {
  if (process.env.ALLOW_DEMO_RESET?.trim() === "1") return true;
  return process.env.NODE_ENV !== "production";
}
