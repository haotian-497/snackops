"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { FeedbackBanner } from "@/components/feedback-banner";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VersionSnapshotPanel } from "@/components/version-snapshot-panel";
import { useActionFeedback } from "@/hooks/use-action-state";
import type { DiffLine } from "@/lib/skills/diff";
import type { Tool } from "@/lib/types";
import { cn } from "@/lib/utils";

type TestPayload = {
  ok?: boolean;
  message?: string;
  input?: Record<string, unknown>;
  durationMs?: number;
  invoked?: boolean;
  result?: {
    ok?: boolean;
    data?: unknown;
    error?: { message?: string; code?: string };
  };
};

type ToolVersionRow = {
  id: string;
  toolId: string;
  createdAt: string;
  changeNote: string;
  name: string;
  timeoutMs?: number;
  enabled: boolean;
};

export function ToolsWorkbench({
  initialTools,
  samples,
  examples,
}: {
  initialTools: Tool[];
  samples: Record<string, Record<string, unknown>>;
  examples: Record<string, Record<string, unknown>>;
}) {
  const [tools, setTools] = useState(initialTools);
  const [selectedId, setSelectedId] = useState(initialTools[0]?.id ?? "");
  const [description, setDescription] = useState(initialTools[0]?.description ?? "");
  const [timeoutMs, setTimeoutMs] = useState(String(initialTools[0]?.timeoutMs ?? 1500));
  const [changeNote, setChangeNote] = useState("运营修订 Tool 配置");
  const [inputText, setInputText] = useState(JSON.stringify(samples[initialTools[0]?.id ?? ""] ?? {}, null, 2));
  const [lastInput, setLastInput] = useState<Record<string, unknown> | null>(null);
  const [lastOutput, setLastOutput] = useState<unknown>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [testError, setTestError] = useState("");
  const [versions, setVersions] = useState<ToolVersionRow[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const saveAction = useActionFeedback();
  const testAction = useActionFeedback();
  const toggleAction = useActionFeedback();
  const versionAction = useActionFeedback();

  const selected = tools.find((item) => item.id === selectedId);

  async function loadVersions(toolId: string) {
    const response = await fetch(`/api/tools/${encodeURIComponent(toolId)}/versions`);
    const json = (await response.json()) as { ok?: boolean; message?: string; versions?: ToolVersionRow[] };
    if (!response.ok || !json.versions) {
      throw new Error(json.message || "加载版本失败");
    }
    setVersions(json.versions);
    return json.versions;
  }

  useEffect(() => {
    if (!selected) return;
    setDescription(selected.description);
    setTimeoutMs(String(selected.timeoutMs));
    setSelectedVersionId("");
    setDiffLines([]);
    void loadVersions(selected.id).catch(() => setVersions([]));
  }, [selected?.id]);

  function selectTool(id: string) {
    setSelectedId(id);
    setInputText(JSON.stringify(samples[id] ?? {}, null, 2));
    setLastInput(null);
    setLastOutput(null);
    setDurationMs(null);
    setTestError("");
  }

  async function refresh() {
    const response = await fetch("/api/tools");
    const json = (await response.json()) as { ok?: boolean; message?: string; tools?: Tool[] };
    if (!response.ok || !json.tools) {
      throw new Error(json.message || "刷新 Tool 列表失败");
    }
    setTools(json.tools);
    return json.tools;
  }

  async function compareVersion(versionId: string) {
    if (!selected) return;
    setSelectedVersionId(versionId);
    setDiffLoading(true);
    try {
      const response = await fetch(
        `/api/tools/${encodeURIComponent(selected.id)}/diff?from=${encodeURIComponent(versionId)}`,
      );
      const json = (await response.json()) as { ok?: boolean; message?: string; diff?: { lines: DiffLine[] } };
      if (!response.ok || !json.diff) throw new Error(json.message || "对比失败");
      setDiffLines(json.diff.lines);
    } catch (error) {
      setDiffLines([]);
      toast.error(error instanceof Error ? error.message : "对比失败");
    } finally {
      setDiffLoading(false);
    }
  }

  if (!selected) {
    return <EmptyState title="暂无 Tool" description="tools.json 中没有可管理的 Tool。" />;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-12">
      <Card className="min-w-0 lg:col-span-4">
        <CardHeader>
          <CardTitle>Tool 注册表</CardTitle>
          <CardDescription>Executor 只调用已启用项；测试始终打服务端</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => selectTool(tool.id)}
              className={cn(
                "flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left text-sm",
                selectedId === tool.id ? "bg-secondary" : "hover:bg-muted/50",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{tool.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{tool.id}</span>
              </span>
              <StatusLabel
                text={tool.enabled ? "已启用" : "已停用"}
                tone={tool.enabled ? "ok" : "neutral"}
              />
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="min-w-0 lg:col-span-8">
        <CardHeader>
          <CardTitle className="break-words">{selected.name}</CardTitle>
          <CardDescription className="break-all">
            {selected.id} · status {selected.status}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-3 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">配置</p>
              <p className="text-xs text-muted-foreground">
                description 给 Planner 选工具用；timeout 为调用时限配置（本地 JSON Tool 当前多为记录用途）。
              </p>
            </div>
            <label className="block space-y-1 text-sm">
              <span>description</span>
              <Textarea
                className="min-h-24 text-sm"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">
                <span>timeoutMs（毫秒）</span>
                <Input
                  type="number"
                  min={1}
                  max={120000}
                  value={timeoutMs}
                  onChange={(event) => setTimeoutMs(event.target.value)}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>版本说明</span>
                <Input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() =>
                  saveAction.run(async () => {
                    const parsedTimeout = Number(timeoutMs);
                    if (!description.trim()) throw new Error("description 不能为空");
                    if (!Number.isInteger(parsedTimeout) || parsedTimeout <= 0) {
                      throw new Error("timeoutMs 必须是正整数");
                    }
                    const unchanged =
                      description.trim() === selected.description && parsedTimeout === selected.timeoutMs;
                    const response = await fetch(`/api/tools/${selected.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        description: description.trim(),
                        timeoutMs: parsedTimeout,
                        changeNote: changeNote || "运营修订 Tool 配置",
                      }),
                    });
                    const json = (await response.json()) as { message?: string; tool?: Tool };
                    if (!response.ok) throw new Error(json.message || "保存失败");
                    await refresh();
                    await loadVersions(selected.id);
                    setSelectedVersionId("");
                    setDiffLines([]);
                    const message = unchanged
                      ? "已保存（内容未变，未新增快照）"
                      : json.message || "已保存 Tool 配置";
                    toast.success(message);
                    return message;
                  }, "保存失败")
                }
              >
                保存配置
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  toggleAction.run(async () => {
                    const response = await fetch(`/api/tools/${selected.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ enabled: !selected.enabled }),
                    });
                    const json = (await response.json()) as { message?: string };
                    if (!response.ok) throw new Error(json.message || "切换失败");
                    await refresh();
                    toast.success(json.message || "已更新");
                    return json.message || "已更新";
                  }, "切换失败")
                }
              >
                {selected.enabled ? "停用" : "启用"}
              </Button>
            </div>
            <FeedbackBanner phase={saveAction.phase} message={saveAction.message} />
            <FeedbackBanner phase={toggleAction.phase} message={toggleAction.message} />
            <FeedbackBanner phase={versionAction.phase} message={versionAction.message} />
            <VersionSnapshotPanel
              items={versions.map((item) => ({
                id: item.id,
                createdAt: item.createdAt,
                note: item.changeNote,
                badge: item.timeoutMs != null ? `${item.timeoutMs}ms` : undefined,
              }))}
              selectedId={selectedVersionId}
              diffLines={diffLines}
              loading={diffLoading || versionAction.phase === "loading"}
              onSelect={(id) => void compareVersion(id)}
              onManualSnapshot={() =>
                versionAction.run(async () => {
                  const response = await fetch(`/api/tools/${encodeURIComponent(selected.id)}/versions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ changeNote: changeNote || "添加快照" }),
                  });
                  const json = (await response.json()) as { message?: string };
                  if (!response.ok) throw new Error(json.message || "添加快照失败");
                  await loadVersions(selected.id);
                  toast.success(json.message || "已添加快照");
                  return json.message || "已添加快照";
                }, "添加快照失败")
              }
            />
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-xs text-muted-foreground">输入 schema（只读）</p>
              <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                {JSON.stringify(selected.inputSchema, null, 2)}
              </pre>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs text-muted-foreground">输出示例（只读）</p>
              <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                {JSON.stringify(examples[selected.id] ?? selected.outputSchema, null, 2)}
              </pre>
            </div>
          </div>

          <label className="block space-y-1 text-sm">
            <span>测试输入</span>
            <Textarea
              className="min-h-32 font-mono text-xs"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
            />
          </label>
          <Button
            type="button"
            onClick={() =>
              testAction.run(async () => {
                let parsed: Record<string, unknown> = {};
                try {
                  parsed = JSON.parse(inputText) as Record<string, unknown>;
                } catch {
                  throw new Error("测试输入不是合法 JSON");
                }
                const response = await fetch(`/api/tools/${selected.id}/test`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ input: parsed }),
                });
                const json = (await response.json()) as TestPayload;
                setLastInput(json.input ?? parsed);
                setDurationMs(json.durationMs ?? null);
                setLastOutput(json.result ?? json);
                if (!json.invoked) {
                  throw new Error("服务端未调用 Tool，已拒绝显示客户端伪造结果");
                }
                if (!response.ok || json.ok === false || json.result?.ok === false) {
                  setTestError(json.message || json.result?.error?.message || "测试失败");
                  throw new Error(json.message || json.result?.error?.message || "测试失败");
                }
                setTestError("");
                toast.success(json.message || "测试完成");
                return `${json.message || "测试完成"} · ${json.durationMs ?? 0}ms`;
              }, "测试失败")
            }
          >
            测试
          </Button>
          <FeedbackBanner phase={testAction.phase} message={testAction.message} />
          {lastInput || lastOutput || testError ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1 text-xs text-muted-foreground">真实输入</p>
                <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                  {JSON.stringify(lastInput, null, 2)}
                </pre>
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs text-muted-foreground">
                  真实输出{durationMs !== null ? ` · ${durationMs}ms` : ""}
                </p>
                <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                  {JSON.stringify(lastOutput, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <EmptyState title="尚未测试" description="点击测试后会显示服务端真实输入、输出和耗时。" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
