import "server-only";

import {
  classifyOpenAiHttpError,
  LlmCallError,
  LlmConfigError,
  missingProviderHint,
} from "@/lib/llm/errors";
import { resolveOpenAiCredentials } from "@/lib/llm/secrets";
import type { LlmRequest, LlmResponse } from "@/lib/llm/types";

type ChatMessageContent = string | Array<{ type?: string; text?: string }> | null;

type ChatCompletionJson = {
  error?: { message?: string; code?: string; type?: string };
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: ChatMessageContent;
      reasoning_content?: string | null;
    };
  }>;
};

function isDeepSeekV4(model: string) {
  return /deepseek-v4/i.test(model);
}

function isKimiK26(model: string) {
  return /^kimi-k2\.[56]($|[^0-9])/i.test(model);
}

/** K2.6 thinking is on by default and writes long English reasoning. Instant mode is fixed at temperature 0.6. */
function kimiSampling(model: string, requested: number | undefined): { temperature: number; extra: Record<string, unknown> } {
  if (isKimiK26(model)) {
    return { temperature: 0.6, extra: { thinking: { type: "disabled" } } };
  }
  if (/^kimi-k3/i.test(model)) {
    return { temperature: 1, extra: { reasoning_effort: "low" } };
  }
  if (/^kimi-/i.test(model)) return { temperature: 1, extra: {} };
  return { temperature: requested ?? 0.2, extra: {} };
}

function textFromContent(content: ChatMessageContent | undefined): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function extractAssistantText(json: ChatCompletionJson): string {
  const message = json.choices?.[0]?.message;
  return textFromContent(message?.content);
}

function isAbortError(error: unknown) {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isKimiLimited(baseUrl: string, model: string) {
  return /moonshot\.(cn|ai)/i.test(baseUrl) || /^kimi-/i.test(model);
}

function isTransientLimit(status: number, message: string) {
  return status === 429 || /concurrency|rate limit|\brpm\b|too many requests/i.test(message);
}

function limitWaitMs(message: string, attempt: number) {
  if (/rpm|per minute|每分钟/i.test(message)) return 20_000;
  const match = message.match(/after\s+(\d+(?:\.\d+)?)\s*second/i);
  if (match) return Math.min(8_000, Math.ceil(Number(match[1]) * 1000) + 400);
  return Math.min(8_000, 1_000 * 2 ** attempt);
}

/** Kimi free-tier accounts allow one in-flight request. Keep calls in a single lane. */
let kimiLane: Promise<void> = Promise.resolve();

function inKimiLane<T>(work: () => Promise<T>): Promise<T> {
  const run = kimiLane.then(work, work);
  kimiLane = run.then(
    () => sleep(1_100),
    () => sleep(1_100),
  ).then(() => undefined);
  return run;
}

export async function completeOpenAiCompatible(request: LlmRequest): Promise<LlmResponse> {
  const credentials = await resolveOpenAiCredentials();
  const apiKey = credentials.apiKey;
  const baseUrl = credentials.baseUrl;
  const model = request.model || process.env.LLM_MODEL?.trim();

  if (!apiKey) {
    throw new LlmConfigError(
      "openai-compatible",
      "缺少 API Key，无法调用 openai-compatible 模型。",
      "请到「模型」页填写 API Key（优先），或设置环境变量 OPENAI_API_KEY。",
    );
  }
  if (!model) {
    throw new LlmConfigError(
      "openai-compatible",
      "缺少模型名，无法调用 openai-compatible 模型。",
      missingProviderHint("openai-compatible"),
    );
  }

  const sampling = kimiSampling(model, request.temperature);
  const body: Record<string, unknown> = {
    model,
    temperature: sampling.temperature,
    max_tokens: request.maxTokens ?? 1200,
    messages: request.messages,
    ...sampling.extra,
  };
  if (isDeepSeekV4(model)) {
    body.thinking = { type: "disabled" };
  }

  const send = async (): Promise<LlmResponse> => {
    const maxAttempts = isKimiLimited(baseUrl, model) ? 6 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? 20_000);
      try {
        let response: Response;
        try {
          response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (error) {
          if (isAbortError(error)) {
            throw new LlmCallError(
              "openai-compatible",
              "LLM_TIMEOUT",
              "调用超时：模型接口在限定时间内未返回。",
              "可增大超时时间，或检查 Base URL / 网络；演示可先切回 demo。",
            );
          }
          throw new LlmCallError(
            "openai-compatible",
            "LLM_REQUEST_FAILED",
            `网络请求失败：${error instanceof Error ? error.message : "unknown"}`,
            "请检查 Base URL 与本机网络是否可达目标厂商接口。",
          );
        }

        const json = (await response.json().catch(() => ({}))) as ChatCompletionJson;
        if (!response.ok) {
          const raw = json.error?.message || `HTTP ${response.status}`;
          if (isTransientLimit(response.status, raw) && attempt < maxAttempts - 1) {
            await sleep(limitWaitMs(raw, attempt));
            continue;
          }
          const classified = classifyOpenAiHttpError(response.status, raw);
          throw new LlmCallError(
            "openai-compatible",
            classified.code,
            classified.message,
            classified.hint,
            response.status,
          );
        }
        const content = extractAssistantText(json);
        if (!content) {
          const finishReason = json.choices?.[0]?.finish_reason;
          throw new LlmCallError(
            "openai-compatible",
            "LLM_REQUEST_FAILED",
            finishReason === "length"
              ? "模型返回空内容（输出被 max_tokens 截断，思考可能占用了额度）"
              : "模型返回空内容",
            "可尝试换模型、提高 maxTokens，或确认该模型是否支持当前请求格式。",
          );
        }
        return { content, provider: "openai-compatible", model, fixture: false };
      } finally {
        clearTimeout(timer);
      }
    }

    throw new LlmCallError(
      "openai-compatible",
      "LLM_REQUEST_FAILED",
      "请求过于频繁：重试后仍被限流。",
      "请等几秒再运行。Kimi 免费档通常同时只允许 1 个请求。",
    );
  };

  if (isKimiLimited(baseUrl, model)) return inKimiLane(send);
  return send();
}
