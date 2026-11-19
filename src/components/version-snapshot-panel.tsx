"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DiffLine } from "@/lib/skills/diff";
import { cn } from "@/lib/utils";

export type VersionSnapshotItem = {
  id: string;
  createdAt: string;
  note: string;
  badge?: string;
};

function shortTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 19);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionSnapshotPanel({
  items,
  selectedId,
  diffLines,
  loading,
  onSelect,
  onManualSnapshot,
  rollbackHref = "/ops/rollback",
  emptyHint = "保存后会自动留下修改前快照。",
}: {
  items: VersionSnapshotItem[];
  selectedId?: string;
  diffLines: DiffLine[];
  loading?: boolean;
  onSelect: (id: string) => void;
  onManualSnapshot?: () => void;
  rollbackHref?: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const changed = useMemo(() => diffLines.filter((line) => line.type !== "same"), [diffLines]);
  const shown = items.slice(0, 12);

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <span>版本快照 · {items.length} 条</span>
        </button>
        <Link className="text-xs text-muted-foreground underline" href={rollbackHref as "/ops"}>
          去版本回滚
        </Link>
        {onManualSnapshot ? (
          <Button type="button" size="sm" variant="ghost" onClick={onManualSnapshot} disabled={loading}>
            添加快照
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {shown.length === 0 ? (
            <p className="text-xs text-muted-foreground">{emptyHint}</p>
          ) : (
            <ul className="max-h-44 space-y-0.5 overflow-y-auto text-sm">
              {shown.map((item) => {
                const active = item.id === selectedId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => onSelect(item.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60",
                        active && "bg-secondary",
                      )}
                    >
                      <span className="w-[5.5rem] shrink-0 text-xs text-muted-foreground tabular-nums">
                        {shortTime(item.createdAt)}
                      </span>
                      <span className="min-w-0 flex-1">
                        {item.badge ? (
                          <span className="mr-1.5 text-xs font-medium text-foreground">{item.badge}</span>
                        ) : null}
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {item.note || "无备注"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {items.length > shown.length ? (
            <p className="text-xs text-muted-foreground">仅显示最近 {shown.length} 条，完整回滚请用运营页。</p>
          ) : null}

          {loading ? <p className="text-xs text-muted-foreground">对比中…</p> : null}

          {!loading && selectedId ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                相对当前
                {changed.length === 0 && diffLines.length > 0
                  ? " · 无差异"
                  : changed.length > 0
                    ? ` · ${changed.length} 处变更`
                    : ""}
              </p>
              {changed.length > 0 ? (
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                  {changed.map((line, index) => (
                    <div
                      key={`${line.type}-${index}`}
                      className={
                        line.type === "add"
                          ? "text-emerald-800"
                          : line.type === "remove"
                            ? "text-red-800"
                            : "text-muted-foreground"
                      }
                    >
                      {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "} {line.text}
                    </div>
                  ))}
                </pre>
              ) : null}
            </div>
          ) : !loading && shown.length > 0 ? (
            <p className="text-xs text-muted-foreground">点一条快照，立刻与当前对比。</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
