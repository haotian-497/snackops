import "server-only";

import { getRunRecord } from "@/lib/agent/runs";
import { completeLlm } from "@/lib/llm";

export async function explainRun(runId: string, focus: "run" | "risk" = "run") {
  const run = await getRunRecord(runId);
  if (!run) {
    throw new Error(`未找到运行：${runId}`);
  }
  const response = await completeLlm({
    purpose: "explain",
    messages: [
      { role: "system", content: "解释一次客服 Agent 运行。只陈述计划、校验、工具和风险结论，不要编造新价格。" },
      {
        role: "user",
        content: JSON.stringify({
          runId: run.id,
          focus,
          question: run.question,
          plan: run.plan,
          validation: run.validation,
          riskVerdict: run.riskResult?.verdict,
          triggeredRules: run.riskResult?.triggeredRules,
          tools: run.steps.filter((step) => step.type === "tool").map((step) => ({ name: step.name, status: step.status })),
          status: run.status,
          error: run.error,
        }),
      },
    ],
    temperature: 0.2,
    maxTokens: 700,
  });
  return { run, explanation: response.content, provider: response.provider };
}
