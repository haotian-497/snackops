import "server-only";

import { loadPlannerPrompt } from "@/lib/agent/planner";
import { getEvalBatch, listEvalBatches } from "@/lib/eval/batch";
import { getJudgeConfig, listJudgeVersions, rollbackJudge } from "@/lib/eval/judge-config";
import { RouteError } from "@/lib/http";
import { getPublicLlmConfig, listLlmVersions, rollbackLlm } from "@/lib/llm/public";
import { updateImprovement } from "@/lib/ops/improvements";
import { getPromptAbExperiment, listPromptAbExperiments } from "@/lib/ops/prompt-ab";
import { getPlannerConfig, listPlannerVersions, rollbackPlanner, updatePlanner } from "@/lib/planner/registry";
import { listAllSkillVersionSummaries, listSkillVersions, listSkills, rollbackSkill, updateSkill } from "@/lib/skills/registry";
import { ensureJsonFile, updateJson } from "@/lib/store";
import { listTools, listToolVersions, rollbackTool, setToolEnabled, updateTool } from "@/lib/tools/registry";
import type { RollbackHub } from "@/lib/ops/rollback-types";
import type { PromptAbExperiment } from "@/lib/types";

export type { RollbackHub } from "@/lib/ops/rollback-types";

async function savePromptAbExperiment(next: PromptAbExperiment) {
  await ensureJsonFile<PromptAbExperiment[]>("prompt-ab-experiments.json", []);
  await updateJson<PromptAbExperiment[]>("prompt-ab-experiments.json", (current) => {
    const index = current.findIndex((item) => item.id === next.id);
    if (index < 0) return [next, ...current];
    const copy = [...current];
    copy[index] = next;
    return copy;
  });
  return next;
}

function findPromoteSnapshotNote(changeNote: string, experimentId: string) {
  return changeNote.includes(experimentId) && /晋升/.test(changeNote);
}

export async function loadRollbackHub(): Promise<RollbackHub> {
  const [
    skills,
    skillVersions,
    plannerConfig,
    plannerPrompt,
    plannerVersions,
    tools,
    toolVersions,
    judgeConfig,
    judgeVersions,
    llmConfig,
    llmVersions,
    experiments,
    batches,
  ] = await Promise.all([
    listSkills(),
    listAllSkillVersionSummaries(),
    getPlannerConfig(),
    loadPlannerPrompt(),
    listPlannerVersions(),
    listTools(),
    listToolVersions(),
    getJudgeConfig(),
    listJudgeVersions(),
    getPublicLlmConfig(),
    listLlmVersions(),
    listPromptAbExperiments(),
    listEvalBatches(),
  ]);

  return {
    skills: skills.filter((item) => !item.id.includes("__pab_")),
    skillVersions,
    planner: {
      config: plannerConfig,
      systemPrompt: plannerPrompt,
      versions: plannerVersions.map(({ id, version, createdAt, changeNote }) => ({
        id,
        version,
        createdAt,
        changeNote,
      })),
    },
    tools,
    toolVersions: toolVersions.map(({ id, toolId, createdAt, changeNote, name }) => ({
      id,
      toolId,
      createdAt,
      changeNote,
      name,
    })),
    judge: {
      config: judgeConfig,
      versions: judgeVersions.map(({ id, createdAt, changeNote }) => ({ id, createdAt, changeNote })),
    },
    llm: {
      config: llmConfig,
      versions: llmVersions.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        changeNote: item.changeNote,
        summary: `${item.config.provider} / ${item.config.model}`,
      })),
    },
    promotedExperiments: experiments
      .filter((item) => item.status === "promoted")
      .sort((a, b) => (b.promotedAt || b.createdAt).localeCompare(a.promotedAt || a.createdAt)),
    evalBatches: batches
      .filter((item) => item.status === "done" || item.status === "error")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40)
      .map((item) => ({
        id: item.id,
        name: item.name,
        versionLabel: item.versionLabel,
        status: item.status,
        createdAt: item.createdAt,
        passRate: item.passRate,
        skillVersion: item.skillVersion,
        hasOverrides: Boolean(
          item.skillPromptOverrides ||
            item.plannerPromptOverride ||
            (item.toolOverrides && Object.keys(item.toolOverrides).length),
        ),
      })),
  };
}

export async function undoPromptAbPromote(experimentId: string) {
  const experiment = await getPromptAbExperiment(experimentId);
  if (experiment.status !== "promoted") {
    throw new RouteError(400, "只能撤销已晋升的实验", { code: "PROMPT_AB_NOT_PROMOTED" });
  }

  let restored: unknown = null;

  if (experiment.kind === "planner") {
    const versions = await listPlannerVersions();
    const snap = versions.find((item) => findPromoteSnapshotNote(item.changeNote, experiment.id));
    if (!snap) {
      throw new RouteError(404, "找不到晋升前 Planner 快照，请到 Planner 版本列表手动回滚", {
        code: "PROMOTE_SNAPSHOT_MISSING",
      });
    }
    restored = await rollbackPlanner(snap.id);
  } else if (experiment.kind === "tool") {
    const toolId = experiment.controlToolId || "query_products";
    const versions = await listToolVersions(toolId);
    const snap = versions.find((item) => findPromoteSnapshotNote(item.changeNote, experiment.id));
    if (!snap) {
      throw new RouteError(404, "找不到晋升前 Tool 快照，请到 Tool 版本列表手动回滚", {
        code: "PROMOTE_SNAPSHOT_MISSING",
      });
    }
    restored = await rollbackTool(toolId, snap.id);
  } else {
    const skillId = experiment.controlSkillId || "response-generator";
    const versions = await listSkillVersions(skillId);
    const snap = versions.find((item) => findPromoteSnapshotNote(item.changeNote, experiment.id));
    if (!snap) {
      throw new RouteError(404, "找不到晋升前 Skill 快照，请到 Skill 版本列表手动回滚", {
        code: "PROMOTE_SNAPSHOT_MISSING",
      });
    }
    restored = await rollbackSkill(skillId, snap.id);
  }

  const next = await savePromptAbExperiment({
    ...experiment,
    status: "ready",
    promotedAt: undefined,
    note: [experiment.note, `已撤销晋升 ${new Date().toISOString()}`].filter(Boolean).join(" · "),
  });
  await updateImprovement(experiment.improvementId, { status: "in_progress" }).catch(() => undefined);

  return { experiment: next, restored };
}

function parseSkillPins(skillVersion: string): Array<{ id: string; version: string }> {
  return skillVersion
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.lastIndexOf("@");
      if (at <= 0) return null;
      return { id: part.slice(0, at), version: part.slice(at + 1) };
    })
    .filter((item): item is { id: string; version: string } => Boolean(item));
}

export async function restoreFromEvalBatch(batchId: string) {
  const batch = await getEvalBatch(batchId);
  if (batch.status !== "done" && batch.status !== "error") {
    throw new RouteError(400, "请选择已结束的测评批次", { code: "BATCH_NOT_FINISHED" });
  }

  const applied: string[] = [];
  const note = `从测评批次 ${batch.id}（${batch.name || batch.versionLabel || "未命名"}）对齐`;

  const overrides = batch.skillPromptOverrides ?? {};
  if (Object.keys(overrides).length > 0) {
    for (const [skillId, systemPrompt] of Object.entries(overrides)) {
      await updateSkill(skillId, { systemPrompt, changeNote: note });
      applied.push(`skill-override:${skillId}`);
    }
  } else {
    for (const pin of parseSkillPins(batch.skillVersion)) {
      const versions = await listSkillVersions(pin.id);
      const match =
        versions.find((item) => item.version === pin.version && item.createdAt <= batch.createdAt) ||
        versions.find((item) => item.version === pin.version);
      if (!match) {
        applied.push(`skill-miss:${pin.id}@${pin.version}`);
        continue;
      }
      await rollbackSkill(pin.id, match.id);
      applied.push(`skill:${pin.id}@${pin.version}`);
    }
  }

  if (batch.plannerPromptOverride?.trim()) {
    await updatePlanner({
      systemPrompt: batch.plannerPromptOverride,
      changeNote: note,
    });
    applied.push("planner-override");
  }

  if (batch.toolOverrides) {
    for (const [toolId, patch] of Object.entries(batch.toolOverrides)) {
      await updateTool(toolId, {
        description: patch.description,
        enabled: patch.enabled,
        changeNote: note,
      });
      applied.push(`tool:${toolId}`);
    }
  }

  const realApplied = applied.filter((item) => !item.startsWith("skill-miss:"));
  if (realApplied.length === 0) {
    throw new RouteError(400, "该批次没有可对齐到生产的 Skill/Planner/Tool 钉住信息", {
      code: "BATCH_NO_RESTORE_TARGET",
      missed: applied,
    });
  }

  return { batchId: batch.id, applied, missed: applied.filter((item) => item.startsWith("skill-miss:")) };
}

export { rollbackPlanner, rollbackJudge, rollbackLlm, rollbackTool, setToolEnabled };
