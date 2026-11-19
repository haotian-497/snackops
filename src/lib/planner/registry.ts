import "server-only";

import { randomUUID } from "node:crypto";

import { createPlan } from "@/lib/agent/planner";
import { inferMandatoryCapabilities } from "@/lib/agent/capabilities";
import { scorePlanGeneration } from "@/lib/agent/score";
import { loadPlannerPrompt } from "@/lib/agent/planner";
import { writeSkillPrompt } from "@/lib/skills/files";
import { listSkillRecords, updateSkill } from "@/lib/skills/registry";
import { listTools, setToolEnabled } from "@/lib/tools/registry";
import { readJson, updateJson } from "@/lib/store";
import { CAPABILITY_OPTIONS } from "@/lib/planner/options";
import type { PlannerConfig, PlannerVersionSnapshot, SkillRecord, Tool } from "@/lib/types";

export { CAPABILITY_OPTIONS };

export async function getPlannerConfig(): Promise<PlannerConfig> {
  return readJson<PlannerConfig>("planner-config.json");
}

export async function listPlannerVersions(): Promise<PlannerVersionSnapshot[]> {
  const versions = await readJson<PlannerVersionSnapshot[]>("planner-versions.json");
  return versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPlannerVersion(versionId: string): Promise<PlannerVersionSnapshot> {
  const versions = await listPlannerVersions();
  const found = versions.find((item) => item.id === versionId);
  if (!found) {
    throw new Error(`未找到 Planner 版本：${versionId}`);
  }
  return found;
}

export async function deletePlannerVersion(versionId: string): Promise<{ id: string }> {
  await getPlannerVersion(versionId);
  await updateJson<PlannerVersionSnapshot[]>("planner-versions.json", (current) =>
    current.filter((item) => item.id !== versionId),
  );
  return { id: versionId };
}

export async function rollbackPlanner(versionId: string) {
  const version = await getPlannerVersion(versionId);
  return updatePlanner({
    systemPrompt: version.systemPrompt,
    version: version.config.version,
    enabledSkillIds: version.config.enabledSkillIds,
    enabledToolIds: version.config.enabledToolIds,
    mandatoryCapabilities: version.config.mandatoryCapabilities,
    changeNote: `回滚到 ${version.version}（${version.id}）前自动快照`,
  });
}

async function snapshotPlanner(changeNote: string): Promise<void> {
  const [config, systemPrompt] = await Promise.all([getPlannerConfig(), loadPlannerPrompt()]);
  const snapshot: PlannerVersionSnapshot = {
    id: `pv_${randomUUID()}`,
    version: config.version,
    createdAt: new Date().toISOString(),
    changeNote,
    systemPrompt,
    config: {
      version: config.version,
      enabledSkillIds: config.enabledSkillIds,
      enabledToolIds: config.enabledToolIds,
      mandatoryCapabilities: config.mandatoryCapabilities,
      updatedAt: config.updatedAt,
    },
  };
  await updateJson<PlannerVersionSnapshot[]>("planner-versions.json", (current) => [snapshot, ...current]);
}

export type PlannerPatch = Partial<
  Pick<PlannerConfig, "version" | "enabledSkillIds" | "enabledToolIds" | "mandatoryCapabilities">
> & {
  systemPrompt?: string;
  changeNote?: string;
};

export async function updatePlanner(patch: PlannerPatch): Promise<{
  config: PlannerConfig;
  systemPrompt: string;
}> {
  const currentPrompt = await loadPlannerPrompt();
  await snapshotPlanner(patch.changeNote || "修改前自动快照");
  try {
    if (patch.systemPrompt !== undefined) {
      await writeSkillPrompt("planner.md", patch.systemPrompt);
    }
    const config = await updateJson<PlannerConfig>("planner-config.json", (current) => ({
      ...current,
      version: patch.version ?? current.version,
      enabledSkillIds: patch.enabledSkillIds ?? current.enabledSkillIds,
      enabledToolIds: patch.enabledToolIds ?? current.enabledToolIds,
      mandatoryCapabilities: patch.mandatoryCapabilities ?? current.mandatoryCapabilities,
      updatedAt: new Date().toISOString(),
    }));

    if (patch.enabledSkillIds) {
      const skills = await listSkillRecords();
      const enabled = new Set(patch.enabledSkillIds);
      await Promise.all(
        skills.map((skill) =>
          skill.enabled === enabled.has(skill.id)
            ? Promise.resolve(skill)
            : updateSkill(skill.id, { enabled: enabled.has(skill.id), snapshotBefore: false }),
        ),
      );
    }
    if (patch.enabledToolIds) {
      const tools = await listTools();
      const enabled = new Set(patch.enabledToolIds);
      await Promise.all(
        tools.map((tool) =>
          tool.enabled === enabled.has(tool.id) ? Promise.resolve(tool) : setToolEnabled(tool.id, enabled.has(tool.id)),
        ),
      );
    }

    return { config, systemPrompt: patch.systemPrompt ?? currentPrompt };
  } catch (error) {
    await writeSkillPrompt("planner.md", currentPrompt).catch(() => undefined);
    throw error;
  }
}

export async function previewPlanner(input: {
  question: string;
  enabledSkillIds?: string[];
  enabledToolIds?: string[];
  mandatoryCapabilities?: string[];
}) {
  const config = await getPlannerConfig();
  const [skills, tools] = await Promise.all([listSkillRecords(), listTools()]);
  const skillAllow = new Set(input.enabledSkillIds ?? config.enabledSkillIds);
  const toolAllow = new Set(input.enabledToolIds ?? config.enabledToolIds);
  const availableSkills = skills.filter((skill) => {
    if (!skillAllow.has(skill.id)) return false;
    return input.enabledSkillIds ? true : skill.enabled;
  });
  const availableTools = tools.filter((tool) => {
    if (!toolAllow.has(tool.id)) return false;
    return input.enabledToolIds ? true : tool.enabled;
  });
  const mandatoryCapabilities =
    input.mandatoryCapabilities ??
    (config.mandatoryCapabilities.length ? config.mandatoryCapabilities : inferMandatoryCapabilities(input.question));

  const planned = await createPlan({
    userInput: input.question,
    conversationHistory: [],
    availableSkills,
    availableTools,
    mandatoryCapabilities,
  });
  const scored = scorePlanGeneration(planned.plan, availableSkills, availableTools);
  return {
    plan: planned.plan,
    validation: scored.validation,
    report: scored.report,
    fallback: planned.fallback,
    availableSkillIds: availableSkills.map((item) => item.id),
    availableToolIds: availableTools.map((item) => item.id),
  };
}

export async function getPlannerRecord(): Promise<{
  config: PlannerConfig;
  systemPrompt: string;
  versions: PlannerVersionSnapshot[];
  skills: SkillRecord[];
  tools: Tool[];
}> {
  const [config, systemPrompt, versions, skills, tools] = await Promise.all([
    getPlannerConfig(),
    loadPlannerPrompt(),
    listPlannerVersions(),
    listSkillRecords(),
    listTools(),
  ]);
  return { config, systemPrompt, versions, skills, tools };
}

