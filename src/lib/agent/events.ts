import type { AgentStep, RunRecord } from "@/lib/types";

export type AgentEvent =
  | { type: "plan"; plan: RunRecord["plan"]; validation?: RunRecord["validation"] }
  | { type: "step"; step: AgentStep }
  | { type: "risk"; riskResult: NonNullable<RunRecord["riskResult"]> }
  | { type: "reply"; finalReply: string }
  | { type: "error"; message: string; hint?: string; code?: string; provider?: string }
  | { type: "done"; run: RunRecord };
