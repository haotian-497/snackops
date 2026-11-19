import { notFound } from "next/navigation";

import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { RunDetail } from "@/components/run-detail";
import { loadRunHub } from "@/lib/ops/run-hub";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<{ from?: string; ratingId?: string }>;
}) {
  const { runId } = await params;
  const query = searchParams ? await searchParams : {};
  const fromRating = query.from === "rating";
  const focusRatingId = typeof query.ratingId === "string" ? query.ratingId : undefined;

  const hub = await loadRunHub(runId);
  if (!hub) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title={fromRating ? "运行详情 · 服务评价" : "运行详情 · 处置中枢"}
        description={
          fromRating
            ? "先看本次评分，再对照上方的用户问题与客服回复；失败 Run 可用「定位到失败位置」跳到执行步骤。"
            : "档案与下游关联：评分 / 标注 / 改进 / 测评 / A/B。失败 Run 可定位到具体失败步骤。"
        }
        actions={<BackButton href={fromRating ? "/ops/ratings" : "/"} preferHref={fromRating} />}
      />
      <RunDetail hub={hub} fromRating={fromRating} focusRatingId={focusRatingId} />
    </div>
  );
}
