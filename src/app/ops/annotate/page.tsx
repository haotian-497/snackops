import { AnnotationWorkbench } from "@/components/annotation-workbench";
import { listRunRecords } from "@/lib/agent/runs";
import { listEvalBatches } from "@/lib/eval/batch";
import { buildAnnotationQueue, collectEvalHints, latestRatingByRun, runToQueueItem } from "@/lib/ops/annotation-queue";
import { listAnnotations } from "@/lib/ops/annotations";
import { listRatings } from "@/lib/ops/ratings";

export const dynamic = "force-dynamic";

export default async function OpsAnnotatePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const query = await searchParams;
  const [annotations, runs, ratings, batches] = await Promise.all([
    listAnnotations(),
    listRunRecords(),
    listRatings(),
    listEvalBatches(),
  ]);
  const evalHints = collectEvalHints(batches);
  const queue = buildAnnotationQueue({ runs, ratings, evalHints });
  const runId = query.run?.trim() || "";
  const pinned = runId ? runs.find((item) => item.id === runId) : undefined;
  if (pinned && !queue.some((item) => item.runId === pinned.id)) {
    queue.unshift(runToQueueItem(pinned, evalHints[pinned.id], latestRatingByRun(ratings)[pinned.id], ["指定运行"]));
  }
  return (
    <AnnotationWorkbench
      queue={queue}
      initialAnnotations={annotations}
      initialRunId={query.run?.trim() || ""}
    />
  );
}
