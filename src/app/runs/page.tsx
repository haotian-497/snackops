import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { RunsArchive } from "@/components/runs-archive";
import { listRunRecords } from "@/lib/agent/runs";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await listRunRecords({ summary: true });
  return (
    <div className="space-y-5">
      <PageHeader
        title="运行存档"
        description="全部 RunRecord。点进单条可看处置中枢；调试链路请回 Agent 工作台。"
        actions={<BackButton href="/" />}
      />
      <RunsArchive initialRuns={runs} />
    </div>
  );
}
