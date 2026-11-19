"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { StatusLabel } from "@/components/status-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { runStatusLabel } from "@/lib/labels";
import type { RunRecord } from "@/lib/types";

function toneForStatus(status: RunRecord["status"]) {
  if (status === "succeeded") return "ok" as const;
  if (status === "failed") return "danger" as const;
  if (status === "handed_off") return "warn" as const;
  return "info" as const;
}

export function RunsArchive({ initialRuns }: { initialRuns: RunRecord[] }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialRuns.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        item.question.toLowerCase().includes(q) ||
        (item.provider || "").toLowerCase().includes(q)
      );
    });
  }, [initialRuns, query, statusFilter]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>全部运行</CardTitle>
        <CardDescription>
          RunRecord 存档 · 共 {initialRuns.length} 条 · 当前显示 {filtered.length} 条
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="搜 Run ID / 问题 / Provider…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">全部状态</option>
            <option value="running">运行中</option>
            <option value="succeeded">已成功</option>
            <option value="failed">已失败</option>
            <option value="handed_off">已转交</option>
          </select>
          <Link className="inline-flex h-9 items-center text-sm underline" href={"/" as "/"}>
            回工作台
          </Link>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="没有匹配的运行" description="调整筛选，或先在工作台跑一次 Agent。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-2 font-medium">Run</th>
                  <th className="pb-2 font-medium">问题</th>
                  <th className="pb-2 font-medium">Provider</th>
                  <th className="pb-2 font-medium">来源</th>
                  <th className="pb-2 font-medium">状态</th>
                  <th className="pb-2 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="py-2">
                      <Link className="underline" href={`/runs/${item.id}` as "/"}>
                        {item.id}
                      </Link>
                    </td>
                    <td className="max-w-sm truncate">{item.question}</td>
                    <td>
                      <Badge variant="accent">{item.provider}</Badge>
                    </td>
                    <td className="text-muted-foreground">{item.source}</td>
                    <td>
                      <StatusLabel text={runStatusLabel[item.status]} tone={toneForStatus(item.status)} />
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      {item.createdAt?.replace("T", " ").slice(0, 19) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
