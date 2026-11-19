"use client";

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
import { buildPreviewExecutionPath, executionPathSummary } from "@/lib/planner/execution-path";
import { CAPABILITY_OPTIONS } from "@/lib/planner/options";
import { diffText, type DiffLine } from "@/lib/skills/diff";
import { cn } from "@/lib/utils";
import type {
  AgentPlan,
  PlanValidationReport,
  PlannerConfig,
  PlannerVersionSnapshot,
  SkillRecord,
  Tool,
} from "@/lib/types";

type PreviewResult = {
  plan: AgentPlan;
  validation: PlanValidationReport;
  report: { passed: boolean; summary: string; details: string[] };
  fallback: boolean;
  availableSkillIds: string[];
  availableToolIds: string[];
};

const pathKindLabel = {
  planner: "规划",
  validator: "校验",
  tool: "Tool",
  skill: "Skill",
  risk: "风控",
  rewrite: "改写",
  handoff: "接管",
  reply: "输出",
} as const;

export function PlannerWorkbench({
  initialConfig,
  initialPrompt,
  initialVersions,
  skills,
  tools,
}: {
  initialConfig: PlannerConfig;
  initialPrompt: string;
  initialVersions: PlannerVersionSnapshot[];
  skills: SkillRecord[];
  tools: Tool[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [enabledSkillIds, setEnabledSkillIds] = useState(initialConfig.enabledSkillIds);
  const [enabledToolIds, setEnabledToolIds] = useState(initialConfig.enabledToolIds);
  const [mandatory, setMandatory] = useState(initialConfig.mandatoryCapabilities);
  const [version, setVersion] = useState(initialConfig.version);
  const [changeNote, setChangeNote] = useState("运营修订 Planner");
  const [question, setQuestion] = useState("中秋想买不贵的辣味零食，算一下券后价");
  const [versions, setVersions] = useState(initialVersions);
  const [selectedVersion, setSelectedVersion] = useState<PlannerVersionSnapshot | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const saveAction = useActionFeedback();
  const previewAction = useActionFeedback();

  const skillSet = useMemo(() => new Set(enabledSkillIds), [enabledSkillIds]);
  const toolSet = useMemo(() => new Set(enabledToolIds), [enabledToolIds]);
  const skillNames = useMemo(
    () => Object.fromEntries(skills.map((item) => [item.id, item.name])),
    [skills],
  );
  const toolNames = useMemo(
    () => Object.fromEntries(tools.map((item) => [item.id, item.name || item.id])),
    [tools],
  );
  const executionPath = useMemo(() => {
    if (!preview) return [];
    return buildPreviewExecutionPath({
      plan: preview.plan,
      validation: preview.validation,
      skillNames,
      toolNames,
      availableSkillIds: preview.availableSkillIds,
    });
  }, [preview, skillNames, toolNames]);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  return (
    <div className="grid gap-3 lg:grid-cols-12">
      <Card className="min-w-0 lg:col-span-5">
        <CardHeader>
          <CardTitle>Planner 配置</CardTitle>
          <CardDescription>
            当前版本 {config.version} · 更新于 {config.updatedAt}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-xs text-muted-foreground">
            版本号
            <Input value={version} onChange={(event) => setVersion(event.target.value)} className="mt-1" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Planner Prompt
            <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 min-h-48 font-mono" />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs text-muted-foreground">启用 Skill</legend>
            <div className="max-h-48 space-y-1 overflow-auto">
              {skills.map((skill) => (
                <label key={skill.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={skillSet.has(skill.id)}
                    onChange={() => setEnabledSkillIds((current) => toggle(current, skill.id))}
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-medium">{skill.name}</span>
                    <span className="block break-all text-xs text-muted-foreground">{skill.id}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs text-muted-foreground">启用 Tool</legend>
            <div className="flex flex-wrap gap-2">
              {tools.map((tool) => (
                <label key={tool.id} className="inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={toolSet.has(tool.id)}
                    onChange={() => setEnabledToolIds((current) => toggle(current, tool.id))}
                  />
                  <span className="break-all">{tool.id}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs text-muted-foreground">mandatoryCapabilities</legend>
            <div className="flex flex-wrap gap-2">
              {CAPABILITY_OPTIONS.map((item) => (
                <label key={item} className="inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={mandatory.includes(item)}
                    onChange={() => setMandatory((current) => toggle(current, item))}
                  />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs text-muted-foreground">
            变更说明
            <Input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} className="mt-1" />
          </label>
          <Button
            type="button"
            onClick={() =>
              saveAction.run(async () => {
                const response = await fetch("/api/planner", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    version,
                    systemPrompt: prompt,
                    enabledSkillIds,
                    enabledToolIds,
                    mandatoryCapabilities: mandatory,
                    changeNote,
                  }),
                });
                const json = (await response.json()) as {
                  ok?: boolean;
                  message?: string;
                  config?: PlannerConfig;
                  systemPrompt?: string;
                };
                if (!response.ok || json.ok === false) {
                  throw new Error(json.message || "保存失败，旧版本仍保留");
                }
                if (json.config) setConfig(json.config);
                if (json.systemPrompt) setPrompt(json.systemPrompt);
                const listed = await fetch("/api/planner");
                const next = (await listed.json()) as { versions?: PlannerVersionSnapshot[] };
                if (next.versions) setVersions(next.versions);
                toast.success(json.message || "已保存");
                return json.message || "已保存";
              }, "保存失败，旧版本仍保留")
            }
          >
            保存 Planner
          </Button>
          <FeedbackBanner phase={saveAction.phase} message={saveAction.message} />
          {versions.length === 0 ? (
            <EmptyState title="还没有 Planner 版本" description="保存后会留下 Prompt 与配置快照。" />
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">版本列表</p>
              {versions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full rounded-md border border-border px-2 py-2 text-left text-sm"
                  onClick={() => setSelectedVersion(item)}
                >
                  <span className="block break-words">
                    {item.version} · {item.changeNote}
                  </span>
                  <span className="block text-xs text-muted-foreground">{item.createdAt}</span>
                </button>
              ))}
              {selectedVersion ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground break-words">
                    changeNote：{selectedVersion.changeNote}
                  </p>
                  <p className="text-xs text-muted-foreground break-words">
                    快照配置：Skill {selectedVersion.config.enabledSkillIds.join("、") || "无"} · Tool{" "}
                    {selectedVersion.config.enabledToolIds.join("、") || "无"} · mandatory{" "}
                    {selectedVersion.config.mandatoryCapabilities.join("、") || "无"}
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                    {selectedVersion.systemPrompt}
                  </pre>
                  <p className="text-xs text-muted-foreground">与当前 Prompt 的 diff</p>
                  <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                    {diffText(selectedVersion.systemPrompt, prompt).map((line: DiffLine, index) => (
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
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 lg:col-span-7">
        <CardHeader>
          <CardTitle>计划预览</CardTitle>
          <CardDescription>使用当前勾选的启用状态调用服务端 Planner，不是前端写死结果</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            测试问题
            <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="mt-1 min-h-24" />
          </label>
          <Button
            type="button"
            onClick={() =>
              previewAction.run(async () => {
                const response = await fetch("/api/planner/preview", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    question,
                    enabledSkillIds,
                    enabledToolIds,
                    mandatoryCapabilities: mandatory,
                  }),
                });
                const json = (await response.json()) as {
                  ok?: boolean;
                  message?: string;
                  preview?: PreviewResult;
                };
                if (!response.ok || !json.preview) {
                  throw new Error(json.message || "预览失败");
                }
                setPreview(json.preview);
                return json.message || (json.preview.validation.ok ? "计划合法" : "计划非法");
              }, "预览失败")
            }
          >
            预览计划
          </Button>
          <FeedbackBanner phase={previewAction.phase} message={previewAction.message} />
          {!preview ? (
            <EmptyState title="尚未预览" description="输入问题后点击预览，会返回 selectedSkills / Tools / reasoning / 校验。" />
          ) : (
            <div className="space-y-3">
              <StatusLabel
                text={preview.validation.ok ? "计划合法" : preview.validation.blocked ? "计划被阻断" : "计划非法"}
                tone={preview.validation.ok ? "ok" : "danger"}
              />
              {executionPath.length ? (
                <div className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium">简要执行链路</p>
                  <p className="mt-1 text-xs text-muted-foreground">{executionPathSummary(executionPath)}</p>
                  <ol className="mt-3 flex flex-wrap items-center gap-1.5">
                    {executionPath.map((node, index) => (
                      <li key={node.id} className="flex items-center gap-1.5">
                        {index > 0 ? <span className="text-xs text-muted-foreground">→</span> : null}
                        <span
                          className={cn(
                            "inline-flex max-w-52 flex-col rounded-md border px-2 py-1",
                            node.status === "stop"
                              ? "border-red-200 bg-red-50"
                              : node.status === "optional"
                                ? "border-dashed border-border bg-muted/40"
                                : "border-border bg-card",
                          )}
                        >
                          <span className="text-[10px] leading-none text-muted-foreground">{pathKindLabel[node.kind]}</span>
                          <span className="truncate text-xs font-medium">{node.title}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {executionPath
                      .filter((node) => node.detail)
                      .map((node) => (
                        <li key={`${node.id}-detail`}>
                          {node.title}：{node.detail}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-sm">
                <span className="text-muted-foreground">reasoning：</span>
                <span className="break-words">{preview.plan.reasoning}</span>
              </p>
              <p className="text-sm break-words">
                selectedSkills：{preview.plan.selectedSkills.join("、") || "无"}
              </p>
              <p className="text-sm break-words">
                selectedTools：{preview.plan.selectedTools.join("、") || "无"}
              </p>
              <p className="text-xs text-muted-foreground break-words">
                可用 Skill：{preview.availableSkillIds.join("、") || "无"} · 可用 Tool：
                {preview.availableToolIds.join("、") || "无"}
              </p>
              {preview.plan.degradation ? (
                <p className="text-sm text-amber-800">降级：{preview.plan.degradation}</p>
              ) : null}
              {preview.validation.issues.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {preview.validation.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.message}`} className="break-words text-red-800">
                      [{issue.severity}] {issue.code}：{issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-emerald-800">{preview.report.summary}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
