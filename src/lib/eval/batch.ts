import "server-only";

import { randomUUID } from "node:crypto";

import { runAgent } from "@/lib/agent/pipeline";
import { applyRecount, isTerminalBatchStatus } from "@/lib/eval/batch-stats";
import { listEvalCases } from "@/lib/eval/cases";
import { EVALUATOR_MODE, EVALUATOR_VERSION, evaluatorHash, hashPayload } from "@/lib/eval/evaluator";
import { normalizeEvalBatch } from "@/lib/eval/normalize-batch";
import { normalizeEvalCase } from "@/lib/eval/normalize";
import { resolveBatchCaseIds } from "@/lib/eval/resolve-ids";
import { scoreEvalWithJudge } from "@/lib/eval/judge";
import { scoreEval } from "@/lib/eval/score";
import { RouteError } from "@/lib/http";
import { loadLlmConfig, resolveProviderId } from "@/lib/llm";
import { upsertImprovement } from "@/lib/ops/improvements";
import { inferIssueType } from "@/lib/ops/issue";
import { hashSkillSnapshot } from "@/lib/skills/hash";
import { listEnabledSkills, listSkillRecords } from "@/lib/skills/registry";
import { readJson, updateJson } from "@/lib/store";
import type { EvalBatch, EvalCase, EvalCaseResult, EvalCaseSnapshot } from "@/lib/types";

async function maybeCreateEvalImprovement(result: EvalCaseResult, question: string) {
  if (result.status !== "FAIL") return;
  try {
    const issueType = inferIssueType([question, result.reason || "", ...(result.evidence ?? [])].join(" "));
    await upsertImprovement({
      title: `测评失败：${result.name || result.caseId}`,
      source: "eval",
      issueType,
      runId: result.runId || undefined,
      note: result.reason || `batch 用例 ${result.caseId} FAIL`,
    });
  } catch {
    // 改进建议写入失败不阻断测评批次
  }
}

const FILE = "eval_batches.json";

type Dedup = { key: string; batchId: string; at: number };

const recentCreates: Dedup[] = [];
const cancelled = new Set<string>();
const running = new Set<string>();

function snapshotCase(item: EvalCase): EvalCaseSnapshot {
  return {
    id: item.id,
    name: item.name,
    question: item.question,
    expectedKeywords: item.expectedKeywords,
    forbiddenWords: item.forbiddenWords,
    expectedPrice: item.expectedPrice,
    expectedReply: item.expectedReply,
    expectedSkillId: item.expectedSkillId,
    requiredCapabilities: item.requiredCapabilities,
    forbiddenCapabilities: item.forbiddenCapabilities,
    expectReplySafe: item.expectReplySafe,
    expectInputRisk: item.expectInputRisk,
    evalDimension: item.evalDimension,
  };
}

export async function listEvalBatches(): Promise<EvalBatch[]> {
  const raw = await readJson<Array<Partial<EvalBatch> & Record<string, unknown>>>(FILE);
  return raw.map((item) => normalizeEvalBatch(item)).filter((item) => item.id);
}

export async function getEvalBatch(id: string): Promise<EvalBatch> {
  const found = (await listEvalBatches()).find((item) => item.id === id);
  if (!found) {
    throw new RouteError(404, "未找到评测批次", { code: "EVAL_BATCH_NOT_FOUND", batchId: id });
  }
  return found;
}

async function saveBatch(next: EvalBatch) {
  const counted = normalizeEvalBatch(applyRecount(next));
  await updateJson<Array<Partial<EvalBatch> & Record<string, unknown>>>(FILE, (items) => {
    const mapped = items.map((item) => normalizeEvalBatch(item));
    const index = mapped.findIndex((item) => item.id === counted.id);
    if (index === -1) return [counted, ...mapped];
    const copy = [...mapped];
    copy[index] = counted;
    return copy;
  });
  return counted;
}

const UNSAVED_KEEP = 5;

async function pruneUnsavedBatches(keepId: string) {
  const items = await listEvalBatches();
  const drop = items
    .filter((item) => !item.saved && item.id !== keepId && isTerminalBatchStatus(item.status))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(UNSAVED_KEEP)
    .map((item) => item.id);
  if (!drop.length) return;
  const dropSet = new Set(drop);
  await updateJson<Array<Partial<EvalBatch> & Record<string, unknown>>>(FILE, (current) =>
    current.filter((item) => !dropSet.has(String(item.id || ""))),
  );
}

function keptAfterFinish(batch: EvalBatch, status: EvalBatch["status"]) {
  if (status === "cancelled") return batch.saved;
  return batch.saved || batch.saveOnComplete;
}

export async function patchEvalBatch(
  id: string,
  patch: { saved?: boolean; saveOnComplete?: boolean },
) {
  const batch = await getEvalBatch(id);
  let saved = batch.saved;
  let saveOnComplete = batch.saveOnComplete;
  if (patch.saveOnComplete !== undefined) saveOnComplete = patch.saveOnComplete;
  if (patch.saved === true) {
    if (isTerminalBatchStatus(batch.status) && batch.status !== "cancelled") {
      saved = true;
    } else {
      saveOnComplete = true;
    }
  }
  if (patch.saved === false) {
    saved = false;
    saveOnComplete = false;
  }
  return saveBatch({ ...batch, saved, saveOnComplete });
}

export async function deleteEvalBatch(id: string) {
  const batch = await getEvalBatch(id);
  if (batch.status === "running" || batch.status === "queued") {
    throw new RouteError(409, "批次仍在运行，无法删除", { code: "EVAL_BATCH_RUNNING", batchId: id });
  }
  if (!batch.saved) {
    throw new RouteError(400, "只能删除已保存的回归批次", { code: "EVAL_BATCH_NOT_SAVED", batchId: id });
  }
  cancelled.add(id);
  running.delete(id);
  await updateJson<Array<Partial<EvalBatch> & Record<string, unknown>>>(FILE, (items) =>
    items.filter((item) => String(item.id || "") !== id),
  );
}

export async function createEvalBatch(input: {
  name?: string;
  versionLabel?: string;
  changeNote?: string;
  caseIds?: string[] | null;
  saveOnComplete?: boolean;
  skillPromptOverrides?: Record<string, string>;
  plannerPromptOverride?: string;
  toolOverrides?: Record<string, { description?: string; enabled?: boolean }>;
  suppressEvalImprovements?: boolean;
}) {
  const cases = await listEvalCases();
  const enabledIds = cases.filter((item) => item.enabled).map((item) => item.id);
  let caseIds: string[];
  try {
    caseIds = resolveBatchCaseIds({
      requested: input.caseIds,
      enabledIds,
      knownIds: cases.map((item) => item.id),
    }).filter((id) => enabledIds.includes(id));
  } catch (error) {
    const invalidIds = error instanceof Error && "invalidIds" in error ? (error as { invalidIds: string[] }).invalidIds : undefined;
    const status = error instanceof Error && "status" in error ? Number((error as { status: number }).status) : 400;
    throw new RouteError(status, error instanceof Error ? error.message : "caseIds 不合法", {
      code: error instanceof Error && "code" in error ? String((error as { code: string }).code) : "INVALID_CASE_IDS",
      invalidIds,
    });
  }
  if (caseIds.length === 0) {
    throw new RouteError(400, "没有可运行的启用用例", { code: "EMPTY_CASE_IDS" });
  }

  const overrides = input.skillPromptOverrides ?? {};
  const plannerOverride = input.plannerPromptOverride?.trim() || undefined;
  const toolOverrides = input.toolOverrides ?? {};
  const dedupeKey = JSON.stringify({
    caseIds,
    versionLabel: input.versionLabel || "",
    name: input.name || "",
    overrideKeys: Object.keys(overrides).sort(),
    overrideHash: hashPayload(overrides),
    plannerHash: plannerOverride ? hashPayload(plannerOverride) : "",
    toolOverrideHash: hashPayload(toolOverrides),
  });
  const now = Date.now();
  const hit = recentCreates.find((item) => item.key === dedupeKey && now - item.at < 5000);
  if (hit) {
    return getEvalBatch(hit.batchId);
  }

  const selected = caseIds.map((id) => {
    const found = cases.find((item) => item.id === id);
    if (!found) throw new RouteError(400, `存在无效 caseId：${id}`, { invalidIds: [id] });
    return found;
  });
  const caseSnapshot = selected.map(snapshotCase);
  const [skills, config] = await Promise.all([listEnabledSkills().catch(() => listSkillRecords()), loadLlmConfig()]);
  const skillPins = skills.map((skill) => {
    const prompt =
      overrides[skill.id] !== undefined
        ? overrides[skill.id]
        : "systemPrompt" in skill
          ? skill.systemPrompt
          : "";
    return {
      id: skill.id,
      version: skill.version,
      hash: hashSkillSnapshot(skill, prompt),
    };
  });
  const created = normalizeEvalBatch({
    id: `eb_${randomUUID()}`,
    name: input.name || input.versionLabel || `评测批次 ${new Date().toISOString()}`,
    versionLabel: input.versionLabel || "",
    changeNote: input.changeNote || "",
    caseIds,
    caseSnapshot,
    caseSetHash: hashPayload(caseSnapshot),
    skillVersion: skillPins.map((item) => `${item.id}@${item.version}`).join(","),
    skillHash: hashPayload({
      skills: skillPins,
      planner: plannerOverride ? hashPayload(plannerOverride) : null,
      tools: Object.keys(toolOverrides).length ? toolOverrides : null,
    }),
    skillPromptOverrides: Object.keys(overrides).length ? overrides : undefined,
    plannerPromptOverride: plannerOverride,
    toolOverrides: Object.keys(toolOverrides).length ? toolOverrides : undefined,
    suppressEvalImprovements: input.suppressEvalImprovements === true,
    evaluatorVersion: EVALUATOR_VERSION,
    evaluatorHash: evaluatorHash(),
    evaluatorMode: EVALUATOR_MODE,
    judgeEnabled: true,
    provider: resolveProviderId(config),
    model: config.model,
    params: { temperature: config.temperature, maxTokens: config.maxTokens },
    createdAt: new Date().toISOString(),
    status: "queued",
    currentIndex: 0,
    caseResults: [],
    saved: false,
    saveOnComplete: input.saveOnComplete === true,
  });
  await saveBatch(created);
  recentCreates.unshift({ key: dedupeKey, batchId: created.id, at: now });
  await pruneUnsavedBatches(created.id);
  return created;
}

function toCaseResult(item: EvalCase, score: ReturnType<typeof scoreEval>, runId?: string, capabilityPath: string[] = []): EvalCaseResult {
  return {
    caseId: item.id,
    name: item.name,
    question: item.question,
    finalReply: "",
    status: score.status,
    reason: score.reason,
    keywordHits: score.keywordHits,
    keywordMisses: score.keywordMisses,
    forbiddenHits: score.forbiddenHits,
    expectedPrice: score.expectedPrice,
    mentionedPrice: score.mentionedPrice,
    riskIssues: score.riskIssues,
    capabilityHits: score.capabilityHits,
    capabilityPath,
    durationMs: score.durationMs,
    runId: score.runId || runId,
    evidence: score.evidence,
    inputRisk: score.inputRisk,
    replySafe: score.replySafe,
    shouldSend: score.shouldSend,
    judge: score.judge,
  };
}

export async function executeEvalBatch(batchId: string) {
  if (running.has(batchId)) return;
  running.add(batchId);
  try {
    let batch = await getEvalBatch(batchId);
    if (batch.status === "done" || batch.status === "error" || batch.status === "cancelled") return;
    batch = await saveBatch({
      ...batch,
      status: "running",
      startedAt: batch.startedAt || new Date().toISOString(),
      caseResults: [],
    });

    const cases = await listEvalCases();
    for (let index = 0; index < batch.caseIds.length; index += 1) {
      if (cancelled.has(batchId)) {
        batch = await saveBatch({
          ...batch,
          status: "cancelled",
          finishedAt: new Date().toISOString(),
          currentIndex: index,
        });
        return;
      }
      const caseId = batch.caseIds[index];
      const item = cases.find((entry) => entry.id === caseId);
      batch = await saveBatch({ ...batch, currentIndex: index + 1, status: "running" });
      if (!item) {
        const ghost = normalizeEvalCase({ id: caseId, name: caseId, question: "" });
        const missing = toCaseResult(
          ghost,
          await scoreEvalWithJudge(scoreEval({ case: ghost, error: { message: `运行中用例已不存在：${caseId}` } }), { case: ghost }),
        );
        batch = await saveBatch({ ...batch, caseResults: [...batch.caseResults, missing] });
        continue;
      }

      try {
        const run = await runAgent({
          question: item.question,
          source: "eval",
          skillPromptOverrides: batch.skillPromptOverrides,
          plannerPromptOverride: batch.plannerPromptOverride,
          toolOverrides: batch.toolOverrides,
        });
        const score = await scoreEvalWithJudge(scoreEval({ case: item, run }), { case: item, run });
        const path = [
          ...(run.plan?.selectedSkills ?? []),
          ...(run.plan?.selectedTools ?? []),
          ...(run.plan?.mandatoryCapabilities ?? []),
        ];
        const result = {
          ...toCaseResult(item, score, run.id, path),
          finalReply: run.finalReply,
        };
        batch = await saveBatch({ ...batch, caseResults: [...batch.caseResults, result] });
        if (!batch.suppressEvalImprovements) {
          await maybeCreateEvalImprovement(result, item.question);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "单条运行失败";
        const score = await scoreEvalWithJudge(scoreEval({ case: item, error: { message } }), { case: item });
        batch = await saveBatch({
          ...batch,
          caseResults: [...batch.caseResults, { ...toCaseResult(item, score), reason: message }],
        });
      }
    }

    batch = await getEvalBatch(batchId);
    if (batch.status === "cancelled") return;
    await saveBatch({
      ...batch,
      status: "done",
      saved: keptAfterFinish(batch, "done"),
      finishedAt: new Date().toISOString(),
      currentIndex: batch.caseIds.length,
    });
  } catch (error) {
    const current = await getEvalBatch(batchId).catch(() => null);
    if (current) {
      await saveBatch({
        ...current,
        status: "error",
        saved: keptAfterFinish(current, "error"),
        finishedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "批次无法继续",
      });
    }
  } finally {
    running.delete(batchId);
    cancelled.delete(batchId);
  }
}

const scheduled = new Set<string>();

export function requestCancelEvalBatch(id: string) {
  cancelled.add(id);
}

export function scheduleEvalBatch(id: string) {
  if (scheduled.has(id)) return;
  scheduled.add(id);
  void executeEvalBatch(id).finally(() => {
    scheduled.delete(id);
  });
}
