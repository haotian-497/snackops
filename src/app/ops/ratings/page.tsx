import { RatingsWorkbench } from "@/components/ratings-workbench";
import { listRatings, ratingStatsWithRuns } from "@/lib/ops/ratings";

export const dynamic = "force-dynamic";

export default async function OpsRatingsPage() {
  const [ratings, stats] = await Promise.all([listRatings(), ratingStatsWithRuns("user")]);
  return <RatingsWorkbench initialRatings={ratings} initialStats={stats} />;
}
