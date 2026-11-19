import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EvalBatchCaseDetailPage({
  params,
}: {
  params: Promise<{ batchId: string; caseId: string }>;
}) {
  const { batchId, caseId } = await params;
  const search = new URLSearchParams({
    batch: batchId,
    case: decodeURIComponent(caseId),
  });
  redirect(`/ops/center?${search.toString()}`);
}
