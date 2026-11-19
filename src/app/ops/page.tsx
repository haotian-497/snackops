import { Suspense } from "react";

import { OpsWorkbench } from "@/components/ops-workbench";
import { parseOpsFilters } from "@/lib/ops/filters";
import { emptyOpsSnapshot, loadOpsSnapshot, type OpsSnapshot } from "@/lib/ops/metrics";

export const dynamic = "force-dynamic";

export default async function OpsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = searchParams ? await searchParams : {};
  const initialFilters = parseOpsFilters(rawParams);

  let snapshot: OpsSnapshot = emptyOpsSnapshot;
  let loadError = "";
  try {
    snapshot = await loadOpsSnapshot();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "运营数据加载失败";
  }

  return (
    <div className="space-y-5">
      {loadError ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">
          {loadError}。页面没有崩溃，可继续操作。
        </p>
      ) : null}
      <Suspense fallback={<p className="text-sm text-muted-foreground">加载运行监控…</p>}>
        <OpsWorkbench initial={snapshot} initialFilters={initialFilters} />
      </Suspense>
    </div>
  );
}
