import "server-only";

import { getRunRecord } from "@/lib/agent/runs";
import { createEvalCase, listEvalCases } from "@/lib/eval/cases";
import { getImprovement, updateImprovement } from "@/lib/ops/improvements";
import type { Improvement, ImprovementSampleFocus } from "@/lib/types";

function normalizeFocus(item: Improvement): ImprovementSampleFocus[] {
  if (item.sampleFocus?.length) return [...item.sampleFocus];
  return (item.sampleRunIds ?? []).map((runId) => ({
    runId,
    addedAt: item.createdAt || new Date().toISOString(),
  }));
}

/** 复用已有 sourceRunId 测评用例，否则创建焦点用例 */
export async function ensureEvalCaseForRun(input: {
  runId: string;
  improvementId?: string;
  label?: string;
}): Promise<{ caseId: string; created: boolean }> {
  const existing = (await listEvalCases()).find((item) => item.sourceRunId === input.runId);
  if (existing) return { caseId: existing.id, created: false };

  const run = await getRunRecord(input.runId);
  if (!run) throw new Error(`未找到运行：${input.runId}`);
  const label = input.label?.trim() || "focus";
  const created = await createEvalCase({
    name: `焦点：${run.question.slice(0, 28)}${run.question.length > 28 ? "…" : ""}`,
    question: run.question,
    expectedBehavior: "按改进焦点核对回复是否相对对照组更符合预期",
    sourceRunId: input.runId,
    category: "annotation",
    tags: ["focus", "annotation", label].filter(Boolean),
    evalDimension: "focus",
    enabled: true,
  });
  return { caseId: created.id, created: true };
}

/** 确保改进单全部焦点样本都有 evalCaseId，并写回 improvements.json */
export async function ensureImprovementFocusCases(improvementId: string): Promise<{
  improvement: Improvement;
  focusCaseIds: string[];
}> {
  const improvement = await getImprovement(improvementId);
  const focus = normalizeFocus(improvement);
  if (focus.length === 0) {
    return { improvement, focusCaseIds: [] };
  }

  const nextFocus: ImprovementSampleFocus[] = [];
  for (const entry of focus) {
    if (entry.evalCaseId) {
      nextFocus.push(entry);
      continue;
    }
    const ensured = await ensureEvalCaseForRun({
      runId: entry.runId,
      improvementId,
      label: improvement.diagnosis?.rootCauseKey,
    });
    nextFocus.push({ ...entry, evalCaseId: ensured.caseId });
  }

  const updated = await updateImprovement(improvementId, {
    sampleFocus: nextFocus,
    sampleRunIds: nextFocus.map((item) => item.runId),
  });

  return {
    improvement: updated,
    focusCaseIds: nextFocus.map((item) => item.evalCaseId!).filter(Boolean),
  };
}
