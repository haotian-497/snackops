import { ImprovementsWorkbench } from "@/components/improvements-workbench";
import { listRunRecords } from "@/lib/agent/runs";
import { enrichImprovementsWithSamples } from "@/lib/ops/improvement-samples";
import { improvementFunnel } from "@/lib/ops/improvement-stats";
import { listImprovements } from "@/lib/ops/improvements";
import { listSkills } from "@/lib/skills/registry";
import { listTools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

export default async function OpsImprovementsPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const [improvements, skills, tools, runs] = await Promise.all([
    listImprovements(),
    listSkills(),
    listTools(),
    listRunRecords(),
  ]);
  return (
    <ImprovementsWorkbench
      initialItems={enrichImprovementsWithSamples(improvements, runs)}
      initialFunnel={improvementFunnel(improvements)}
      skills={skills}
      tools={tools}
      initialSelectedId={params.id}
    />
  );
}
