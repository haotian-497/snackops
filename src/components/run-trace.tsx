import { groupStepsByStage } from "@/lib/agent/plan-path";
import type { AgentPlan, AgentStep } from "@/lib/types";

export function RunTrace({
  steps,
  plan,
  error,
}: {
  steps: AgentStep[];
  plan?: AgentPlan | null;
  error?: string;
}) {
  return (
    <div className="space-y-2 text-sm">
      {error ? <p className="text-red-800">{error}</p> : null}
      {plan ? (
        <div className="rounded-md border border-border p-2">
          <p>Skill：{plan.selectedSkills.join("、") || "无"}</p>
          <p>Tool：{plan.selectedTools.join("、") || "无"}</p>
          {plan.mandatoryCapabilities.length ? (
            <p>强制能力：{plan.mandatoryCapabilities.join("、")}</p>
          ) : null}
          {plan.reasoning ? <p className="mt-1 text-xs text-muted-foreground">{plan.reasoning}</p> : null}
        </div>
      ) : null}
      {groupStepsByStage(steps).map((group) => (
        <section key={`${group.id}-${group.steps[0]?.stepId}`} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
          {group.steps.map((step) => (
            <details key={step.stepId} className="rounded-md border border-border p-2">
              <summary className="cursor-pointer">
                {step.type} · {step.name} · {step.status} · {step.durationMs}ms
              </summary>
              {step.error ? <p className="text-red-800">{step.error}</p> : null}
              <pre className="mt-2 overflow-auto text-xs">{JSON.stringify({ input: step.input, output: step.output }, null, 2)}</pre>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
