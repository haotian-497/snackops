import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_JUDGE_SYSTEM_PROMPT } from "@/lib/eval/judge-prompt";
import { ensureJsonFile, tryReadJson, updateJson, writeJson } from "@/lib/store";
import type { JudgeConfig, JudgeVersionSnapshot } from "@/lib/types";

function looksLikeTenPointJudgePrompt(prompt: string) {
  return /均为\s*0[-–]10/.test(prompt) || /overall:\s*0[-–]10/.test(prompt);
}

function normalize(raw: Partial<JudgeConfig> | null): JudgeConfig {
  const rawPrompt = raw?.systemPrompt?.trim() || "";
  const systemPrompt = !rawPrompt || looksLikeTenPointJudgePrompt(rawPrompt) ? DEFAULT_JUDGE_SYSTEM_PROMPT : rawPrompt;
  return {
    systemPrompt,
    updatedAt: raw?.updatedAt || new Date().toISOString(),
  };
}

export async function getJudgeConfig(): Promise<JudgeConfig> {
  const file = await tryReadJson<Partial<JudgeConfig>>("judge-config.json");
  const config = normalize(file);
  if (!file || looksLikeTenPointJudgePrompt(file.systemPrompt || "")) {
    await writeJson("judge-config.json", config);
  }
  return config;
}

export async function listJudgeVersions(): Promise<JudgeVersionSnapshot[]> {
  const versions = await ensureJsonFile<JudgeVersionSnapshot[]>("judge-versions.json", []);
  return [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteJudgeVersion(versionId: string): Promise<{ id: string }> {
  const versions = await listJudgeVersions();
  if (!versions.some((item) => item.id === versionId)) {
    throw new Error(`未找到 Judge 版本：${versionId}`);
  }
  await updateJson<JudgeVersionSnapshot[]>("judge-versions.json", (items) =>
    (items ?? []).filter((item) => item.id !== versionId),
  );
  return { id: versionId };
}

async function snapshotJudge(changeNote: string): Promise<void> {
  const current = await getJudgeConfig();
  const snapshot: JudgeVersionSnapshot = {
    id: `jv_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    changeNote,
    systemPrompt: current.systemPrompt,
    updatedAt: current.updatedAt,
  };
  await updateJson<JudgeVersionSnapshot[]>("judge-versions.json", (items) => [snapshot, ...(items ?? [])]);
}

export async function saveJudgeConfig(systemPrompt: string, changeNote?: string): Promise<JudgeConfig> {
  await ensureJsonFile<JudgeVersionSnapshot[]>("judge-versions.json", []);
  await snapshotJudge(changeNote || "修改前自动快照");
  const config: JudgeConfig = {
    systemPrompt: looksLikeTenPointJudgePrompt(systemPrompt.trim())
      ? DEFAULT_JUDGE_SYSTEM_PROMPT
      : systemPrompt.trim() || DEFAULT_JUDGE_SYSTEM_PROMPT,
    updatedAt: new Date().toISOString(),
  };
  await writeJson("judge-config.json", config);
  return config;
}

export async function rollbackJudge(versionId: string): Promise<JudgeConfig> {
  const versions = await listJudgeVersions();
  const version = versions.find((item) => item.id === versionId);
  if (!version) {
    throw new Error(`未找到 Judge 版本：${versionId}`);
  }
  return saveJudgeConfig(version.systemPrompt, `回滚到 ${version.id} 前自动快照`);
}
