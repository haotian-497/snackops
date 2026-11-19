"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FeedbackBanner } from "@/components/feedback-banner";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionFeedback } from "@/hooks/use-action-state";
import type { RollbackHub } from "@/lib/ops/rollback-types";
import { cn } from "@/lib/utils";

type ApiOk<T> = { ok?: boolean; message?: string; hub?: RollbackHub } & T;

async function api<T>(url: string, init?: RequestInit): Promise<ApiOk<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await response.json()) as ApiOk<T>;
  if (!response.ok || json.ok === false) {
    throw new Error(json.message || "请求失败");
  }
  return json;
}

const KIND_LABEL: Record<string, string> = {
  skill: "Skill",
  planner: "Planner",
  tool: "Tool",
};

type SnapshotRow = {
  id: string;
  title: string;
  subtitle: string;
};

function SnapshotList({
  items,
  selectedId,
  onSelect,
  onRollback,
  onDelete,
  emptyText,
}: {
  items: SnapshotRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRollback: (id: string) => void;
  onDelete: (id: string) => void;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="max-h-52 space-y-1 overflow-y-auto text-sm">
      {items.map((item) => {
        const active = item.id === selectedId;
        return (
          <li
            key={item.id}
            className={cn(
              "flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5",
              active ? "border-border bg-secondary" : "hover:bg-muted/50",
            )}
          >
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(item.id)}>
              <span className="block truncate font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
            </button>
            <Button type="button" size="sm" variant="outline" onClick={() => onRollback(item.id)}>
              回滚
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="px-2 text-muted-foreground hover:text-red-700"
              aria-label="删除快照"
              onClick={() => {
                if (!window.confirm(`确认删除该快照？\n${item.title}`)) return;
                onDelete(item.id);
              }}
            >
              <X className="size-4" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function RollbackWorkbench({ initial }: { initial: RollbackHub }) {
  const [hub, setHub] = useState(initial);
  const action = useActionFeedback();

  const [skillId, setSkillId] = useState(hub.skills[0]?.id ?? "");
  const skillVersions = useMemo(
    () => hub.skillVersions.filter((item) => item.skillId === skillId),
    [hub.skillVersions, skillId],
  );
  const [skillVersionId, setSkillVersionId] = useState(skillVersions[0]?.id ?? "");

  const [plannerVersionId, setPlannerVersionId] = useState(hub.planner.versions[0]?.id ?? "");

  const [toolId, setToolId] = useState(hub.tools[0]?.id ?? "");
  const toolVersions = useMemo(
    () => hub.toolVersions.filter((item) => item.toolId === toolId),
    [hub.toolVersions, toolId],
  );
  const [toolVersionId, setToolVersionId] = useState(toolVersions[0]?.id ?? "");

  const [judgeVersionId, setJudgeVersionId] = useState(hub.judge.versions[0]?.id ?? "");
  const [llmVersionId, setLlmVersionId] = useState(hub.llm.versions[0]?.id ?? "");
  const [batchId, setBatchId] = useState(hub.evalBatches[0]?.id ?? "");

  useEffect(() => {
    if (!skillVersions.some((item) => item.id === skillVersionId)) {
      setSkillVersionId(skillVersions[0]?.id ?? "");
    }
  }, [skillVersions, skillVersionId]);

  useEffect(() => {
    if (!toolVersions.some((item) => item.id === toolVersionId)) {
      setToolVersionId(toolVersions[0]?.id ?? "");
    }
  }, [toolVersions, toolVersionId]);

  useEffect(() => {
    if (!hub.planner.versions.some((item) => item.id === plannerVersionId)) {
      setPlannerVersionId(hub.planner.versions[0]?.id ?? "");
    }
  }, [hub.planner.versions, plannerVersionId]);

  useEffect(() => {
    if (!hub.judge.versions.some((item) => item.id === judgeVersionId)) {
      setJudgeVersionId(hub.judge.versions[0]?.id ?? "");
    }
  }, [hub.judge.versions, judgeVersionId]);

  useEffect(() => {
    if (!hub.llm.versions.some((item) => item.id === llmVersionId)) {
      setLlmVersionId(hub.llm.versions[0]?.id ?? "");
    }
  }, [hub.llm.versions, llmVersionId]);

  async function runAction(body: Record<string, unknown>, failLabel: string) {
    return action.run(async () => {
      const result = await api<{ message?: string }>("/api/ops/rollback", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (result.hub) setHub(result.hub);
      toast.success(result.message || "完成");
      return result.message || "完成";
    }, failLabel);
  }

  return (
    <div className="space-y-5">
      <FeedbackBanner phase={action.phase} message={action.message} />

      <Card>
        <CardHeader>
          <CardTitle>撤销 A/B 晋升</CardTitle>
          <CardDescription>
            恢复晋升前自动快照，并把实验状态改回「可确认」。来源：
            <Link className="ml-1 underline" href={"/ops/prompt-ab" as "/ops"}>
              Prompt A/B
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hub.promotedExperiments.length === 0 ? (
            <EmptyState title="暂无已晋升实验" description="晋升成功后会出现在这里，可一键撤销。" />
          ) : (
            <ul className="space-y-2">
              {hub.promotedExperiments.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {item.name} · {KIND_LABEL[item.kind] || item.kind}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.id}
                      {item.promotedAt ? ` · 晋升于 ${item.promotedAt}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      runAction({ action: "undo-promote", experimentId: item.id }, "撤销晋升失败")
                    }
                  >
                    撤销晋升
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Skill 版本回滚</CardTitle>
            <CardDescription>当前 {hub.skills.find((s) => s.id === skillId)?.version ?? "—"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <select
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
              value={skillId}
              onChange={(event) => {
                const next = event.target.value;
                setSkillId(next);
                const first = hub.skillVersions.find((item) => item.skillId === next);
                setSkillVersionId(first?.id ?? "");
              }}
            >
              {hub.skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name} ({skill.id})
                </option>
              ))}
            </select>
            <SnapshotList
              items={skillVersions.map((item) => ({
                id: item.id,
                title: `${item.version} · ${item.changeNote || "无备注"}`,
                subtitle: item.createdAt,
              }))}
              selectedId={skillVersionId}
              onSelect={setSkillVersionId}
              onRollback={(id) =>
                runAction({ action: "rollback-skill", skillId, versionId: id }, "Skill 回滚失败")
              }
              onDelete={(id) =>
                runAction(
                  { action: "delete-skill-version", skillId, versionId: id },
                  "删除 Skill 快照失败",
                )
              }
              emptyText="暂无 Skill 快照"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Planner 版本回滚</CardTitle>
            <CardDescription>当前 {hub.planner.config.version}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <SnapshotList
              items={hub.planner.versions.map((item) => ({
                id: item.id,
                title: `${item.version} · ${item.changeNote || "无备注"}`,
                subtitle: item.createdAt,
              }))}
              selectedId={plannerVersionId}
              onSelect={setPlannerVersionId}
              onRollback={(id) =>
                runAction({ action: "rollback-planner", versionId: id }, "Planner 回滚失败")
              }
              onDelete={(id) =>
                runAction({ action: "delete-planner-version", versionId: id }, "删除 Planner 快照失败")
              }
              emptyText="暂无 Planner 快照"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tool 版本回滚</CardTitle>
            <CardDescription>列表右侧 × 仅删除快照，不会改当前线上配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <select
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
              value={toolId}
              onChange={(event) => {
                const next = event.target.value;
                setToolId(next);
                const first = hub.toolVersions.find((item) => item.toolId === next);
                setToolVersionId(first?.id ?? "");
              }}
            >
              {hub.tools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.name} ({tool.id})
                </option>
              ))}
            </select>
            <SnapshotList
              items={toolVersions.map((item) => ({
                id: item.id,
                title: item.changeNote || "无备注",
                subtitle: item.createdAt,
              }))}
              selectedId={toolVersionId}
              onSelect={setToolVersionId}
              onRollback={(id) =>
                runAction({ action: "rollback-tool", toolId, versionId: id }, "Tool 回滚失败")
              }
              onDelete={(id) =>
                runAction({ action: "delete-tool-version", toolId, versionId: id }, "删除 Tool 快照失败")
              }
              emptyText="暂无 Tool 快照"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>从测评批次对齐</CardTitle>
            <CardDescription>
              有覆盖则写回实验覆盖；否则按钉住的 skill@version 回滚。详见
              <Link className="ml-1 underline" href={"/ops/center" as "/ops"}>
                测评中心
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <select
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
              value={batchId}
              onChange={(event) => setBatchId(event.target.value)}
            >
              {hub.evalBatches.length === 0 ? (
                <option value="">暂无已结束批次</option>
              ) : (
                hub.evalBatches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.versionLabel || item.id} · 通过率{" "}
                    {Math.round((item.passRate || 0) * 100)}%{item.hasOverrides ? " · 含覆盖" : ""}
                  </option>
                ))
              )}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => runAction({ action: "restore-batch", batchId }, "批次对齐失败")}
              disabled={!batchId}
            >
              对齐到该批次配置
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Judge 评测提示词</CardTitle>
            <CardDescription>保存时自动快照；历史从本次部署后开始积累</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <SnapshotList
              items={hub.judge.versions.map((item) => ({
                id: item.id,
                title: item.changeNote || "无备注",
                subtitle: item.createdAt,
              }))}
              selectedId={judgeVersionId}
              onSelect={setJudgeVersionId}
              onRollback={(id) =>
                runAction({ action: "rollback-judge", versionId: id }, "Judge 回滚失败")
              }
              onDelete={(id) =>
                runAction({ action: "delete-judge-version", versionId: id }, "删除 Judge 快照失败")
              }
              emptyText="暂无快照（下次保存 Judge 后出现）"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LLM 配置</CardTitle>
            <CardDescription>
              当前 {hub.llm.config.provider} / {hub.llm.config.model}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <SnapshotList
              items={hub.llm.versions.map((item) => ({
                id: item.id,
                title: `${item.summary} · ${item.changeNote || "无备注"}`,
                subtitle: item.createdAt,
              }))}
              selectedId={llmVersionId}
              onSelect={setLlmVersionId}
              onRollback={(id) => runAction({ action: "rollback-llm", versionId: id }, "LLM 回滚失败")}
              onDelete={(id) =>
                runAction({ action: "delete-llm-version", versionId: id }, "删除 LLM 快照失败")
              }
              emptyText="暂无快照（下次改模型配置后出现）"
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>紧急启停</CardTitle>
          <CardDescription>坏版本可先停用止血，再决定回滚到哪一版</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Skill</p>
            <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {hub.skills.map((skill) => (
                <li key={skill.id} className="flex items-center justify-between gap-2 border-b border-border py-1.5">
                  <span className="truncate">
                    {skill.name}{" "}
                    <StatusLabel text={skill.enabled ? "启用" : "停用"} tone={skill.enabled ? "ok" : "warn"} />
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      runAction(
                        { action: "set-skill-enabled", skillId: skill.id, enabled: !skill.enabled },
                        "Skill 启停失败",
                      )
                    }
                  >
                    {skill.enabled ? "停用" : "启用"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Tool</p>
            <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {hub.tools.map((tool) => (
                <li key={tool.id} className="flex items-center justify-between gap-2 border-b border-border py-1.5">
                  <span className="truncate">
                    {tool.name}{" "}
                    <StatusLabel text={tool.enabled ? "启用" : "停用"} tone={tool.enabled ? "ok" : "warn"} />
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      runAction(
                        { action: "set-tool-enabled", toolId: tool.id, enabled: !tool.enabled },
                        "Tool 启停失败",
                      )
                    }
                  >
                    {tool.enabled ? "停用" : "启用"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
