import { PageHeader } from "@/components/page-header";
import { SkillsWorkbench } from "@/components/skills-workbench";
import { listAllSkillVersionSummaries, listSkillRecords } from "@/lib/skills/registry";
import { listTools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const [skills, initialVersions, tools] = await Promise.all([
    listSkillRecords(),
    listAllSkillVersionSummaries(),
    listTools(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Skill 注册中心"
        description="查看、启用、停用和编辑客服 Skill。保存时会自动留下版本快照，Planner 只读取当前启用项。"
      />
      <SkillsWorkbench
        initialSkills={skills}
        initialVersions={initialVersions}
        toolIds={tools.map((tool) => tool.id)}
      />
    </div>
  );
}
