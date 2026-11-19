export type LlmRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

export type LlmPurpose = "planner" | "skill" | "risk-check" | "explain" | "rewrite" | "judge";

export type LlmRequest = {
  purpose: LlmPurpose;
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type LlmResponse = {
  content: string;
  provider: string;
  model: string;
  fixture: boolean;
};
