import { RollbackWorkbench } from "@/components/rollback-workbench";
import { loadRollbackHub } from "@/lib/ops/rollback";

export const dynamic = "force-dynamic";

export default async function OpsRollbackPage() {
  const hub = await loadRollbackHub();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        配置回滚中枢：Skill / Planner / Tool / Judge / LLM，以及撤销 A/B 晋升、按测评批次对齐、紧急启停。
      </p>
      <RollbackWorkbench initial={hub} />
    </div>
  );
}
