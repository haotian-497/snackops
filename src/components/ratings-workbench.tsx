"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Rating } from "@/lib/types";

type RatingStats = {
  total: number;
  avgScore: number;
  lowCount: number;
  lowRate: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  byIssueType: Record<string, number>;
  uniqueRuns: number;
  coverage: number;
  channel: string;
};

export function RatingsWorkbench({
  initialRatings,
  initialStats,
}: {
  initialRatings: Rating[];
  initialStats: RatingStats;
}) {
  const [channel, setChannel] = useState<"user" | "ops" | "all">("user");
  const [scoreFilter, setScoreFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ratings] = useState(initialRatings);
  const [stats] = useState(initialStats);

  const visible = useMemo(() => {
    return ratings.filter((item) => {
      const itemChannel = item.channel === "user" ? "user" : "ops";
      if (channel !== "all" && itemChannel !== channel) return false;
      if (scoreFilter && String(item.score) !== scoreFilter) return false;
      if (typeFilter && !(item.issueType || "other").includes(typeFilter)) return false;
      return true;
    });
  }, [channel, ratings, scoreFilter, typeFilter]);

  const displayStats = useMemo(() => {
    if (channel === "user" || channel === stats.channel) return stats;
    const scoped = ratings.filter((item) => {
      const itemChannel = item.channel === "user" ? "user" : "ops";
      return channel === "all" ? true : itemChannel === channel;
    });
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const byIssueType: Record<string, number> = {};
    let sum = 0;
    let low = 0;
    for (const item of scoped) {
      const score = Math.min(5, Math.max(1, Math.round(item.score))) as 1 | 2 | 3 | 4 | 5;
      distribution[score] += 1;
      sum += item.score;
      if (item.score <= 2) low += 1;
      const issue = item.issueType || "other";
      byIssueType[issue] = (byIssueType[issue] ?? 0) + 1;
    }
    const total = scoped.length;
    return {
      ...stats,
      total,
      avgScore: total ? Math.round((sum / total) * 10) / 10 : 0,
      lowCount: low,
      lowRate: total ? Math.round((low / total) * 1000) / 10 : 0,
      distribution,
      byIssueType,
      uniqueRuns: new Set(scoped.map((item) => item.runId)).size,
      channel,
    };
  }, [channel, ratings, stats]);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>服务评价</CardTitle>
          <CardDescription>
            默认看用户侧 1–5 分。低分会进入改进建议，并可跳转标注。Demo 在一轮对话结束后，20 秒无回复或用户明确结束再打分。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "user", label: "用户评价" },
                { id: "ops", label: "运营代评" },
                { id: "all", label: "全部" },
              ] as const
            ).map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={channel === item.id ? "default" : "outline"}
                onClick={() => setChannel(item.id)}
              >
                {item.label}
              </Button>
            ))}
            <Link href={"/demo" as "/"} className="inline-flex h-8 items-center text-sm underline">
              打开 Demo 打分
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="评价数" value={String(displayStats.total)} />
            <Metric label="均分" value={displayStats.total ? String(displayStats.avgScore) : "—"} />
            <Metric label="低分率 ≤2" value={displayStats.total ? `${displayStats.lowRate}%` : "—"} />
            <Metric label="低分数" value={String(displayStats.lowCount)} />
            <Metric label="覆盖率" value={displayStats.coverage ? `${displayStats.coverage}%` : "—"} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs text-muted-foreground">分数分布</p>
              <ul className="space-y-1 text-sm">
                {([5, 4, 3, 2, 1] as const).map((score) => (
                  <li key={score} className="flex items-center gap-2">
                    <span className="w-8">{score} 分</span>
                    <div className="h-2 flex-1 rounded bg-muted">
                      <div
                        className="h-2 rounded bg-foreground/70"
                        style={{
                          width: displayStats.total
                            ? `${Math.max(4, (displayStats.distribution[score] / displayStats.total) * 100)}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-muted-foreground">{displayStats.distribution[score]}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs text-muted-foreground">问题类型</p>
              {Object.keys(displayStats.byIssueType).length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {Object.entries(displayStats.byIssueType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([issue, count]) => (
                      <li key={issue} className="flex justify-between gap-2">
                        <span>{issue}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>评价列表</CardTitle>
          <CardDescription>点击「运行详情」会先展示该条评分与原因；低分可去标注。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-28"
              placeholder="分数"
              value={scoreFilter}
              onChange={(event) => setScoreFilter(event.target.value)}
            />
            <Input
              className="w-40"
              placeholder="问题类型"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            />
          </div>
          {visible.length === 0 ? (
            <EmptyState title="没有评价" description="先在 Demo 对话里给回复打分，或由运营代评。" />
          ) : (
            <ul className="space-y-2">
              {visible.map((item) => (
                <li key={item.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusLabel
                      text={`${item.score} 分`}
                      tone={item.score <= 2 ? "danger" : item.score >= 4 ? "ok" : "warn"}
                    />
                    <StatusLabel text={item.channel === "user" ? "用户" : "运营"} tone="neutral" />
                    <StatusLabel text={item.issueType || "other"} tone="info" />
                    <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 line-clamp-2">{item.question || "（无问题摘要）"}</p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{item.reply || "（无回复摘要）"}</p>
                  {item.comment ? <p className="mt-1 text-xs">备注：{item.comment}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link
                      href={`/runs/${item.runId}?from=rating&ratingId=${encodeURIComponent(item.id)}` as "/"}
                      className="underline"
                    >
                      运行详情
                    </Link>
                    {item.score <= 2 ? (
                      <Link href={`/ops/annotate?run=${encodeURIComponent(item.runId)}` as "/ops"} className="underline">
                        去标注
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
