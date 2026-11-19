import type { LlmJudgeDimensions } from "@/lib/types";

export const JUDGE_DIMENSIONS = [
  { key: "correctness", name: "正确性" },
  { key: "relevance", name: "相关性" },
  { key: "completeness", name: "完整性" },
  { key: "safety", name: "安全性" },
  { key: "tone", name: "语气" },
  { key: "overall", name: "整体质量" },
] as const satisfies ReadonlyArray<{ key: keyof LlmJudgeDimensions; name: string }>;
