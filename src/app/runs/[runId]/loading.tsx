import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">正在加载运行详情…</p>
      <Skeleton className="h-72" />
    </div>
  );
}
