"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card px-4 py-6" role="alert">
      <p className="font-medium">运营中心出错，整页没有崩溃。</p>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button type="button" onClick={reset}>
        重试
      </Button>
    </div>
  );
}
