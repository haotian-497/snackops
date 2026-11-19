"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card px-4 py-6" role="alert">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="size-4" aria-hidden="true" />
        页面加载失败
      </div>
      <p className="text-sm text-muted-foreground">{error.message || "未知错误"}</p>
      <Button type="button" onClick={reset}>
        重试
      </Button>
    </div>
  );
}
