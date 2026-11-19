import "server-only";

import { updateJson, readJson } from "@/lib/store";
import type { AgentRun, RunRecord } from "@/lib/types";

function isRunRecord(value: unknown): value is RunRecord {
  return Boolean(value && typeof value === "object" && "question" in value && "steps" in value);
}

export function normalizeRun(value: unknown): RunRecord | null {
  if (isRunRecord(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const legacy = value as AgentRun;
  if (!legacy.id || !legacy.status) {
    return null;
  }
  return {
    id: legacy.id,
    question: legacy.notes || "",
    source: "legacy",
    conversationId: legacy.ticketId,
    createdAt: legacy.startedAt,
    status: legacy.status,
    finalReply: legacy.notes || "",
    plan: null,
    steps: [],
    riskResult: null,
    durationMs: 0,
    provider: "unknown",
    model: "",
    skillVersions: legacy.skillId ? [{ skillId: legacy.skillId, version: "legacy" }] : [],
    toolVersions: [],
    ticketId: legacy.ticketId,
  };
}

/** List/table payloads must not embed plan/steps (can be multi‑MB). */
export function summarizeRunRecord(run: RunRecord): RunRecord {
  return {
    id: run.id,
    question: run.question,
    source: run.source,
    conversationId: run.conversationId,
    createdAt: run.createdAt,
    status: run.status,
    finalReply: "",
    plan: null,
    steps: [],
    riskResult: null,
    durationMs: run.durationMs,
    error: run.error,
    provider: run.provider,
    model: run.model,
    skillVersions: [],
    toolVersions: [],
    ticketId: run.ticketId,
  };
}

const MAX_STORED_RUNS = 200;

export async function listRunRecords(options?: {
  limit?: number;
  summary?: boolean;
}): Promise<RunRecord[]> {
  const raw = await readJson<unknown[]>("runs.json");
  let runs = raw
    .map((item) => normalizeRun(item))
    .filter((item): item is RunRecord => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    runs = runs.slice(0, Math.max(0, Math.floor(options.limit)));
  }
  if (options?.summary) {
    runs = runs.map(summarizeRunRecord);
  }
  return runs;
}

export async function getRunRecord(id: string): Promise<RunRecord | null> {
  const raw = await readJson<unknown[]>("runs.json");
  for (const item of raw) {
    const normalized = normalizeRun(item);
    if (normalized?.id === id) return normalized;
  }
  return null;
}

export async function saveRunRecord(record: RunRecord): Promise<RunRecord> {
  await updateJson<unknown[]>("runs.json", (current) => {
    const next = current.filter((item) => {
      const normalized = normalizeRun(item);
      return normalized?.id !== record.id;
    });
    return [record, ...next].slice(0, MAX_STORED_RUNS);
  });
  return record;
}

