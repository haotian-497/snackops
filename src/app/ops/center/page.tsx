import { EvalCenter } from "@/components/eval-center";
import { listEvalBatches } from "@/lib/eval/batch";
import { listEvalCases } from "@/lib/eval/cases";
import { getJudgeConfig } from "@/lib/eval/judge-config";

export const dynamic = "force-dynamic";

export default async function OpsEvalCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; case?: string }>;
}) {
  const query = await searchParams;
  const [cases, batches, judgeConfig] = await Promise.all([listEvalCases(), listEvalBatches(), getJudgeConfig()]);
  return (
    <EvalCenter
      initialCases={cases}
      initialBatches={batches}
      initialJudgeConfig={judgeConfig}
      initialBatchId={query.batch?.trim() || ""}
      initialCaseId={query.case?.trim() || ""}
    />
  );
}
