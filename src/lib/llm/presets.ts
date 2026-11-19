import "server-only";

export type LlmVendorPreset = {
  id: string;
  label: string;
  description: string;
  baseUrl: string;
  models: Array<{ id: string; label: string }>;
};

/** Common OpenAI-compatible endpoints. Custom = fill baseUrl/model yourself. */
export const LLM_VENDOR_PRESETS: LlmVendorPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek 官方 OpenAI 兼容接口",
    baseUrl: "https://api.deepseek.com",
    models: [
      { id: "deepseek-v4-flash", label: "deepseek-v4-flash" },
      { id: "deepseek-v4-pro", label: "deepseek-v4-pro" },
      { id: "deepseek-chat", label: "deepseek-chat" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "OpenAI Chat Completions",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
      { id: "gpt-4o", label: "gpt-4o" },
    ],
  },
  {
    id: "qwen",
    label: "通义千问",
    description: "阿里云 DashScope 兼容模式",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      { id: "qwen-plus", label: "qwen-plus" },
      { id: "qwen-turbo", label: "qwen-turbo" },
      { id: "qwen-max", label: "qwen-max" },
    ],
  },
  {
    id: "kimi",
    label: "Kimi",
    description:
      "月之暗面 Kimi。接口地址是 https://api.moonshot.cn/v1。默认 kimi-k2.6 并关闭思考，避免英文推理过程和长时间超时。",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [
      { id: "kimi-k2.6", label: "kimi-k2.6（关闭思考，适合客服）" },
      { id: "kimi-k3", label: "kimi-k3" },
      { id: "kimi-k2.7-code", label: "kimi-k2.7-code" },
      { id: "kimi-k2.7-code-highspeed", label: "kimi-k2.7-code-highspeed" },
    ],
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    description: "智谱 OpenAI 兼容接口",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      { id: "glm-4-flash", label: "glm-4-flash" },
      { id: "glm-4-plus", label: "glm-4-plus" },
    ],
  },
  {
    id: "custom",
    label: "自定义",
    description: "任意 OpenAI 兼容网关：自行填写 Base URL 与模型名",
    baseUrl: "",
    models: [],
  },
];

export function findVendorPreset(id: string | undefined | null) {
  if (!id) return undefined;
  return LLM_VENDOR_PRESETS.find((item) => item.id === id);
}

export function allCompatibleModels() {
  const seen = new Set<string>();
  const models: Array<{ id: string; label: string }> = [];
  for (const preset of LLM_VENDOR_PRESETS) {
    for (const model of preset.models) {
      if (seen.has(model.id)) continue;
      seen.add(model.id);
      models.push(model);
    }
  }
  return models;
}
