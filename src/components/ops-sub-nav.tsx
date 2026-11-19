"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/ops", label: "运行监控", exact: true },
  { href: "/ops/eval", label: "测评集", exact: true },
  { href: "/ops/center", label: "测评中心", exact: false },
  { href: "/ops/ratings", label: "服务评价", exact: true },
  { href: "/ops/annotate", label: "数据标注", exact: true },
  { href: "/ops/improvements", label: "改进建议", exact: true },
  { href: "/ops/prompt-ab", label: "Prompt A/B", exact: true },
  { href: "/ops/rollback", label: "版本回滚", exact: true },
] as const;

export function OpsSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-2" aria-label="运营子页面">
      {tabs.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href as "/ops"}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
