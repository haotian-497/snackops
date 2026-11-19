import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">正在加载 Planner…</p>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64" />
    </div>
  );
}
