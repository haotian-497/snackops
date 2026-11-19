import "server-only";

import { loadLlmConfig, resolveProviderId } from "@/lib/llm/config";
import { LlmConfigError, missingProviderHint } from "@/lib/llm/errors";
import { completeDemo } from "@/lib/llm/providers/demo";
import { completeOpenAiCompatible } from "@/lib/llm/providers/openai-compatible";
import { resolveOpenAiCredentials } from "@/lib/llm/secrets";
import type { LlmRequest, LlmResponse } from "@/lib/llm/types";

export async function assertProviderReady() {
  const config = await loadLlmConfig();
  const provider = resolveProviderId(config);
  if (provider === "demo") {
    return { provider, model: config.model };
  }
  if (provider === "openai-compatible") {
    const credentials = await resolveOpenAiCredentials();
    if (!credentials.apiKey) {
      throw new LlmConfigError(
        "openai-compatible",
        "缺少 API Key，无法调用 openai-compatible 模型。",
        "请到「模型」页填写 API Key，或设置环境变量 OPENAI_API_KEY。",
      );
    }
    if (!(process.env.LLM_MODEL?.trim() || config.model)) {
      throw new LlmConfigError(
        "openai-compatible",
        "缺少模型名，无法调用 openai-compatible 模型。",
        missingProviderHint("openai-compatible"),
      );
    }
    return { provider, model: config.model };
  }
  throw new LlmConfigError(provider, `未实现的 provider：${provider}`, missingProviderHint(provider));
}

export async function completeLlm(request: LlmRequest): Promise<LlmResponse> {
  const config = await loadLlmConfig();
  const provider = resolveProviderId(config);
  const model =
    provider === "demo"
      ? request.model || config.model
      : config.model || process.env.LLM_MODEL?.trim() || request.model;
  const nextRequest = {
    ...request,
    model,
    temperature: request.temperature ?? config.temperature,
    maxTokens: request.maxTokens ?? config.maxTokens,
  };

  if (provider === "demo") {
    return completeDemo(nextRequest);
  }
  if (provider === "openai-compatible") {
    return completeOpenAiCompatible(nextRequest);
  }
  throw new LlmConfigError(provider, `未实现的 provider：${provider}`, missingProviderHint(provider));
}

export { loadLlmConfig, resolveProviderId } from "@/lib/llm/config";
export { LlmConfigError } from "@/lib/llm/errors";
export type { LlmMessage, LlmPurpose, LlmRequest, LlmResponse } from "@/lib/llm/types";
