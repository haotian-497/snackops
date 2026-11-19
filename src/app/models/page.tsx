import { PageHeader } from "@/components/page-header";
import { ModelsWorkbench } from "@/components/models-workbench";
import { getPublicLlmConfig } from "@/lib/llm/public";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const config = await getPublicLlmConfig();

  return (
    <div className="space-y-5">
      <PageHeader
        title="模型管理"
        description="顶部直接选 Demo 或真实模型；点厂商会自动切到真实模式并带上 Base URL。"
      />
      <ModelsWorkbench initialConfig={config} />
    </div>
  );
}
