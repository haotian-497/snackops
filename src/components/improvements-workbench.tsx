"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { FeedbackBanner } from "@/components/feedback-banner";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/hooks/use-action-state";
import { diffText } from "@/lib/skills/diff";
import type { ImprovementSamplePreview, ImprovementWithSamples } from "@/lib/ops/improvement-samples";
import type { Improvement, Skill, Tool } from "@/lib/types";

type ImprovementFunnel = {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  withDraft: number;
  applied: number;
  draftRate: number;
  applyRate: number;
  bySource: Record<string, number>;
  byTarget: Record<string, number>;
};

type ApiOk<T> = { ok?: boolean; message?: string } & T;

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

const SOURCE_LABEL: Record<string, string> = {
  rating: "评分",
  annotation: "标注",
  eval: "测评",
  bad_case: "Bad Case",
};

const STATUS_LABEL: Record<string, string> = {
  open: "待处理",
  in_progress: "进行中",
  done: "已完成",
};

export function ImprovementsWorkbench({
  initialItems,
  initialFunnel,
  skills,
  tools,
  initialSelectedId,
}: {
  initialItems: ImprovementWithSamples[];
  initialFunnel: ImprovementFunnel;
  skills: Skill[];
  tools: Tool[];
  initialSelectedId?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [funnel, setFunnel] = useState(initialFunnel);
  const [selectedId, setSelectedId] = useState(
    initialSelectedId && initialItems.some((item) => item.id === initialSelectedId)
      ? initialSelectedId
      : (initialItems[0]?.id ?? ""),
  );
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [clusterFilter, setClusterFilter] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [ownerDraft, setOwnerDraft] = useState("");
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftKind, setDraftKind] = useState<"skill" | "planner" | "tool" | "">("");
  const [draftMode, setDraftMode] = useState<"rule" | "llm">("rule");
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const [createRunId, setCreateRunId] = useState("");
  const [createNote, setCreateNote] = useState("");
  const action = useActionFeedback();

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (sourceFilter && item.source !== sourceFilter) return false;
      if (clusterFilter && !(item.cluster || "").includes(clusterFilter)) return false;
      if (skillFilter && item.skillId !== skillFilter) return false;
      return true;
    });
  }, [clusterFilter, items, skillFilter, sourceFilter, statusFilter]);

  async function reload(preferId?: string) {
    const next = await api<{ improvements: ImprovementWithSamples[]; funnel: ImprovementFunnel }>("/api/improvements");
    setItems(next.improvements);
    setFunnel(next.funnel);
    const id = preferId || selectedId;
    if (id && next.improvements.some((item) => item.id === id)) {
      setSelectedId(id);
    } else {
      setSelectedId(next.improvements[0]?.id ?? "");
    }
  }

  function selectItem(item: ImprovementWithSamples) {
    setSelectedId(item.id);
    setOwnerDraft(item.owner);
    setSelectedRuns([]);
    setDraftPrompt(item.draftPrompt || "");
    setCurrentPrompt("");
    setDraftKind(
      item.target === "tool" ? "tool" : item.target === "planner" ? "planner" : item.draftPrompt ? "skill" : "",
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>改进漏斗</CardTitle>
          <CardDescription>open → 有草案 → 已应用；回归通过率请在测评中心按批次查看</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="待处理" value={String(funnel.open)} />
          <Metric label="进行中" value={String(funnel.inProgress)} />
          <Metric label="有草案" value={`${funnel.withDraft}（${funnel.draftRate}%）`} />
          <Metric label="已应用" value={`${funnel.applied}（${funnel.applyRate}%）`} />
          <Metric label="总数" value={String(funnel.total)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>改进列表</CardTitle>
            <CardDescription>
              <StatusLabel text="同根因归并" tone="ok" /> 相同根因的 Bad Case 并进同一张改进单；全部样本均为 Prompt A/B 焦点题
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">全部状态</option>
                <option value="open">待处理</option>
                <option value="in_progress">进行中</option>
                <option value="done">已完成</option>
              </select>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="">全部来源</option>
                <option value="rating">评分</option>
                <option value="annotation">标注</option>
                <option value="eval">测评</option>
                <option value="bad_case">Bad Case</option>
              </select>
              <Input
                placeholder="聚类含…"
                value={clusterFilter}
                onChange={(e) => setClusterFilter(e.target.value)}
              />
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
              >
                <option value="">全部 Skill</option>
                {skills
                  .filter((skill) => !skill.id.includes("__pab_"))
                  .map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="没有匹配的改进建议" description="调整筛选，或从评分/标注/测评失败回流。" />
            ) : (
              <ul className="max-h-[28rem] space-y-1 overflow-auto text-sm">
                {filtered.map((item) => (
                  <li
                    key={item.id}
                    className={`relative rounded-md border ${
                      item.id === selectedId ? "border-foreground/30 bg-muted" : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full px-2 py-2 pr-12 text-left"
                      onClick={() => selectItem(item)}
                    >
                      <span className="font-medium">{item.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {item.diagnosis ? (
                          <>
                            <span className="rounded border border-[#e4d8c8] bg-[#f0e4d4] px-1.5 py-0.5 text-[#8a4b24]">
                              {item.diagnosis.summary}
                            </span>
                            {(item.diagnosis.needsConfirm && !item.diagnosisConfirmed) ||
                            item.diagnosis.confidence !== "high" ? (
                              <span className="rounded border border-[#e8c4a0] bg-[#fff6eb] px-1.5 py-0.5 text-[#9a5b2f]">
                                待确认 · 置信度
                                {item.diagnosis.confidence === "high"
                                  ? "高"
                                  : item.diagnosis.confidence === "medium"
                                    ? "中"
                                    : "低"}
                              </span>
                            ) : (
                              <span className="rounded border border-border bg-secondary/80 px-1.5 py-0.5 text-muted-foreground">
                                置信度高
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {item.target || "skill"} · 未做链路归因
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {STATUS_LABEL[item.status] || item.status} · {SOURCE_LABEL[item.source] || item.source}
                        {item.diagnosis?.rootCauseKey ? ` · ${item.diagnosis.rootCauseKey}` : ""}
                        {(item.samples?.length ?? 0) > 0 ? ` · 焦点 ${item.samples.length}` : ""}
                      </span>
                      {(item.samples?.[0] || null) && (
                        <span className="mt-1 block text-xs leading-5 text-foreground/80 line-clamp-2">
                          焦点问：{item.samples[0].question}
                          {(item.samples?.length ?? 0) > 1 ? ` 等 ${item.samples.length} 条` : ""}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 z-10 rounded border border-border bg-secondary/90 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground transition-colors hover:border-[#d4b896] hover:bg-[#f0e4d4] hover:text-[#8a4b24]"
                      disabled={action.phase === "loading"}
                      onClick={(event) => {
                        event.stopPropagation();
                        action.run(async () => {
                          const tip = item.promptAbExperimentId
                            ? "确定删除该改进建议？关联的 Prompt A/B 实验不会自动删除，可在 A/B 页单独删。"
                            : "确定删除该改进建议？";
                          if (!window.confirm(tip)) return "已取消删除";
                          await api(`/api/improvements/${item.id}`, { method: "DELETE" });
                          await reload();
                          if (selectedId === item.id) {
                            setDraftPrompt("");
                            setCurrentPrompt("");
                            setDraftKind("");
                          }
                          return "已删除改进建议";
                        }, "删除失败");
                      }}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">手动创建（含测评回流）</p>
              <Input placeholder="Run ID（可选）" value={createRunId} onChange={(e) => setCreateRunId(e.target.value)} />
              <Textarea
                placeholder="备注 / 失败原因"
                value={createNote}
                onChange={(e) => setCreateNote(e.target.value)}
                rows={2}
              />
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  action.run(async () => {
                    const result = await api<{ improvement: Improvement }>("/api/improvements", {
                      method: "POST",
                      body: JSON.stringify({
                        title: createNote ? `手动改进：${createNote.slice(0, 20)}` : "手动改进建议",
                        source: "eval",
                        runId: createRunId || undefined,
                        note: createNote || "运营手动创建",
                      }),
                    });
                    setCreateNote("");
                    await reload(result.improvement.id);
                    selectItem({ ...result.improvement, samples: [] });
                    return result.message || "已创建";
                  }, "创建失败")
                }
              >
                创建改进建议
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>详情与草案</CardTitle>
            <CardDescription>
              服务评价看分数 · 数据标注看标签 · 本页决定改什么 · 测评中心验证改得对不对
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <EmptyState title="请选择一条改进建议" description="左侧列表点选后可生成草案并应用。" />
            ) : (
              <>
                <div className="space-y-1 text-sm">
                  <p className="text-base font-medium">{selected.title}</p>
                  <p className="text-muted-foreground">
                    {STATUS_LABEL[selected.status]} · {SOURCE_LABEL[selected.source]}
                    {selected.diagnosis?.rootCauseKey ? ` · 归因键 ${selected.diagnosis.rootCauseKey}` : ""}
                  </p>
                  {selected.note ? <p className="whitespace-pre-wrap break-words text-xs">{selected.note}</p> : null}
                </div>

                {selected.diagnosis ? (
                  <div className="space-y-2 rounded-md border border-[#e4d8c8] bg-[#fffaf3] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">链路归因（优先改这里）</p>
                      {selected.diagnosis.needsConfirm && !selected.diagnosisConfirmed ? (
                        <StatusLabel text="待确认" tone="warn" />
                      ) : (
                        <StatusLabel text="已确认/高置信" tone="ok" />
                      )}
                    </div>
                    <p className="text-sm text-[#8a4b24]">{selected.diagnosis.summary}</p>
                    <p className="text-xs text-muted-foreground">{selected.diagnosis.rationale}</p>
                    {(selected.diagnosis.evidence ?? []).length > 0 ? (
                      <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                        {selected.diagnosis.evidence.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {selected.diagnosis.needsConfirm && !selected.diagnosisConfirmed ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          action.run(async () => {
                            await api(`/api/improvements/${selected.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({
                                target: selected.target || selected.diagnosis?.target,
                                skillId: selected.skillId,
                                diagnosisConfirmed: true,
                              }),
                            });
                            await reload(selected.id);
                            return "已确认归因，可生成草案 / 送 Prompt A/B";
                          }, "确认失败")
                        }
                      >
                        确认此归因
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-sm font-medium">改进目标（可改）</p>
                  <p className="text-xs text-muted-foreground">
                    转入 Bad Case 时已按 Trace 预填嫌疑目标。手动改目标后视为已确认，请重新生成草案。
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">归类</label>
                      <select
                        className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                        value={
                          selected.target === "planner" || selected.target === "tool" || selected.target === "skill"
                            ? selected.target
                            : "skill"
                        }
                        onChange={(e) => {
                          const target = e.target.value as "skill" | "planner" | "tool";
                          void action.run(async () => {
                            await api(`/api/improvements/${selected.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ target }),
                            });
                            setDraftPrompt("");
                            setCurrentPrompt("");
                            setDraftKind("");
                            await reload(selected.id);
                            return `目标已改为 ${target}，请重新生成草案`;
                          }, "更新目标失败");
                        }}
                      >
                        <option value="skill">Skill（改回复/审核 Prompt）</option>
                        <option value="planner">Planner（改路由与选 Skill/Tool）</option>
                        <option value="tool">Tool（改工具描述或启用）</option>
                      </select>
                    </div>
                    {selected.target !== "planner" ? (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          {selected.target === "tool" ? "目标 Tool" : "目标 Skill"}
                        </label>
                        <select
                          className="h-9 min-w-[12rem] rounded-md border border-border bg-card px-2 text-sm"
                          value={selected.skillId || ""}
                          onChange={(e) => {
                            const skillId = e.target.value;
                            void action.run(async () => {
                              await api(`/api/improvements/${selected.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ skillId }),
                              });
                              setDraftPrompt("");
                              setCurrentPrompt("");
                              setDraftKind("");
                              await reload(selected.id);
                              return selected.target === "tool"
                                ? `Tool 已设为 ${skillId}`
                                : `Skill 已设为 ${skillId}`;
                            }, "更新关联失败");
                          }}
                        >
                          <option value="">未指定</option>
                          {selected.target === "tool"
                            ? tools.map((tool) => (
                                <option key={tool.id} value={tool.id}>
                                  {tool.name || tool.id}
                                </option>
                              ))
                            : skills
                                .filter((skill) => !skill.id.includes("__pab_"))
                                .map((skill) => (
                                <option key={skill.id} value={skill.id}>
                                  {skill.name || skill.id}
                                </option>
                              ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">焦点样本（同根因）</p>
                  <p className="text-xs text-muted-foreground">
                    并进本单的样本都会作为 Prompt A/B 焦点题；多样本可勾选拆出。看用户问题即可，不必记 Run 编号。
                  </p>
                  {(selected.samples ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无样本（手动创建且未填 Run）</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {(selected.samples as ImprovementSamplePreview[]).map((sample) => (
                        <li key={sample.runId} className="rounded-md border border-border bg-card p-2">
                          <label className="flex items-start gap-2">
                            <input
                              className="mt-1"
                              type="checkbox"
                              checked={selectedRuns.includes(sample.runId)}
                              onChange={(e) => {
                                setSelectedRuns((prev) =>
                                  e.target.checked ? [...prev, sample.runId] : prev.filter((id) => id !== sample.runId),
                                );
                              }}
                            />
                            <span className="min-w-0 flex-1 space-y-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded border border-[#e4d8c8] bg-[#f0e4d4] px-1.5 py-0.5 text-[11px] text-[#8a4b24]">
                                  焦点
                                </span>
                                <span className="font-medium leading-5">{sample.question}</span>
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                回复：{sample.replyPreview}
                                {sample.emptyReply ? " · 空回复" : ""}
                              </span>
                              <span className="flex flex-wrap gap-2 text-xs">
                                <Link className="underline" href={`/ops?run=${sample.runId}` as "/ops"}>
                                  看完整 Trace
                                </Link>
                                <Link className="underline" href={`/ops/annotate?runId=${sample.runId}` as "/ops"}>
                                  回标注页
                                </Link>
                                <span className="text-muted-foreground">{sample.runId}</span>
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(selected.samples?.length ?? 0) > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedRuns.length === 0}
                      onClick={() =>
                        action.run(async () => {
                          const result = await api<{ split: Improvement }>("/api/improvements/split", {
                            method: "POST",
                            body: JSON.stringify({ improvementId: selected.id, runIds: selectedRuns }),
                          });
                          setSelectedRuns([]);
                          await reload(result.split.id);
                          return result.message || "已拆分";
                        }, "拆分失败")
                      }
                    >
                      拆出勾选样本为新建议
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">负责人</label>
                    <Input
                      className="w-36"
                      value={ownerDraft || selected.owner}
                      onChange={(e) => setOwnerDraft(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      action.run(async () => {
                        const result = await api<{ improvement: Improvement }>(`/api/improvements/${selected.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ owner: (ownerDraft || selected.owner).trim() || "运营" }),
                        });
                        await reload(selected.id);
                        return result.message || "已更新负责人";
                      }, "更新失败")
                    }
                  >
                    保存负责人
                  </Button>
                  {selected.status !== "done" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        action.run(async () => {
                          const nextStatus = selected.status === "open" ? "in_progress" : "done";
                          const result = await api<{ improvement: Improvement }>(`/api/improvements/${selected.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: nextStatus }),
                          });
                          await reload(selected.id);
                          return `状态 → ${STATUS_LABEL[nextStatus]}`;
                        }, "状态更新失败")
                      }
                    >
                      {selected.status === "open" ? "标为进行中" : "标为完成"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        action.run(async () => {
                          await api(`/api/improvements/${selected.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: "open" }),
                          });
                          await reload(selected.id);
                          return "已重新打开";
                        }, "重开失败")
                      }
                    >
                      重新打开
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                    value={draftMode}
                    onChange={(e) => setDraftMode(e.target.value as "rule" | "llm")}
                  >
                    <option value="rule">规则草案</option>
                    <option value="llm">LLM 辅助草案</option>
                  </select>
                  <Button
                    type="button"
                    onClick={() =>
                      action.run(async () => {
                        const result = await api<{
                          currentPrompt: string;
                          draftPrompt: string;
                          kind: "skill" | "planner" | "tool";
                          mode: "rule" | "llm";
                          improvement: Improvement;
                        }>("/api/improvements/generate-prompt", {
                          method: "POST",
                          body: JSON.stringify({
                            improvementId: selected.id,
                            skillId: selected.skillId,
                            mode: draftMode,
                          }),
                        });
                        setCurrentPrompt(result.currentPrompt);
                        setDraftPrompt(result.draftPrompt);
                        setDraftKind(result.kind);
                        await reload(selected.id);
                        return result.message || "已生成草案";
                      }, "生成草案失败")
                    }
                  >
                    生成草案
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      action.run(async () => {
                        if (!(draftPrompt || selected.draftPrompt)) {
                          throw new Error("请先生成草案");
                        }
                        if (selected.diagnosis?.needsConfirm && !selected.diagnosisConfirmed) {
                          if (
                            !window.confirm(
                              `当前归因仍为「待确认」（${selected.diagnosis.summary}）。确定按此目标送 Prompt A/B？`,
                            )
                          ) {
                            return "已取消送入 A/B";
                          }
                        }
                        const result = await api<{ experiment: { id: string }; message?: string }>("/api/prompt-ab", {
                          method: "POST",
                          body: JSON.stringify({ improvementId: selected.id }),
                        });
                        await reload(selected.id);
                        toast.message("已送入离线 A/B", {
                          description: "须双批跑测并人工确认后才能写生产",
                          action: {
                            label: "打开",
                            onClick: () => {
                              window.location.href = `/ops/prompt-ab?id=${result.experiment.id}`;
                            },
                          },
                        });
                        window.location.href = `/ops/prompt-ab?id=${result.experiment.id}`;
                        return result.message || "已送入 Prompt A/B";
                      }, "操作失败")
                    }
                  >
                    送去 Prompt A/B
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      action.run(async () => {
                        if (!window.confirm("确认关闭改进单？不会写入生产配置。")) return "已取消";
                        const result = await api<{ message?: string }>("/api/improvements/apply-prompt", {
                          method: "POST",
                          body: JSON.stringify({ improvementId: selected.id, skillId: selected.skillId }),
                        });
                        await reload(selected.id);
                        return result.message || "已关闭";
                      }, "关闭失败")
                    }
                  >
                    关闭改进单
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      action.run(async () => {
                        const result = await api<{ count: number }>("/api/improvements/promote-eval", {
                          method: "POST",
                          body: JSON.stringify({ improvementId: selected.id }),
                        });
                        return result.message || `已写入 ${result.count} 条`;
                      }, "转入测评失败")
                    }
                  >
                    写入测评集
                  </Button>
                  {selected.promptAbExperimentId ? (
                    <Link
                      href={`/ops/prompt-ab?id=${selected.promptAbExperimentId}` as "/ops"}
                      className="inline-flex h-9 items-center text-sm underline"
                    >
                      打开关联 Prompt A/B
                    </Link>
                  ) : (
                    <Link href={"/ops/prompt-ab" as "/ops"} className="inline-flex h-9 items-center text-sm underline">
                      Prompt A/B 页
                    </Link>
                  )}
                  <Link href={"/ops/center" as "/ops"} className="inline-flex h-9 items-center text-sm underline">
                    打开测评中心
                  </Link>
                </div>

                <p className="text-xs text-muted-foreground">
                  Skill / Planner / Tool 草案都不能直接写生产：生成后须「送去 Prompt A/B」，用全部启用用例双批跑测，再人工确认晋升。
                </p>

                <FeedbackBanner phase={action.phase} message={action.message} />

                {draftPrompt ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {draftKind === "tool" ? "Tool 描述 Diff" : draftKind === "planner" ? "Planner Diff" : "Prompt Diff"}
                      {draftMode === "llm" && draftKind !== "tool" ? "（LLM）" : ""}
                    </p>
                    {!currentPrompt ? (
                      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                        {draftPrompt}
                      </pre>
                    ) : (
                      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                        {diffText(currentPrompt, draftPrompt).map((line, index) => (
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
                    )}
                  </div>
                ) : selected.draftPrompt ? (
                  <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                    {selected.draftPrompt}
                  </pre>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-medium tabular-nums">{value}</p>
    </div>
  );
}
