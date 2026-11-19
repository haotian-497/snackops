import "server-only";

import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";

import { diffText } from "@/lib/skills/diff";
import { readSkillPrompt, writeSkillPrompt } from "@/lib/skills/files";
import { hashSkillSnapshot } from "@/lib/skills/hash";
import { resolveProjectFile } from "@/lib/safe-path";
import { readJson, updateJson } from "@/lib/store";
import type { Skill, SkillRecord, SkillVersionSnapshot, SkillVersionSummary } from "@/lib/types";

function toSnapshot(skill: Skill, systemPrompt: string, changeNote: string): SkillVersionSnapshot {
  return {
    id: `sv_${randomUUID()}`,
    skillId: skill.id,
    version: skill.version,
    createdAt: new Date().toISOString(),
    changeNote,
    hash: hashSkillSnapshot(skill, systemPrompt),
    filePath: skill.filePath,
    systemPrompt,
    metadata: {
      name: skill.name,
      description: skill.description,
      model: skill.model,
      temperature: skill.temperature,
      maxTokens: skill.maxTokens,
      requiredTools: skill.requiredTools,
      enabled: skill.enabled,
    },
  };
}

export async function listSkills(): Promise<Skill[]> {
  return readJson<Skill[]>("skills.json");
}

export async function listSkillRecords(): Promise<SkillRecord[]> {
  const skills = await listSkills();
  return Promise.all(skills.map((skill) => hydrateSkill(skill)));
}

export async function listEnabledSkills(): Promise<SkillRecord[]> {
  const records = await listSkillRecords();
  return records.filter((skill) => skill.enabled);
}

export async function getSkill(id: string): Promise<SkillRecord> {
  const skills = await listSkills();
  const skill = skills.find((item) => item.id === id);
  if (!skill) {
    throw new Error(`未找到 Skill：${id}`);
  }
  return hydrateSkill(skill);
}

async function hydrateSkill(skill: Skill): Promise<SkillRecord> {
  const systemPrompt = await readSkillPrompt(skill.filePath);
  return { ...skill, systemPrompt };
}

export async function hydrateSkills(skills: Skill[]): Promise<SkillRecord[]> {
  return Promise.all(skills.map((skill) => hydrateSkill(skill)));
}

export async function listSkillVersions(skillId: string): Promise<SkillVersionSnapshot[]> {
  const versions = await readJson<SkillVersionSnapshot[]>("skill-versions.json");
  return versions
    .filter((item) => item.skillId === skillId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllSkillVersionSummaries(): Promise<SkillVersionSummary[]> {
  const versions = await readJson<SkillVersionSnapshot[]>("skill-versions.json");
  return versions
    .map(({ id, skillId, version, createdAt, changeNote, hash }) => ({
      id,
      skillId,
      version,
      createdAt,
      changeNote,
      hash,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSkillVersion(versionId: string, skillId?: string): Promise<SkillVersionSnapshot> {
  const versions = await readJson<SkillVersionSnapshot[]>("skill-versions.json");
  const found = versions.find((item) => item.id === versionId);
  if (!found) {
    throw new Error(`未找到版本：${versionId}`);
  }
  if (skillId && found.skillId !== skillId) {
    throw new Error(`版本不属于 Skill：${skillId}`);
  }
  return found;
}

export async function deleteSkillVersion(versionId: string, skillId?: string): Promise<{ id: string }> {
  await getSkillVersion(versionId, skillId);
  await updateJson<SkillVersionSnapshot[]>("skill-versions.json", (current) =>
    current.filter((item) => item.id !== versionId),
  );
  return { id: versionId };
}

async function appendSnapshot(snapshot: SkillVersionSnapshot): Promise<void> {
  await updateJson<SkillVersionSnapshot[]>("skill-versions.json", (current) => [snapshot, ...current]);
}

export async function snapshotSkill(skillId: string, changeNote: string): Promise<SkillVersionSnapshot> {
  const record = await getSkill(skillId);
  const snapshot = toSnapshot(record, record.systemPrompt, changeNote);
  await appendSnapshot(snapshot);
  return snapshot;
}

export type SkillPatch = Partial<
  Pick<
    Skill,
    | "name"
    | "description"
    | "enabled"
    | "model"
    | "temperature"
    | "maxTokens"
    | "requiredTools"
    | "version"
    | "filePath"
    | "status"
  >
> & {
  systemPrompt?: string;
  changeNote?: string;
  snapshotBefore?: boolean;
};

export async function updateSkill(id: string, patch: SkillPatch): Promise<SkillRecord> {
  if (patch.filePath) {
    resolveProjectFile("skills", patch.filePath);
  }

  const current = await getSkill(id);
  const nextPrompt = patch.systemPrompt !== undefined ? patch.systemPrompt : current.systemPrompt;
  const nextName = patch.name ?? current.name;
  const nextDescription = patch.description ?? current.description;
  const nextModel = patch.model ?? current.model;
  const nextTemperature = patch.temperature ?? current.temperature;
  const nextMaxTokens = patch.maxTokens ?? current.maxTokens;
  const nextRequiredTools = patch.requiredTools ?? current.requiredTools;
  const nextVersion = patch.version ?? current.version;
  const nextFilePath = patch.filePath ?? current.filePath;
  const sameTools =
    nextRequiredTools.length === current.requiredTools.length &&
    nextRequiredTools.every((item, index) => item === current.requiredTools[index]);
  const contentChanged =
    nextPrompt !== current.systemPrompt ||
    nextName !== current.name ||
    nextDescription !== current.description ||
    nextModel !== current.model ||
    nextTemperature !== current.temperature ||
    nextMaxTokens !== current.maxTokens ||
    !sameTools ||
    nextVersion !== current.version ||
    nextFilePath !== current.filePath;

  if (patch.snapshotBefore !== false && contentChanged) {
    await appendSnapshot(toSnapshot(current, current.systemPrompt, patch.changeNote || "修改前自动快照"));
  }

  const nextMeta: Skill = {
    id: current.id,
    name: nextName,
    description: nextDescription,
    enabled: patch.enabled ?? current.enabled,
    model: nextModel,
    temperature: nextTemperature,
    maxTokens: nextMaxTokens,
    requiredTools: nextRequiredTools,
    version: nextVersion,
    filePath: nextFilePath,
    status: patch.enabled === false ? "draft" : patch.enabled === true ? "published" : (patch.status ?? current.status),
    toolIds: nextRequiredTools,
  };

  try {
    if (patch.systemPrompt !== undefined && nextPrompt !== current.systemPrompt) {
      await writeSkillPrompt(nextMeta.filePath, nextPrompt);
    } else if (nextFilePath !== current.filePath && patch.systemPrompt !== undefined) {
      await writeSkillPrompt(nextMeta.filePath, nextPrompt);
    }

    await updateJson<Skill[]>("skills.json", (skills) =>
      skills.map((item) => (item.id === id ? nextMeta : item)),
    );
  } catch (error) {
    if (patch.systemPrompt !== undefined && nextPrompt !== current.systemPrompt) {
      await writeSkillPrompt(current.filePath, current.systemPrompt).catch(() => undefined);
    }
    throw error;
  }

  return hydrateSkill(nextMeta);
}

export function isTempPromptAbSkillId(skillId: string) {
  return skillId.includes("__pab_");
}

/** 去掉 Prompt A/B 临时后缀，回到生产 Skill id，避免叠出 risk-check__pab_xxx__pab_yyy */
export function baseSkillId(skillId: string) {
  return skillId.replace(/(__pab_[a-f0-9]+)+$/gi, "") || skillId;
}

export async function cloneSkillAsTemp(sourceId: string, input: {
  systemPrompt: string;
  nameSuffix?: string;
  changeNote?: string;
}): Promise<SkillRecord> {
  const productionId = baseSkillId(sourceId);
  const source = await getSkill(productionId);
  const short = randomUUID().slice(0, 8);
  const id = `${productionId}__pab_${short}`;
  const filePath = `tmp/${id}.md`;
  const meta: Skill = {
    id,
    name: `${source.name}${input.nameSuffix || "（Prompt A/B 实验）"}`,
    description: `临时实验副本，源自 ${productionId}。${input.changeNote || ""}`.trim(),
    enabled: false,
    model: source.model,
    temperature: source.temperature,
    maxTokens: source.maxTokens,
    requiredTools: source.requiredTools,
    version: `${source.version}-pab`,
    filePath,
    status: "draft",
    toolIds: source.toolIds ?? source.requiredTools,
  };

  await writeSkillPrompt(filePath, input.systemPrompt);
  try {
    await updateJson<Skill[]>("skills.json", (skills) => {
      if (skills.some((item) => item.id === id)) throw new Error(`Skill 已存在：${id}`);
      return [meta, ...skills];
    });
  } catch (error) {
    await writeSkillPrompt(filePath, "").catch(() => undefined);
    throw error;
  }
  return hydrateSkill(meta);
}

export async function disableTempSkill(skillId: string) {
  await removeTempSkill(skillId);
}

/** 删除 Prompt A/B 临时 Skill（元数据 + 临时 md），避免 Skill 列表堆满副本 */
export async function removeTempSkill(skillId: string) {
  if (!isTempPromptAbSkillId(skillId)) return;
  try {
    const current = await getSkill(skillId).catch(() => null);
    await updateJson<Skill[]>("skills.json", (skills) => skills.filter((item) => item.id !== skillId));
    if (current?.filePath?.startsWith("tmp/")) {
      await unlink(resolveProjectFile("skills", current.filePath)).catch(() => undefined);
    }
  } catch {
    // ignore missing temp skill
  }
}

export async function rollbackSkill(skillId: string, versionId: string) {
  const version = await getSkillVersion(versionId, skillId);
  return updateSkill(skillId, {
    systemPrompt: version.systemPrompt,
    version: version.version,
    changeNote: `回滚到 ${version.version}（${version.id}）前自动快照`,
  });
}

export async function saveSkillVersion(
  skillId: string,
  changeNote: string,
  version?: string,
): Promise<SkillVersionSnapshot> {
  if (version) {
    await updateSkill(skillId, { version, snapshotBefore: false, changeNote });
  }
  return snapshotSkill(skillId, changeNote || "手动保存版本");
}

export async function diffSkillVersions(skillId: string, fromId?: string, toId?: string) {
  const current = await getSkill(skillId);
  const versions = await listSkillVersions(skillId);
  const from = fromId ? versions.find((item) => item.id === fromId) : versions[0];
  if (fromId && !from) {
    throw new Error("找不到对比源版本");
  }
  const to = toId ? versions.find((item) => item.id === toId) : null;
  const before = from?.systemPrompt ?? "";
  const after = to?.systemPrompt ?? current.systemPrompt;
  return {
    skillId,
    from: from
      ? { id: from.id, version: from.version, createdAt: from.createdAt, hash: from.hash }
      : null,
    to: to
      ? { id: to.id, version: to.version, createdAt: to.createdAt, hash: to.hash }
      : { id: "current", version: current.version, createdAt: null, hash: hashSkillSnapshot(current, current.systemPrompt) },
    lines: diffText(before, after),
  };
}
