"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { EvalBatchPanel } from "@/components/eval-batch-panel";
import { JudgePromptCard } from "@/components/judge-prompt-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvalBatch, EvalCase, JudgeConfig } from "@/lib/types";

export function EvalCenter({
  initialCases,
  initialBatches = [],
  initialJudgeConfig,
  initialBatchId = "",
  initialCaseId = "",
}: {
  initialCases: EvalCase[];
  initialBatches?: EvalBatch[];
  initialJudgeConfig: JudgeConfig;
  initialBatchId?: string;
  initialCaseId?: string;
}) {
  const enabled = useMemo(() => initialCases.filter((item) => item.enabled), [initialCases]);
  const lastRunBatch = [...initialBatches]
    .filter((item) => (item.caseResults?.length ?? 0) > 0)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const [suiteTag, setSuiteTag] = useState<"all" | "annotation" | "ab-smoke">("all");
  const visible = useMemo(() => {
    if (suiteTag === "all") return enabled;
    return enabled.filter((item) => (item.tags ?? []).includes(suiteTag));
  }, [enabled, suiteTag]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>(() => enabled.map((item) => item.id));
  const [runNonce, setRunNonce] = useState(0);

  function toggle(id: string, checked: boolean) {
    setSelectedCaseIds((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  }

  function selectSuite(tag: typeof suiteTag) {
    setSuiteTag(tag);
    const next = tag === "all" ? enabled : enabled.filter((item) => (item.tags ?? []).includes(tag));
    setSelectedCaseIds(next.map((item) => item.id));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>测评中心</CardTitle>
          <CardDescription>
            勾选用例后点「批量测试」。可用「AB 烟测」只跑 Prompt A/B 人造用例。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "all", label: "全部启用" },
                { id: "ab-smoke", label: "AB 烟测" },
                { id: "annotation", label: "标注转入" },
              ] as const
            ).map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={suiteTag === item.id ? "default" : "outline"}
                onClick={() => selectSuite(item.id)}
              >
                {item.label}
              </Button>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedCaseIds(visible.map((item) => item.id))}>
              全选当前
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedCaseIds([])}>
              清空勾选
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!selectedCaseIds.length}
              onClick={() => setRunNonce((current) => current + 1)}
            >
              批量测试
            </Button>
            <p className="text-xs text-muted-foreground">
              可见 {visible.length} · 已勾选 {selectedCaseIds.length} 条
            </p>
          </div>
          {visible.length === 0 ? (
            <EmptyState title="当前套件没有启用用例" description="换套件，或到测评集添加/打标签。" />
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {visible.map((item) => (
                <li key={item.id} className="flex items-start gap-3 rounded-md border border-border px-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={`勾选 ${item.name}`}
                    checked={selectedCaseIds.includes(item.id)}
                    onChange={(event) => toggle(item.id, event.target.checked)}
                  />
                  <div className="min-w-0">
                    <p className="font-medium leading-6">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.question || "无问题摘要"}</p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {item.category} · {(item.tags ?? []).join(" / ") || "无标签"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <JudgePromptCard initialConfig={initialJudgeConfig} />

      <EvalBatchPanel
        cases={initialCases}
        selectedCaseIds={selectedCaseIds}
        initialBatches={initialBatches}
        initialBatchId={initialBatchId}
        initialCaseId={initialCaseId}
        requireSelection
        runNonce={runNonce}
      />
    </div>
  );
}
