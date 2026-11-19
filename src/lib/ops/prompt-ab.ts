import "server-only";

import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";

import { createEvalBatch, getEvalBatch, scheduleEvalBatch } from "@/lib/eval/batch";
import { compareEvalBatches } from "@/lib/eval/compare";
import { listEvalCases } from "@/lib/eval/cases";
import { listRunRecords } from "@/lib/agent/runs";
import { RouteError } from "@/lib/http";
import { ensureImprovementFocusCases } from "@/lib/ops/focus-cases";
import {
  samplePreviewFromRun,
  type PromptAbCasePreview,
  type PromptAbExperimentView,
} from "@/lib/ops/improvement-samples";
import { getImprovement, listImprovements, updateImprovement } from "@/lib/ops/improvements";
import { updatePlanner } from "@/lib/planner/registry";
import { resolveProjectFile } from "@/lib/safe-path";
import { writeSkillPrompt } from "@/lib/skills/files";
import { cloneSkillAsTemp, getSkill, removeTempSkill, updateSkill, baseSkillId } from "@/lib/skills/registry";
import { ensureJsonFile, updateJson } from "@/lib/store";
import { getTool, updateTool } from "@/lib/tools/registry";
import type {
  EvalBatch,
  EvalBatchCompare,
  PromptAbCaseSuite,
  PromptAbExperiment,
  PromptAbKind,
  PromptAbStatus,
} from "@/lib/types";

const FILE = "prompt-ab-experiments.json";

export type { PromptAbCaseSuite, PromptAbCasePreview, PromptAbExperimentView };

async function resolveCaseIdsForSuite(suite: PromptAbCaseSuite): Promise<string[]> {
  const enabled = (await listEvalCases()).filter((item) => item.enabled);
  if (suite === "ab-smoke") {
    const smoke = enabled.filter((item) => (item.tags ?? []).includes("ab-smoke"));
    if (smoke.length === 0) {
      throw new RouteError(400, "没有启用的 ab-smoke 用例，请先在测评集启用烟测用例，或改选「全部启用」", {
        code: "PROMPT_AB_NO_SMOKE_CASES",
      });
    }
    return smoke.map((item) => item.id);
  }
  if (enabled.length === 0) {
    throw new RouteError(400, "没有启用的测评用例，无法双批跑测", { code: "PROMPT_AB_NO_CASES" });
  }
  return enabled.map((item) => item.id);
}

function uniqueCaseIds(...groups: string[][]) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function mergeFocusAndSuite(focusCaseIds: string[], suiteIds: string[]) {
  const focusSet = new Set(focusCaseIds);
  const regressionIds = suiteIds.filter((id) => !focusSet.has(id));
  return {
    caseIds: uniqueCaseIds(focusCaseIds, suiteIds),
    focusCaseIds: [...focusSet],
    regressionIds,
    focusCount: focusSet.size,
    regressionCount: regressionIds.length,
  };
}

async function resolveFocusCaseIds(improvementId: string) {
  const { focusCaseIds } = await ensureImprovementFocusCases(improvementId);
  return focusCaseIds;
}

export async function countCasesBySuite() {
  const enabled = (await listEvalCases()).filter((item) => item.enabled);
  return {
    all: enabled.length,
    "ab-smoke": enabled.filter((item) => (item.tags ?? []).includes("ab-smoke")).length,
  };
}

function normalizeExperiment(raw: PromptAbExperiment): PromptAbExperiment {
  return {
    ...raw,
    kind: raw.kind || "skill",
    caseSuite: raw.caseSuite === "ab-smoke" || raw.caseSuite === "all" ? raw.caseSuite : "all",
  };
}

async function readExperiments(): Promise<PromptAbExperiment[]> {
  const items = await ensureJsonFile<PromptAbExperiment[]>(FILE, []);
  return items.map(normalizeExperiment);
}

export async function listPromptAbExperiments(): Promise<PromptAbExperiment[]> {
  return readExperiments();
}

export async function enrichPromptAbExperiments(
  experiments: PromptAbExperiment[],
): Promise<PromptAbExperimentView[]> {
  const [improvements, runs, cases] = await Promise.all([listImprovements(), listRunRecords(), listEvalCases()]);
  const impMap = new Map(improvements.map((item) => [item.id, item]));
  const runMap = new Map(runs.map((item) => [item.id, item]));
  const caseMap = new Map(cases.map((item) => [item.id, item]));

  return experiments.map((exp) => {
    const improvement = impMap.get(exp.improvementId);
    const sourceSamples = (improvement?.sampleRunIds ?? []).map((runId) =>
      samplePreviewFromRun(runId, runMap.get(runId)),
    );
    const focusSet = new Set(exp.focusCaseIds ?? []);
    const casePreviews = exp.caseIds.map((caseId) => {
      const item = caseMap.get(caseId);
      return {
        caseId,
        name: item?.name || caseId,
        question: item?.question?.trim() || "",
        focusRole: (focusSet.has(caseId) ? "focus" : "regression") as PromptAbCasePreview["focusRole"],
      };
    });
    const focusCaseCount = casePreviews.filter((item) => item.focusRole === "focus").length;
    const regressionCaseCount = casePreviews.filter((item) => item.focusRole === "regression").length;
    return {
      ...exp,
      improvementTitle: improvement?.title || exp.improvementId,
      sourceSamples,
      casePreviews,
      focusCaseCount,
      regressionCaseCount,
      diagnosis: improvement?.diagnosis,
      diagnosisConfirmed: improvement?.diagnosisConfirmed,
    };
  });
}

export async function listPromptAbExperimentViews(): Promise<PromptAbExperimentView[]> {
  return enrichPromptAbExperiments(await listPromptAbExperiments());
}

export async function getPromptAbExperiment(id: string): Promise<PromptAbExperiment> {
  const found = (await readExperiments()).find((item) => item.id === id);
  if (!found) throw new RouteError(404, `未找到 Prompt A/B 实验：${id}`, { code: "PROMPT_AB_NOT_FOUND" });
  return found;
}

async function saveExperiment(next: PromptAbExperiment) {
  await ensureJsonFile<PromptAbExperiment[]>(FILE, []);
  await updateJson<PromptAbExperiment[]>(FILE, (current) => {
    const index = current.findIndex((item) => item.id === next.id);
    if (index === -1) return [next, ...current];
    const copy = [...current];
    copy[index] = next;
    return copy;
  });
  return next;
}

function isTerminalBatch(status: EvalBatch["status"]) {
  return status === "done" || status === "error" || status === "cancelled";
}

function kindFromTarget(target?: string): PromptAbKind {
  if (target === "planner") return "planner";
  if (target === "tool") return "tool";
  return "skill";
}

export async function refreshPromptAbStatus(experiment: PromptAbExperiment): Promise<PromptAbExperiment> {
  if (experiment.status === "promoted" || experiment.status === "discarded") return experiment;
  if (!experiment.controlBatchId || !experiment.treatmentBatchId) return experiment;

  const [control, treatment] = await Promise.all([
    getEvalBatch(experiment.controlBatchId),
    getEvalBatch(experiment.treatmentBatchId),
  ]);

  let status: PromptAbStatus = experiment.status;
  if (!isTerminalBatch(control.status) || !isTerminalBatch(treatment.status)) {
    status = "running";
  } else if (control.status === "done" && treatment.status === "done") {
    status = "ready";
  } else {
    status = "running";
  }

  if (status === experiment.status) return experiment;
  return saveExperiment({ ...experiment, status });
}

async function requireEnabledCases() {
  const enabledCases = (await listEvalCases()).filter((item) => item.enabled);
  if (enabledCases.length === 0) {
    throw new RouteError(400, "没有启用的测评用例，无法创建 Prompt A/B", { code: "PROMPT_AB_NO_CASES" });
  }
  return enabledCases;
}

export async function createPromptAbFromImprovement(improvementId: string) {
  const improvement = await getImprovement(improvementId);
  if (!improvement.draftPrompt?.trim()) {
    throw new RouteError(400, "请先生成草案，再送入 Prompt A/B", { code: "PROMPT_AB_NO_DRAFT" });
  }

  const kind = kindFromTarget(improvement.target);
  const focusCaseIds = await resolveFocusCaseIds(improvementId);
  const smokeIds = await resolveCaseIdsForSuite("ab-smoke").catch(() => [] as string[]);
  const caseSuite: PromptAbCaseSuite = smokeIds.length > 0 ? "ab-smoke" : "all";
  const suiteIds = smokeIds.length > 0 ? smokeIds : (await requireEnabledCases()).map((item) => item.id);
  const merged = mergeFocusAndSuite(focusCaseIds, suiteIds);
  const caseIds = merged.caseIds;
  if (caseIds.length === 0) {
    throw new RouteError(400, "没有可用的焦点或回归测评用例", { code: "PROMPT_AB_NO_CASES" });
  }
  const id = `pab_${randomUUID()}`;
  const noteExtra = `焦点 ${merged.focusCount} · 回归 ${merged.regressionCount}`;

  if (kind === "skill") {
    const skillId = baseSkillId(
      improvement.skillId || improvement.diagnosis?.skillId || "response-generator",
    );
    await getSkill(skillId);
    const treatment = await cloneSkillAsTemp(skillId, {
      systemPrompt: improvement.draftPrompt,
      changeNote: `改进 ${improvementId}`,
    });
    const created: PromptAbExperiment = {
      id,
      name: `Skill A/B：${improvement.title}`.slice(0, 80),
      kind: "skill",
      improvementId,
      controlSkillId: skillId,
      treatmentSkillId: treatment.id,
      draftPrompt: improvement.draftPrompt,
      status: "draft",
      caseSuite,
      caseIds,
      focusCaseIds: merged.focusCaseIds,
      createdAt: new Date().toISOString(),
      note: `对照=生产 Skill Prompt；实验=临时副本（评测覆盖同 id，不写生产）· ${noteExtra}`,
    };
    await saveExperiment(created);
    await updateImprovement(improvementId, {
      status: "in_progress",
      skillId,
      promptAbExperimentId: created.id,
    });
    return { experiment: created, treatmentSkill: treatment };
  }

  if (kind === "planner") {
    const path = `tmp/planner__pab_${randomUUID().slice(0, 8)}.md`;
    await writeSkillPrompt(path, improvement.draftPrompt);
    const created: PromptAbExperiment = {
      id,
      name: `Planner A/B：${improvement.title}`.slice(0, 80),
      kind: "planner",
      improvementId,
      treatmentPlannerPath: path,
      draftPrompt: improvement.draftPrompt,
      status: "draft",
      caseSuite,
      caseIds,
      focusCaseIds: merged.focusCaseIds,
      createdAt: new Date().toISOString(),
      note: `对照=生产 planner.md；实验=临时 Planner Prompt（评测覆盖，不写生产）· ${noteExtra}`,
    };
    await saveExperiment(created);
    await updateImprovement(improvementId, { status: "in_progress", promptAbExperimentId: created.id });
    return { experiment: created };
  }

  // tool
  const toolId =
    improvement.skillId ||
    improvement.diagnosis?.toolId ||
    inferDefaultToolId(improvement.note || improvement.title);
  const tool = await getTool(toolId);
  const created: PromptAbExperiment = {
    id,
    name: `Tool A/B：${improvement.title}`.slice(0, 80),
    kind: "tool",
    improvementId,
    controlToolId: toolId,
    draftPrompt: improvement.draftPrompt,
    draftDescription: improvement.draftPrompt,
    draftEnabled: tool.enabled,
    status: "draft",
    caseSuite,
    caseIds,
    focusCaseIds: merged.focusCaseIds,
    createdAt: new Date().toISOString(),
    note: `对照=生产 Tool 元数据；实验=覆盖 description/enabled（评测不写生产）· ${noteExtra}`,
  };
  await saveExperiment(created);
  await updateImprovement(improvementId, {
    status: "in_progress",
    skillId: toolId,
    promptAbExperimentId: created.id,
  });
  return { experiment: created };
}

function inferDefaultToolId(text: string) {
  if (/物流|快递|运单/.test(text)) return "query_logistics";
  if (/订单/.test(text)) return "query_orders";
  if (/券|优惠/.test(text)) return "query_coupons";
  if (/价格|算价|满减/.test(text)) return "calculate_price";
  if (/活动/.test(text)) return "query_activities";
  return "query_products";
}

export async function runPromptAbExperiment(id: string, input?: { caseSuite?: PromptAbCaseSuite }) {
  const experiment = await getPromptAbExperiment(id);
  if (experiment.status === "promoted") {
    throw new RouteError(400, "已晋升的实验不能重跑", { code: "PROMPT_AB_PROMOTED" });
  }
  if (experiment.status === "discarded") {
    throw new RouteError(400, "已废弃的实验不能重跑", { code: "PROMPT_AB_DISCARDED" });
  }

  const caseSuite: PromptAbCaseSuite = input?.caseSuite || experiment.caseSuite || "all";
  const focusCaseIds = await resolveFocusCaseIds(experiment.improvementId);
  const suiteIds = await resolveCaseIdsForSuite(caseSuite);
  const merged = mergeFocusAndSuite(focusCaseIds, suiteIds);
  const caseIds = merged.caseIds;
  const changeSuffix = `套件 ${caseSuite} · 焦点 ${merged.focusCount} · 回归 ${merged.regressionCount}`;

  const controlBatch = await createEvalBatch({
    name: `${experiment.name} · 对照 A`,
    versionLabel: `pab-control-${experiment.id.slice(0, 8)}`,
    changeNote: `离线 A/B 对照 · ${experiment.kind} · ${changeSuffix}`,
    caseIds,
    saveOnComplete: true,
    suppressEvalImprovements: true,
  });

  let treatmentBatch: EvalBatch;
  if (experiment.kind === "planner") {
    treatmentBatch = await createEvalBatch({
      name: `${experiment.name} · 实验 B`,
      versionLabel: `pab-treatment-${experiment.id.slice(0, 8)}`,
      changeNote: `Planner A/B 实验覆盖 planner prompt · ${changeSuffix}`,
      caseIds,
      saveOnComplete: true,
      suppressEvalImprovements: true,
      plannerPromptOverride: experiment.draftPrompt,
    });
  } else if (experiment.kind === "tool") {
    const toolId = experiment.controlToolId || "query_products";
    treatmentBatch = await createEvalBatch({
      name: `${experiment.name} · 实验 B`,
      versionLabel: `pab-treatment-${experiment.id.slice(0, 8)}`,
      changeNote: `Tool A/B 实验覆盖 ${toolId} · ${changeSuffix}`,
      caseIds,
      saveOnComplete: true,
      suppressEvalImprovements: true,
      toolOverrides: {
        [toolId]: {
          description: experiment.draftDescription || experiment.draftPrompt,
          enabled: experiment.draftEnabled ?? true,
        },
      },
    });
  } else {
    const controlSkillId = experiment.controlSkillId || "response-generator";
    const treatmentSkillId = experiment.treatmentSkillId;
    if (!treatmentSkillId) throw new RouteError(400, "缺少实验组 Skill", { code: "PROMPT_AB_NO_TREATMENT" });
    const treatment = await getSkill(treatmentSkillId);
    treatmentBatch = await createEvalBatch({
      name: `${experiment.name} · 实验 B`,
      versionLabel: `pab-treatment-${experiment.id.slice(0, 8)}`,
      changeNote: `Skill A/B 实验 · 覆盖 ${controlSkillId} ← ${treatmentSkillId} · ${changeSuffix}`,
      caseIds,
      saveOnComplete: true,
      suppressEvalImprovements: true,
      skillPromptOverrides: {
        [controlSkillId]: treatment.systemPrompt,
      },
    });
  }

  scheduleEvalBatch(controlBatch.id);
  scheduleEvalBatch(treatmentBatch.id);

  const next = await saveExperiment({
    ...experiment,
    status: "running",
    caseSuite,
    caseIds,
    focusCaseIds: merged.focusCaseIds,
    controlBatchId: controlBatch.id,
    treatmentBatchId: treatmentBatch.id,
  });

  return { experiment: next, controlBatch, treatmentBatch, caseSuite, focusCount: merged.focusCount, regressionCount: merged.regressionCount };
}

export async function getPromptAbDetail(id: string) {
  let experiment = await getPromptAbExperiment(id);
  experiment = await refreshPromptAbStatus(experiment);

  const controlBatch = experiment.controlBatchId ? await getEvalBatch(experiment.controlBatchId).catch(() => null) : null;
  const treatmentBatch = experiment.treatmentBatchId
    ? await getEvalBatch(experiment.treatmentBatchId).catch(() => null)
    : null;

  let compare: EvalBatchCompare | null = null;
  if (controlBatch?.status === "done" && treatmentBatch?.status === "done") {
    compare = compareEvalBatches(controlBatch, treatmentBatch);
  }

  const [view] = await enrichPromptAbExperiments([experiment]);
  return { experiment: view, controlBatch, treatmentBatch, compare };
}

async function cleanupTempPlanner(path?: string) {
  if (!path) return;
  try {
    await unlink(resolveProjectFile("skills", path));
  } catch {
    // ignore
  }
}

export async function promotePromptAbExperiment(id: string) {
  let experiment = await getPromptAbExperiment(id);
  experiment = await refreshPromptAbStatus(experiment);
  if (experiment.status === "promoted") {
    throw new RouteError(400, "实验已晋升", { code: "PROMPT_AB_ALREADY_PROMOTED" });
  }
  if (experiment.status === "discarded") {
    throw new RouteError(400, "已废弃实验不能晋升", { code: "PROMPT_AB_DISCARDED" });
  }
  if (experiment.status !== "ready") {
    throw new RouteError(400, "请先完成双批跑测并待状态为「可确认」后再晋升", { code: "PROMPT_AB_NOT_READY" });
  }

  const detail = await getPromptAbDetail(id);
  if (!detail.compare?.comparable) {
    throw new RouteError(400, "两批结果不可比，请检查用例集与评测条件后重跑", { code: "PROMPT_AB_NOT_COMPARABLE" });
  }

  let promoted: unknown = null;
  if (experiment.kind === "planner") {
    promoted = await updatePlanner({
      systemPrompt: experiment.draftPrompt,
      changeNote: `Planner A/B 人工晋升 ${experiment.id}（改进 ${experiment.improvementId}）`,
    });
    await cleanupTempPlanner(experiment.treatmentPlannerPath);
  } else if (experiment.kind === "tool") {
    const toolId = experiment.controlToolId || "query_products";
    promoted = await updateTool(toolId, {
      description: experiment.draftDescription || experiment.draftPrompt,
      enabled: experiment.draftEnabled,
      changeNote: `Tool A/B 人工晋升 ${experiment.id}（改进 ${experiment.improvementId}）`,
    });
  } else {
    const skillId = experiment.controlSkillId || "response-generator";
    promoted = await updateSkill(skillId, {
      systemPrompt: experiment.draftPrompt,
      changeNote: `Skill A/B 人工晋升 ${experiment.id}（改进 ${experiment.improvementId}）`,
    });
    if (experiment.treatmentSkillId) await removeTempSkill(experiment.treatmentSkillId);
  }

  await updateImprovement(experiment.improvementId, { status: "done" });

  const next = await saveExperiment({
    ...experiment,
    status: "promoted",
    promotedAt: new Date().toISOString(),
  });

  return { experiment: next, promoted, compare: detail.compare };
}

export async function discardPromptAbExperiment(id: string) {
  const experiment = await getPromptAbExperiment(id);
  if (experiment.status === "promoted") {
    throw new RouteError(400, "已晋升实验不能废弃", { code: "PROMPT_AB_PROMOTED" });
  }
  if (experiment.treatmentSkillId) await removeTempSkill(experiment.treatmentSkillId);
  await cleanupTempPlanner(experiment.treatmentPlannerPath);
  return saveExperiment({ ...experiment, status: "discarded" });
}

export async function deletePromptAbExperiment(id: string) {
  const experiment = await getPromptAbExperiment(id);
  if (experiment.treatmentSkillId) await removeTempSkill(experiment.treatmentSkillId);
  await cleanupTempPlanner(experiment.treatmentPlannerPath);

  await ensureJsonFile<PromptAbExperiment[]>(FILE, []);
  await updateJson<PromptAbExperiment[]>(FILE, (current) => current.filter((item) => item.id !== id));

  const improvement = await getImprovement(experiment.improvementId).catch(() => null);
  if (improvement?.promptAbExperimentId === id) {
    await updateImprovement(experiment.improvementId, { promptAbExperimentId: "" });
  }

  return { id, deleted: true as const };
}
