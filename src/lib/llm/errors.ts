export class LlmConfigError extends Error {
  readonly code = "LLM_CONFIG_MISSING";
  readonly hint: string;
  readonly provider: string;

  constructor(provider: string, message: string, hint: string) {
    super(message);
    this.name = "LlmConfigError";
    this.provider = provider;
    this.hint = hint;
  }
}

export type LlmCallErrorCode =
  | "LLM_AUTH_FAILED"
  | "LLM_MODEL_INVALID"
  | "LLM_TIMEOUT"
  | "LLM_REQUEST_FAILED";

export class LlmCallError extends Error {
  readonly code: LlmCallErrorCode;
  readonly hint: string;
  readonly provider: string;
  readonly status?: number;

  constructor(
    provider: string,
    code: LlmCallErrorCode,
    message: string,
    hint: string,
    status?: number,
  ) {
    super(message);
    this.name = "LlmCallError";
    this.provider = provider;
    this.code = code;
    this.hint = hint;
    this.status = status;
  }
}

export function missingProviderHint(provider: string) {
  return `当前 provider 为「${provider}」，缺少必要配置，已拒绝调用，没有静默降级到演示模式。请到「模型」页粘贴 API Key / Base URL，或把 provider 改成 demo 使用 Demo 演示模式。`;
}

/** Vendor errors sometimes echo account ids. Keep those off the workbench. */
export function scrubVendorMessage(raw: string) {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\borg-[a-z0-9]+\b/gi, "org-***")
    .replace(/\bak-[a-z0-9_-]+\b/gi, "ak-***")
    .replace(/\bsk-[a-z0-9_-]+\b/gi, "sk-***")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function classifyOpenAiHttpError(status: number, rawMessage: string) {
  const message = scrubVendorMessage(rawMessage || `HTTP ${status}`);
  if (status === 401 || status === 403) {
    return {
      code: "LLM_AUTH_FAILED" as const,
      message: `鉴权失败：${message}`,
      hint: "请检查 API Key 是否正确、是否过期，以及该 Key 是否有权访问所选接口。",
    };
  }
  if (
    status === 404 ||
    /model[_\s-]?not[_\s-]?found|invalid model|does not exist|未知的模型|不存在/i.test(message)
  ) {
    return {
      code: "LLM_MODEL_INVALID" as const,
      message: `模型不可用：${message}`,
      hint: "请核对模型名是否与当前厂商一致（例如 DeepSeek 用 deepseek-*，Kimi 用 kimi-*）。",
    };
  }
  if (status === 429 || /concurrency|rate limit|\brpm\b|too many requests/i.test(message)) {
    return {
      code: "LLM_REQUEST_FAILED" as const,
      message: `请求过于频繁：${message}`,
      hint: "该账号同时只允许很少的请求。Kimi 这边会自动排队重试；若仍失败，等几秒再运行一次。",
    };
  }
  return {
    code: "LLM_REQUEST_FAILED" as const,
    message: `请求失败：${message}`,
    hint: "请检查 Base URL 是否为 OpenAI 兼容的 /chat/completions 地址，以及网络是否可达。",
  };
}
