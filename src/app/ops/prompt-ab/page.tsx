import { PromptAbWorkbench } from "@/components/prompt-ab-workbench";
import { countCasesBySuite, listPromptAbExperimentViews } from "@/lib/ops/prompt-ab";

export const dynamic = "force-dynamic";

export default async function OpsPromptAbPage() {
  const [experiments, suiteCounts] = await Promise.all([listPromptAbExperimentViews(), countCasesBySuite()]);
  return <PromptAbWorkbench initialExperiments={experiments} initialSuiteCounts={suiteCounts} />;
}
