import { PageHeader } from "@/components/page-header";
import { ToolsWorkbench } from "@/components/tools-workbench";
import { sampleOutputFor } from "@/lib/tools/examples";
import { listTools, sampleInputFor } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const tools = await listTools();
  const samples = Object.fromEntries(tools.map((tool) => [tool.id, sampleInputFor(tool.id)]));
  const examples = Object.fromEntries(tools.map((tool) => [tool.id, sampleOutputFor(tool.id)]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tool 注册中心"
        description="编辑 description / timeout，查看 schema，启用或停用，并对真实 data JSON 跑单项测试。"
      />
      <ToolsWorkbench initialTools={tools} samples={samples} examples={examples} />
    </div>
  );
}
