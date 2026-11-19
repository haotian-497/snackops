"use client";

import { BookOpen, ClipboardList, Cookie, Cpu, LayoutDashboard, Map, MessageCircle, Puzzle, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { UsageGuideButton } from "@/components/usage-guide";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "工作台", icon: LayoutDashboard },
  { href: "/demo", label: "Demo", icon: MessageCircle },
  { href: "/catalog", label: "业务目录", icon: BookOpen },
  { href: "/skills", label: "Skill", icon: Puzzle },
  { href: "/tools", label: "Tool", icon: Wrench },
  { href: "/planner", label: "Planner", icon: Map },
  { href: "/models", label: "模型", icon: Cpu },
  { href: "/ops", label: "运营", icon: ClipboardList },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <Cookie className="size-4 text-primary" aria-hidden="true" />
          SnackOps
        </Link>
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          {links.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href as "/"}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5",
                  active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <p className="hidden text-xs text-muted-foreground lg:block">客服 Agent 运营台</p>
          <UsageGuideButton />
        </div>
      </div>
    </header>
  );
}
