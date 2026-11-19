import { applyRecount } from "@/lib/eval/batch-stats";
import { EVALUATOR_MODE, EVALUATOR_VERSION, evaluatorHash } from "@/lib/eval/evaluator";
import type { EvalBatch, EvalBatchStatus, EvalCaseResult, EvalCaseSnapshot } from "@/lib/types";

function asStatus(value: unknown): EvalBatchStatus {
  if (value === "completed") return "done";
  if (value === "failed") return "error";
  if (value === "queued" || value === "running" || value === "done" || value === "error" || value === "cancelled") {
    return value;
  }
  return "queued";
}

export function normalizeEvalBatch(raw: Partial<EvalBatch> & Record<string, unknown>): EvalBatch {
  const caseIds = Array.isArray(raw.caseIds) ? raw.caseIds.filter((item): item is string => typeof item === "string") : [];
  const caseResults = Array.isArray(raw.caseResults) ? (raw.caseResults as EvalCaseResult[]) : [];
  const counted = applyRecount({
    caseIds,
    caseResults,
    total: caseIds.length,
    passed: 0,
    failed: 0,
    review: 0,
    errors: 0,
    passRate: 0,
    qualityPassRate: 0,
  });
  return {
    id: String(raw.id || ""),
    name: String(raw.name || "未命名批次"),
    versionLabel: String(raw.versionLabel || ""),
    changeNote: String(raw.changeNote || ""),
    caseIds,
    caseSnapshot: Array.isArray(raw.caseSnapshot) ? (raw.caseSnapshot as EvalCaseSnapshot[]) : [],
    caseSetHash: String(raw.caseSetHash || ""),
    skillVersion: String(raw.skillVersion || ""),
    skillHash: String(raw.skillHash || ""),
    skillPromptOverrides:
      raw.skillPromptOverrides && typeof raw.skillPromptOverrides === "object" && !Array.isArray(raw.skillPromptOverrides)
        ? Object.fromEntries(
            Object.entries(raw.skillPromptOverrides as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
            ),
          )
        : undefined,
    plannerPromptOverride: typeof raw.plannerPromptOverride === "string" ? raw.plannerPromptOverride : undefined,
    toolOverrides:
      raw.toolOverrides && typeof raw.toolOverrides === "object" && !Array.isArray(raw.toolOverrides)
        ? Object.fromEntries(
            Object.entries(raw.toolOverrides as Record<string, unknown>)
              .filter((entry): entry is [string, Record<string, unknown>] => typeof entry[0] === "string" && !!entry[1] && typeof entry[1] === "object")
              .map(([id, value]) => [
                id,
                {
                  description: typeof value.description === "string" ? value.description : undefined,
                  enabled: typeof value.enabled === "boolean" ? value.enabled : undefined,
                },
              ]),
          )
        : undefined,
    suppressEvalImprovements: raw.suppressEvalImprovements === true,
    evaluatorVersion: String(raw.evaluatorVersion || EVALUATOR_VERSION),
    evaluatorHash: String(raw.evaluatorHash || evaluatorHash()),
    evaluatorMode: raw.evaluatorMode === "rules" || raw.evaluatorMode === "rules+judge" ? raw.evaluatorMode : EVALUATOR_MODE,
    judgeEnabled: raw.judgeEnabled === true,
    provider: String(raw.provider || ""),
    model: String(raw.model || ""),
    params: {
      temperature: Number(raw.params && typeof raw.params === "object" && "temperature" in raw.params ? raw.params.temperature : 0.2),
      maxTokens: Number(raw.params && typeof raw.params === "object" && "maxTokens" in raw.params ? raw.params.maxTokens : 800),
    },
    createdAt: String(raw.createdAt || new Date().toISOString()),
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : undefined,
    finishedAt: typeof raw.finishedAt === "string" ? raw.finishedAt : undefined,
    status: asStatus(raw.status),
    currentIndex: Number(raw.currentIndex || 0),
    total: caseIds.length,
    passed: counted.passed,
    failed: counted.failed,
    review: counted.review,
    errors: counted.errors,
    passRate: counted.qualityPassRate,
    qualityPassRate: counted.qualityPassRate,
    caseResults,
    errorMessage: typeof raw.errorMessage === "string" ? raw.errorMessage : undefined,
    saved: raw.saved !== false,
    saveOnComplete: raw.saveOnComplete === true,
  };
}
