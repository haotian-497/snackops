"use client";

import { FileText, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import type { SkillRecord, SkillVersionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type ApiOk<T> = { ok: boolean; message?: string } & T;
type EnabledFilter = "all" | "enabled" | "disabled" | "temp";

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

function skillUrl(id: string, suffix = "") {
  return `/api/skills/${encodeURIComponent(id)}${suffix}`;
}

export function SkillsWorkbench({
  initialSkills,
  initialVersions,
  toolIds,
}: {
  initialSkills: SkillRecord[];
  initialVersions: SkillVersionSummary[];
  toolIds: string[];
}) {
  const [skills, setSkills] = useState(initialSkills);
  const [filter, setFilter] = useState<EnabledFilter>("enabled");
  const productionSkills = useMemo(() => skills.filter((skill) => !skill.id.includes("__pab_")), [skills]);
  const [selectedId, setSelectedId] = useState(
    () =>
      productionSkills.find((skill) => skill.enabled)?.id ??
      productionSkills[0]?.id ??
      skills[0]?.id ??
      "",
  );
  const selected =
    productionSkills.find((skill) => skill.id === selectedId) ??
    skills.find((skill) => skill.id === selectedId) ??
    productionSkills[0] ??
    skills[0];
  const [name, setName] = useState(selected?.name ?? "");
  const [description, setDescription] = useState(selected?.description ?? "");
  const [model, setModel] = useState(selected?.model ?? "");
  const [temperature, setTemperature] = useState(String(selected?.temperature ?? 0.2));
  const [maxTokens, setMaxTokens] = useState(String(selected?.maxTokens ?? 800));
  const [requiredTools, setRequiredTools] = useState(selected?.requiredTools ?? []);
  const [draft, setDraft] = useState(selected?.systemPrompt ?? "");
  const [changeNote, setChangeNote] = useState("运营修订");
  const [allVersions, setAllVersions] = useState(initialVersions);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [mdOpen, setMdOpen] = useState(false);
  const [mdMounted, setMdMounted] = useState(false);
  const mdTitleId = useId();
  const mdCloseRef = useRef<HTMLButtonElement>(null);
  const saveAction = useActionFeedback();
  const versionAction = useActionFeedback();

  const enabledCount = useMemo(() => productionSkills.filter((skill) => skill.enabled).length, [productionSkills]);
  const filtered = useMemo(() => {
    if (filter === "enabled") return productionSkills.filter((skill) => skill.enabled);
    if (filter === "disabled") return productionSkills.filter((skill) => !skill.enabled);
    if (filter === "temp") return skills.filter((skill) => skill.id.includes("__pab_"));
    return productionSkills;
  }, [filter, productionSkills, skills]);
  const versions = useMemo(
    () => allVersions.filter((item) => item.skillId === selected?.id),
    [allVersions, selected?.id],
  );
  const closeMd = useCallback(() => setMdOpen(false), []);

  useEffect(() => {
    setMdMounted(true);
  }, []);

  useEffect(() => {
    if (!mdOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mdCloseRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMd();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mdOpen, closeMd]);

  function applySkill(skill: SkillRecord) {
    setSelectedId(skill.id);
    setName(skill.name);
    setDescription(skill.description);
    setModel(skill.model);
    setTemperature(String(skill.temperature));
    setMaxTokens(String(skill.maxTokens));
    setRequiredTools(skill.requiredTools);
    setDraft(skill.systemPrompt);
    setDiffLines([]);
    setSelectedVersionId("");
  }

  async function reloadVersions(skillId: string) {
    const listed = await api<{ versions: SkillVersionSummary[] }>(skillUrl(skillId, "/versions"));
    setAllVersions((current) => [...listed.versions, ...current.filter((item) => item.skillId !== skillId)]);
    return listed.versions;
  }

  async function compareVersion(versionId: string) {
    if (!selected) return;
    setSelectedVersionId(versionId);
    setDiffLoading(true);
    try {
      const result = await api<{ diff: { lines: DiffLine[] } }>(
        `${skillUrl(selected.id, "/diff")}?from=${encodeURIComponent(versionId)}`,
      );
      setDiffLines(result.diff.lines);
    } catch (error) {
      setDiffLines([]);
      toast.error(error instanceof Error ? error.message : "对比失败");
    } finally {
      setDiffLoading(false);
    }
  }

  if (!selected) {
    return <EmptyState title="暂无 Skill" description="skills.json 中没有可管理的 Skill。" />;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-5">
      <Card className="min-w-0 lg:col-span-2">
        <CardHeader>
          <CardTitle>Skill 列表</CardTitle>
          <CardDescription>
            已启用 {enabledCount} / {productionSkills.length}（不含 Prompt A/B 临时副本）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["enabled", "已启用"],
                ["disabled", "已停用"],
                ["all", "生产全部"],
                ["temp", "A/B 临时"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="没有符合筛选的 Skill" description="换一个启用状态再看。" />
          ) : (
            filtered.map((skill) => (
              <div
                key={skill.id}
                className={cn(
                  "flex items-start justify-between gap-2 rounded-md border-b border-border px-2 py-2 last:border-0",
                  selectedId === skill.id ? "bg-secondary" : "hover:bg-muted/50",
                )}
              >
                <button type="button" className="min-w-0 text-left" onClick={() => applySkill(skill)}>
                  <p className="truncate text-sm font-medium">{skill.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{skill.id}</p>
                </button>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <StatusLabel
                    text={skill.enabled ? "已启用" : "已停用"}
                    tone={skill.enabled ? "ok" : "neutral"}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      saveAction.run(async () => {
                        const result = await api<{ skill: SkillRecord; message: string }>(skillUrl(skill.id), {
                          method: "PATCH",
                          body: JSON.stringify({ enabled: !skill.enabled, snapshotBefore: false }),
                        });
                        setSkills((current) =>
                          current.map((item) => (item.id === skill.id ? result.skill : item)),
                        );
                        if (selectedId === skill.id) applySkill(result.skill);
                        toast.success(result.message);
                        return result.message;
                      }, "切换失败")
                    }
                  >
                    {skill.enabled ? "停用" : "启用"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 lg:col-span-3">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="break-words">{selected.name}</CardTitle>
            <CardDescription className="break-all">
              skills/{selected.filePath} · v{selected.version} · {selected.model}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setMdOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={mdOpen}
          >
            <FileText className="size-3.5" aria-hidden="true" />
            查看 skill.md
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              名称
              <Input value={name} onChange={(event) => setName(event.target.value)} className="mt-1" />
            </label>
            <label className="block text-xs text-muted-foreground">
              模型
              <Input value={model} onChange={(event) => setModel(event.target.value)} className="mt-1" />
            </label>
            <label className="block text-xs text-muted-foreground">
              温度
              <Input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Token 上限
              <Input
                type="number"
                min="1"
                value={maxTokens}
                onChange={(event) => setMaxTokens(event.target.value)}
                className="mt-1"
              />
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">
            描述
            <Textarea
              value={description}
              rows={2}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 min-h-16"
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs text-muted-foreground">依赖 Tool</legend>
            <div className="flex flex-wrap gap-2">
              {toolIds.map((toolId) => {
                const checked = requiredTools.includes(toolId);
                return (
                  <label key={toolId} className="inline-flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setRequiredTools((current) =>
                          checked ? current.filter((item) => item !== toolId) : [...current, toolId],
                        )
                      }
                    />
                    <span className="break-all">{toolId}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            启用状态：{selected.enabled ? "已启用" : "已停用"} · 当前依赖：
            {selected.requiredTools.length ? selected.requiredTools.join("、") : "无"}
          </p>
          <label className="block text-xs text-muted-foreground">
            Prompt 正文
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-1 min-h-56 font-mono"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            版本说明
            <Input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} className="mt-1" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                saveAction.run(async () => {
                  const temp = Number(temperature);
                  const tokens = Number(maxTokens);
                  if (Number.isNaN(temp) || Number.isNaN(tokens)) {
                    throw new Error("温度和 Token 上限必须是数字");
                  }
                  const unchanged =
                    draft === selected.systemPrompt &&
                    name === selected.name &&
                    description === selected.description &&
                    model === selected.model &&
                    Number(temperature) === selected.temperature &&
                    Number(maxTokens) === selected.maxTokens &&
                    requiredTools.join("\0") === selected.requiredTools.join("\0");
                  const result = await api<{ skill: SkillRecord; message: string }>(skillUrl(selected.id), {
                    method: "PATCH",
                    body: JSON.stringify({
                      name,
                      description,
                      model,
                      temperature: temp,
                      maxTokens: tokens,
                      requiredTools,
                      systemPrompt: draft,
                      changeNote: changeNote || "修改前自动快照",
                    }),
                  });
                  setSkills((current) => current.map((item) => (item.id === selected.id ? result.skill : item)));
                  applySkill(result.skill);
                  await reloadVersions(selected.id);
                  const message = unchanged ? "已保存（内容未变，未新增快照）" : "已保存，修改前快照已保留";
                  toast.success(message);
                  return message;
                }, "保存失败，旧版本仍保留")
              }
            >
              保存
            </Button>
          </div>
          <FeedbackBanner phase={saveAction.phase} message={saveAction.message} />
          <FeedbackBanner phase={versionAction.phase} message={versionAction.message} />

          <VersionSnapshotPanel
            items={versions.map((item) => ({
              id: item.id,
              createdAt: item.createdAt,
              note: item.changeNote,
              badge: item.version,
            }))}
            selectedId={selectedVersionId}
            diffLines={diffLines}
            loading={diffLoading || versionAction.phase === "loading"}
            onSelect={(id) => void compareVersion(id)}
            onManualSnapshot={() =>
              versionAction.run(async () => {
                const result = await api<{ message: string }>(skillUrl(selected.id, "/versions"), {
                  method: "POST",
                  body: JSON.stringify({ changeNote: changeNote || "添加快照" }),
                });
                await reloadVersions(selected.id);
                toast.success(result.message || "已添加快照");
                return result.message || "已添加快照";
              }, "添加快照失败")
            }
          />
        </CardContent>
      </Card>
      {mdOpen && mdMounted
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
              <button
                type="button"
                className="absolute inset-0 bg-foreground/40"
                aria-label="关闭 skill.md"
                onClick={closeMd}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={mdTitleId}
                className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg"
                style={{ maxHeight: "min(85vh, 40rem)" }}
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <h2 id={mdTitleId} className="text-base font-semibold">
                      {selected.name}
                    </h2>
                    <p className="break-all text-xs text-muted-foreground">skills/{selected.filePath}</p>
                  </div>
                  <Button
                    ref={mdCloseRef}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 px-2"
                    onClick={closeMd}
                    aria-label="关闭"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                <pre
                  className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-relaxed"
                  style={{ maxHeight: "calc(min(85vh, 40rem) - 4.5rem)" }}
                >
                  {selected.systemPrompt || "（文件为空）"}
                </pre>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
