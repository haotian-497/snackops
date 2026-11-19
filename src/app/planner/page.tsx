import { PageHeader } from "@/components/page-header";
import { PlannerWorkbench } from "@/components/planner-workbench";
import { getPlannerRecord } from "@/lib/planner/registry";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const record = await getPlannerRecord();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planner 管理"
        description="查看 Planner Prompt、选择启用的 Skill/Tool，并在服务端预览真实计划。保存会同步注册表启用状态。"
      />
      <PlannerWorkbench
        initialConfig={{
          ...record.config,
          enabledSkillIds: record.skills.filter((skill) => skill.enabled).map((skill) => skill.id),
          enabledToolIds: record.tools.filter((tool) => tool.enabled).map((tool) => tool.id),
        }}
        initialPrompt={record.systemPrompt}
        initialVersions={record.versions}
        skills={record.skills}
        tools={record.tools}
      />
    </div>
  );
}
