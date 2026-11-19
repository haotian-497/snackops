import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card px-4 py-6">
      <h1 className="text-lg font-semibold">未找到页面</h1>
      <p className="text-sm text-muted-foreground">该路径尚未接入运营模块。</p>
      <Button asChild>
        <Link href="/">返回总览</Link>
      </Button>
    </div>
  );
}
