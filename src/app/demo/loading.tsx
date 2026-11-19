import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-xl space-y-3" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">正在加载 Demo…</p>
      <Skeleton className="h-[min(780px,70vh)] rounded-2xl" />
    </div>
  );
}
