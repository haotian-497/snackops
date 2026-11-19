import { EvalRuleProbe } from "@/components/eval-rule-probe";
import { EvalWorkbench } from "@/components/eval-workbench";
import { listEvalCases } from "@/lib/eval/cases";

export const dynamic = "force-dynamic";

export default async function OpsEvalPage() {
  const cases = await listEvalCases();
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-muted-foreground">
        横向查看每条用例，点编辑或单条测试会在该条下方展开，也可添加或删除。批量测评已移到测评中心。
      </p>
      <EvalRuleProbe />
      <EvalWorkbench initialCases={cases} />
    </div>
  );
}
