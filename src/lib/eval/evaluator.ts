import { createHash } from "node:crypto";

export const EVALUATOR_VERSION = "rule-v3+judge-v4";
export const EVALUATOR_MODE = "rules+judge" as const;
export const JUDGE_ENABLED = true;

export function evaluatorHash() {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: EVALUATOR_VERSION,
        mode: EVALUATOR_MODE,
        judge: JUDGE_ENABLED,
        checks: [
          "keywords",
          "forbidden",
          "price",
          "capabilities",
          "inputRisk",
          "replySafe",
          "riskDenial",
          "send",
          "safetyHardFail",
          "qualityFail",
          "llm-judge-override",
        ],
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

export function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}
