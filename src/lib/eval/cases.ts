import "server-only";

import { randomUUID } from "node:crypto";

import { getRunRecord } from "@/lib/agent/runs";
import { normalizeEvalCase } from "@/lib/eval/normalize";
import { readJson, updateJson } from "@/lib/store";
import type { EvalCase } from "@/lib/types";

export type EvalCaseQuery = {
  enabledOnly?: boolean;
  category?: string | null;
  difficulty?: string | null;
  riskLevel?: string | null;
  evalDimension?: string | null;
  tag?: string | null;
};

export function filterEvalCases(cases: EvalCase[], query: EvalCaseQuery = {}) {
  return cases.filter((item) => {
    if (query.enabledOnly && !item.enabled) return false;
    if (query.category && item.category !== query.category) return false;
    if (query.difficulty && item.difficulty !== query.difficulty) return false;
    if (query.riskLevel && item.riskLevel !== query.riskLevel) return false;
    if (query.evalDimension && item.evalDimension !== query.evalDimension) return false;
    if (query.tag && !(item.tags ?? []).includes(query.tag)) return false;
    return true;
  });
}

export async function listEvalCases(enabledOnly = false): Promise<EvalCase[]> {
  const raw = await readJson<Array<Partial<EvalCase> & Record<string, unknown>>>("eval_cases.json");
  const cases = raw.map((item) => normalizeEvalCase(item)).filter((item) => item.id);
  return enabledOnly ? filterEvalCases(cases, { enabledOnly: true }) : cases;
}

export async function getEvalCase(id: string): Promise<EvalCase> {
  const found = (await listEvalCases()).find((item) => item.id === id);
  if (!found) throw new Error(`未找到评测用例：${id}`);
  return found;
}

function writeCases(cases: EvalCase[]) {
  return updateJson<EvalCase[]>("eval_cases.json", () => cases);
}

export async function createEvalCase(input: Partial<EvalCase> & { copyFrom?: string; sourceRunId?: string }) {
  if (input.copyFrom) {
    const current = await getEvalCase(input.copyFrom);
    const copy = {
      ...current,
      id: `ec_${randomUUID()}`,
      name: `${current.name}（副本）`,
      createdAt: new Date().toISOString(),
      enabled: current.enabled,
    };
    await updateJson<EvalCase[]>("eval_cases.json", (items) => [normalizeEvalCase(copy), ...items.map((item) => normalizeEvalCase(item))]);
    return normalizeEvalCase(copy);
  }

  let question = input.question || input.userUtterance || "";
  if (input.sourceRunId) {
    const run = await getRunRecord(input.sourceRunId);
    if (!run) throw new Error(`未找到运行：${input.sourceRunId}`);
    question = question || run.question;
  }
  if (!question.trim()) throw new Error("缺少 question");
  const created = normalizeEvalCase({
    ...input,
    id: `ec_${randomUUID()}`,
    name: input.name || input.title || `评测：${question.slice(0, 16)}`,
    question,
    createdAt: new Date().toISOString(),
    enabled: input.enabled !== false,
  });
  await updateJson<EvalCase[]>("eval_cases.json", (items) => [created, ...items.map((item) => normalizeEvalCase(item))]);
  return created;
}

export async function updateEvalCase(id: string, patch: Partial<EvalCase>) {
  const current = await getEvalCase(id);
  const next = normalizeEvalCase({ ...current, ...patch, id });
  await updateJson<EvalCase[]>("eval_cases.json", (items) =>
    items.map((item) => (normalizeEvalCase(item).id === id ? next : normalizeEvalCase(item))),
  );
  return next;
}

export async function deleteEvalCase(id: string) {
  await getEvalCase(id);
  await updateJson<EvalCase[]>("eval_cases.json", (items) =>
    items.filter((item) => normalizeEvalCase(item).id !== id),
  );
}

export { writeCases };
