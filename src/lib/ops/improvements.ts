import "server-only";

import { randomUUID } from "node:crypto";

import { getRunRecord } from "@/lib/agent/runs";
import { loadPlannerPrompt } from "@/lib/agent/planner";
import { createEvalCase } from "@/lib/eval/cases";
import { completeLlm } from "@/lib/llm";
import { createAbTest } from "@/lib/ops/ab-tests";
import { RouteError } from "@/lib/http";
import { improvementFunnel, type ImprovementFunnel } from "@/lib/ops/improvement-stats";
import { inferIssueType, inferSkillId } from "@/lib/ops/issue";
import {
  analyzeRunRootCause,
  mergeDiagnosis,
  rootCauseClusterKey,
  subjectIdFromDiagnosis,
} from "@/lib/ops/root-cause";
import { getSkill } from "@/lib/skills/registry";
import { readJson, updateJson } from "@/lib/store";
import { getTool } from "@/lib/tools/registry";
import type { Improvement, ImprovementDiagnosis, ImprovementSource, ImprovementTarget, RunRecord } from "@/lib/types";

export type DraftMode = "rule" | "llm";
export type { ImprovementFunnel };
export { improvementFunnel };

export async function listImprovements(): Promise<Improvement[]> {
  return readJson<Improvement[]>("improvements.json");
}

export async function getImprovement(id: string): Promise<Improvement> {
  const items = await listImprovements();
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`未找到改进建议：${id}`);
  return found;
}

export async function upsertImprovement(input: {
  title: string;
  source: ImprovementSource;
  owner?: string;
  issueType: string;
  runId?: string;
  skillId?: string;
  note?: string;
  target?: ImprovementTarget;
  label?: string;
  diagnosis?: ImprovementDiagnosis;
}): Promise<Improvement> {
  const run = input.runId ? await getRunRecord(input.runId) : null;
  const diagnosis =
    input.diagnosis ??
    analyzeRunRootCause({
      run,
      issueType: input.issueType,
      label: input.label,
      note: input.note,
    });
  const cluster = rootCauseClusterKey(input.source, diagnosis);
  const target = input.target ?? diagnosis.target;
  const subjectId =
    input.skillId ||
    subjectIdFromDiagnosis(diagnosis) ||
    (target === "skill" ? inferSkillId(run, input.issueType) : undefined);
  const now = new Date().toISOString();

  return updateJson<Improvement[]>("improvements.json", (current) => {
    // 同一 Run 已在某未完成单：只更新该单（可跨 cluster 纠正）
    if (input.runId) {
      const sameRun = current.find(
        (item) => item.status !== "done" && (item.sampleRunIds ?? []).includes(input.runId!),
      );
      if (sameRun) {
        const nextDiagnosis = sameRun.diagnosisConfirmed
          ? sameRun.diagnosis
          : mergeDiagnosis(sameRun.diagnosis, diagnosis);
        const sampleFocus = syncSampleFocus(sameRun, input.runId, now);
        const next: Improvement = {
          ...sameRun,
          title: input.title || sameRun.title,
          cluster,
          clusterMethod: "root_cause",
          target: input.target ?? sameRun.target ?? nextDiagnosis?.target ?? target,
          skillId: input.skillId ?? sameRun.skillId ?? subjectIdFromDiagnosis(nextDiagnosis!) ?? subjectId,
          diagnosis: nextDiagnosis,
          note: input.note?.trim()
            ? [sameRun.note, input.note].filter(Boolean).join("\n\n")
            : sameRun.note,
          sampleFocus,
          sampleRunIds: sampleFocus.map((item) => item.runId),
        };
        return current.map((item) => (item.id === sameRun.id ? next : item));
      }
    }

    // 同根因未完成单：归并焦点样本
    const existing = current.find((item) => item.cluster === cluster && item.status !== "done");
    if (existing) {
      const nextDiagnosis = existing.diagnosisConfirmed
        ? existing.diagnosis
        : mergeDiagnosis(existing.diagnosis, diagnosis);
      const sampleFocus = input.runId
        ? syncSampleFocus(existing, input.runId, now)
        : normalizeSampleFocus(existing);
      const next: Improvement = {
        ...existing,
        title: input.runId && input.title ? input.title : existing.title,
        clusterMethod: "root_cause",
        target: input.target ?? existing.target ?? nextDiagnosis?.target ?? target,
        skillId: input.skillId ?? existing.skillId ?? subjectIdFromDiagnosis(nextDiagnosis!) ?? subjectId,
        diagnosis: nextDiagnosis,
        note: [existing.note, input.note].filter(Boolean).join("\n\n"),
        sampleFocus,
        sampleRunIds: sampleFocus.map((item) => item.runId),
      };
      return current.map((item) => (item.id === existing.id ? next : item));
    }

    const sampleFocus = input.runId
      ? [{ runId: input.runId, addedAt: now }]
      : ([] as Improvement["sampleFocus"]);
    const created: Improvement = {
      id: `imp_${randomUUID()}`,
      title: input.title,
      source: input.source,
      status: "open",
      owner: input.owner || "运营",
      cluster,
      clusterMethod: "root_cause",
      target,
      sampleRunIds: sampleFocus?.map((item) => item.runId) ?? [],
      sampleFocus,
      skillId: subjectId,
      createdAt: now,
      note: input.note,
      diagnosis,
      diagnosisConfirmed: false,
    };
    return [created, ...current];
  }).then((items) => {
    if (input.runId) {
      const byRun = items.find(
        (item) => item.status !== "done" && (item.sampleRunIds ?? []).includes(input.runId!),
      );
      if (byRun) return byRun;
    }
    const byCluster = items.find((item) => item.cluster === cluster && item.status !== "done");
    return byCluster ?? items[0]!;
  });
}

function normalizeSampleFocus(item: Improvement): NonNullable<Improvement["sampleFocus"]> {
  if (item.sampleFocus?.length) return [...item.sampleFocus];
  return (item.sampleRunIds ?? []).map((runId) => ({
    runId,
    addedAt: item.createdAt || new Date().toISOString(),
  }));
}

function syncSampleFocus(
  item: Improvement,
  runId: string,
  addedAt: string,
): NonNullable<Improvement["sampleFocus"]> {
  const current = normalizeSampleFocus(item);
  if (current.some((entry) => entry.runId === runId)) return current;
  return [...current, { runId, addedAt }];
}

export async function updateImprovement(
  id: string,
  patch: Partial<
    Pick<
      Improvement,
      | "owner"
      | "status"
      | "note"
      | "skillId"
      | "title"
      | "target"
      | "promptAbExperimentId"
      | "diagnosis"
      | "diagnosisConfirmed"
      | "sampleFocus"
      | "sampleRunIds"
    >
  >,
): Promise<Improvement> {
  const items = await updateJson<Improvement[]>("improvements.json", (current) => {
    if (!current.some((item) => item.id === id)) throw new Error(`未找到改进建议：${id}`);
    return current.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      if (patch.diagnosisConfirmed === true && next.diagnosis) {
        next.diagnosis = {
          ...next.diagnosis,
          needsConfirm: false,
          summary: next.diagnosis.summary.replace(/（待确认）/g, "") || next.diagnosis.summary,
        };
      }
      if (patch.target !== undefined || patch.skillId !== undefined) {
        next.diagnosisConfirmed = patch.diagnosisConfirmed ?? true;
        if (next.diagnosis && (patch.target || patch.skillId)) {
          const requested = patch.target ?? next.diagnosis.target;
          const target: ImprovementDiagnosis["target"] =
            requested === "eval" ? next.diagnosis.target : requested;
          next.diagnosis = {
            ...next.diagnosis,
            target,
            skillId: target === "skill" ? patch.skillId ?? next.diagnosis.skillId : next.diagnosis.skillId,
            toolId: target === "tool" ? patch.skillId ?? next.diagnosis.toolId : next.diagnosis.toolId,
            needsConfirm: false,
            summary:
              target === "planner"
                ? "已确认 · Planner"
                : target === "tool"
                  ? `已确认 · Tool · ${patch.skillId ?? next.diagnosis.toolId ?? ""}`
                  : `已确认 · Skill · ${patch.skillId ?? next.diagnosis.skillId ?? ""}`,
            rootCauseKey:
              target === "planner"
                ? "planner"
                : target === "tool"
                  ? `tool:${patch.skillId ?? next.diagnosis.toolId ?? "unknown"}`
                  : `skill:${patch.skillId ?? next.diagnosis.skillId ?? "unknown"}`,
          };
          next.cluster = `${next.source}:${next.diagnosis.rootCauseKey}`;
          next.clusterMethod = "root_cause";
        }
      }
      if (patch.status === "done" && !next.appliedAt) {
        next.appliedAt = new Date().toISOString();
      }
      return next;
    });
  });
  return items.find((item) => item.id === id)!;
}

export async function deleteImprovement(id: string) {
  const current = await getImprovement(id);
  await updateJson<Improvement[]>("improvements.json", (items) => {
    if (!items.some((item) => item.id === id)) throw new Error(`未找到改进建议：${id}`);
    return items.filter((item) => item.id !== id);
  });
  return { id, deleted: true as const, promptAbExperimentId: current.promptAbExperimentId };
}

export async function splitImprovement(improvementId: string, runIds: string[]): Promise<{ kept: Improvement; split: Improvement }> {
  const unique = [...new Set(runIds.filter(Boolean))];
  if (unique.length === 0) throw new Error("请选择要拆出的样本 Run");

  let kept!: Improvement;
  let split!: Improvement;
  await updateJson<Improvement[]>("improvements.json", (current) => {
    const existing = current.find((item) => item.id === improvementId);
    if (!existing) throw new Error(`未找到改进建议：${improvementId}`);
    const focus = normalizeSampleFocus(existing);
    const moveSet = new Set(unique.filter((id) => focus.some((item) => item.runId === id)));
    if (moveSet.size === 0) throw new Error("所选 Run 不在当前样本中");
    const remainFocus = focus.filter((item) => !moveSet.has(item.runId));
    const moveFocus = focus.filter((item) => moveSet.has(item.runId));
    const now = new Date().toISOString();
    kept = {
      ...existing,
      sampleFocus: remainFocus,
      sampleRunIds: remainFocus.map((item) => item.runId),
      note: existing.note,
    };
    split = {
      id: `imp_${randomUUID()}`,
      title: `${existing.title}（拆分）`,
      source: existing.source,
      status: "open",
      owner: existing.owner,
      cluster: `${existing.cluster || "split"}:split_${unique.slice(0, 1).join("")}`,
      clusterMethod: existing.clusterMethod || "root_cause",
      target: existing.target,
      sampleFocus: moveFocus,
      sampleRunIds: moveFocus.map((item) => item.runId),
      skillId: existing.skillId,
      createdAt: now,
      note: `自 ${existing.id} 拆分：${[...moveSet].join("、")}`,
      diagnosis: existing.diagnosis,
      diagnosisConfirmed: existing.diagnosisConfirmed,
    };
    return [split, ...current.map((item) => (item.id === improvementId ? kept : item))];
  });
  return { kept, split };
}

function buildRulePromptDraft(improvement: Improvement, skillPrompt: string, runs: RunRecord[]) {
  const sampleNotes = runs.map((item) => `- Run ${item.id}：${item.question}`).join("\n");
  return [
    skillPrompt.trimEnd(),
    "",
    "## 运营改进草案（规则生成，未自动覆盖生产）",
    "本段由规则聚类生成，不是模型自动分析，也尚未写入生产 Prompt。",
    `聚类：${improvement.cluster || "未分组"}`,
    `方向：${improvement.target || "skill"}`,
    improvement.note ? `问题摘要：${improvement.note}` : "",
    sampleNotes ? `样本：\n${sampleNotes}` : "",
    "约束：先核验系统事实，再回答；不要提前承诺补偿、中奖或未查询到的价格。",
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildLlmPromptDraft(improvement: Improvement, skillPrompt: string, runs: RunRecord[]) {
  const samples = runs
    .slice(0, 5)
    .map((item) => `Q: ${item.question}\nA: ${item.finalReply || "(无回复)"}`)
    .join("\n---\n");
  const response = await completeLlm({
    purpose: "rewrite",
    messages: [
      {
        role: "system",
        content:
          "你是客服运营改进助手。基于问题摘要与样本，给出可追加到现有 system prompt 的「改进段落」，不要删改已有内容。只输出改进段落正文，不要 Markdown 标题以外的解释。",
      },
      {
        role: "user",
        content: [
          `现有 Prompt 摘要（前 800 字）：\n${skillPrompt.slice(0, 800)}`,
          `改进标题：${improvement.title}`,
          `聚类：${improvement.cluster || ""}`,
          `备注：${improvement.note || ""}`,
          samples ? `样本：\n${samples}` : "无样本",
        ].join("\n\n"),
      },
    ],
    temperature: 0.2,
    maxTokens: 600,
  });
  const addition = (response.content || "").trim();
  if (!addition) throw new Error("LLM 未返回改进段落");
  return [
    skillPrompt.trimEnd(),
    "",
    "## 运营改进草案（LLM 辅助，未自动覆盖生产）",
    addition,
    "",
    "约束：先核验系统事实，再回答；不要提前承诺补偿、中奖或未查询到的价格。",
  ].join("\n");
}

function inferToolIdFromRuns(runs: RunRecord[], text: string) {
  const fromPlan = runs.flatMap((item) => item.plan?.selectedTools ?? [])[0];
  if (fromPlan) return fromPlan;
  if (/物流|快递|运单/.test(text)) return "query_logistics";
  if (/订单/.test(text)) return "query_orders";
  if (/券|优惠/.test(text)) return "query_coupons";
  if (/价格|算价|满减/.test(text)) return "calculate_price";
  if (/活动/.test(text)) return "query_activities";
  return "query_products";
}

function buildPlannerDraft(improvement: Improvement, plannerPrompt: string, runs: RunRecord[]) {
  const sampleNotes = runs.map((item) => `- Run ${item.id}：${item.question}`).join("\n");
  return [
    plannerPrompt.trimEnd(),
    "",
    "## 运营改进草案（Planner，未自动覆盖生产）",
    `聚类：${improvement.cluster || "未分组"}`,
    improvement.note ? `问题摘要：${improvement.note}` : "",
    sampleNotes ? `样本：\n${sampleNotes}` : "",
    "约束：优先选择能核验事实的 Tool；风险场景必须含 risk-check 或 handoff。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildToolDescriptionDraft(improvement: Improvement, toolDescription: string, runs: RunRecord[]) {
  const sampleNotes = runs.map((item) => `- Run ${item.id}：${item.question}`).join("\n");
  return [
    toolDescription.trimEnd(),
    "",
    "【运营改进补充】",
    improvement.note || improvement.title,
    sampleNotes ? `相关样本：${runs.map((item) => item.id).join("、")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generatePromptDraft(
  improvementId: string,
  skillId?: string,
  mode: DraftMode = "rule",
) {
  const improvement = await getImprovement(improvementId);
  const runs = (
    await Promise.all((improvement.sampleRunIds ?? []).map((id) => getRunRecord(id)))
  ).filter((item): item is RunRecord => Boolean(item));

  const target = improvement.target || "skill";

  if (target === "planner") {
    const current = await loadPlannerPrompt();
    let draft = buildPlannerDraft(improvement, current, runs);
    let usedMode: DraftMode = "rule";
    if (mode === "llm") {
      try {
        draft = await buildLlmPromptDraft(improvement, current, runs);
        usedMode = "llm";
      } catch {
        usedMode = "rule";
      }
    }
    const saved = await updateJson<Improvement[]>("improvements.json", (currentItems) =>
      currentItems.map((item) =>
        item.id === improvementId
          ? {
              ...item,
              draftPrompt: draft,
              status: item.status === "done" ? item.status : "in_progress",
            }
          : item,
      ),
    );
    return {
      improvement: saved.find((item) => item.id === improvementId)!,
      skillId: "",
      currentPrompt: current,
      draftPrompt: draft,
      kind: "planner" as const,
      mode: usedMode,
      applied: false,
    };
  }

  if (target === "tool") {
    const toolId =
      skillId ||
      improvement.skillId ||
      inferToolIdFromRuns(runs, [improvement.note, improvement.title, improvement.cluster].filter(Boolean).join(" "));
    const tool = await getTool(toolId);
    const draft = buildToolDescriptionDraft(improvement, tool.description, runs);
    const saved = await updateJson<Improvement[]>("improvements.json", (currentItems) =>
      currentItems.map((item) =>
        item.id === improvementId
          ? {
              ...item,
              skillId: toolId,
              draftPrompt: draft,
              status: item.status === "done" ? item.status : "in_progress",
            }
          : item,
      ),
    );
    return {
      improvement: saved.find((item) => item.id === improvementId)!,
      skillId: toolId,
      currentPrompt: tool.description,
      draftPrompt: draft,
      kind: "tool" as const,
      mode: "rule" as DraftMode,
      applied: false,
    };
  }

  const targetSkillId = skillId || improvement.skillId || "response-generator";
  const skill = await getSkill(targetSkillId);
  let draft: string;
  let usedMode: DraftMode = "rule";
  if (mode === "llm") {
    try {
      draft = await buildLlmPromptDraft(improvement, skill.systemPrompt, runs);
      usedMode = "llm";
    } catch {
      draft = buildRulePromptDraft(improvement, skill.systemPrompt, runs);
      usedMode = "rule";
    }
  } else {
    draft = buildRulePromptDraft(improvement, skill.systemPrompt, runs);
  }

  const saved = await updateJson<Improvement[]>("improvements.json", (current) =>
    current.map((item) =>
      item.id === improvementId
        ? {
            ...item,
            skillId: targetSkillId,
            draftPrompt: draft,
            status: item.status === "done" ? item.status : "in_progress",
          }
        : item,
    ),
  );
  return {
    improvement: saved.find((item) => item.id === improvementId)!,
    skillId: targetSkillId,
    currentPrompt: skill.systemPrompt,
    draftPrompt: draft,
    kind: "skill" as const,
    mode: usedMode,
    applied: false,
  };
}

export async function applyPromptDraft(improvementId: string, skillId?: string) {
  const improvement = await getImprovement(improvementId);
  const target = improvement.target || "skill";

  if (target === "skill" || target === "eval" || target === "planner" || target === "tool") {
    throw new RouteError(
      400,
      `${target === "skill" || target === "eval" ? "Skill" : target === "planner" ? "Planner" : "Tool"} 草案须经 Prompt A/B 评测并人工确认后才能写入生产，请打开「Prompt A/B」页`,
      { code: "PROMPT_AB_REQUIRED" },
    );
  }

  throw new Error(`不支持的改进目标：${target}`);
}

/** 仅关闭工单备注，不写生产配置（无草案或明确放弃实验时） */
export async function closeImprovementTicket(improvementId: string) {
  const items = await updateJson<Improvement[]>("improvements.json", (current) =>
    current.map((item) =>
      item.id === improvementId ? { ...item, status: "done", appliedAt: new Date().toISOString() } : item,
    ),
  );
  return items.find((item) => item.id === improvementId)!;
}

export async function promoteImprovementToEval(improvementId: string) {
  const improvement = await getImprovement(improvementId);
  const runIds = improvement.sampleRunIds ?? [];
  if (runIds.length === 0) throw new Error("没有可转入的样本 Run");
  const created = [];
  for (const runId of runIds.slice(0, 8)) {
    const run = await getRunRecord(runId);
    if (!run) continue;
    created.push(
      await createEvalCase({
        name: `改进转入：${improvement.title}`.slice(0, 40),
        question: run.question,
        expectedBehavior: improvement.note || "按改进建议核对回复质量",
        expectedSkillId: improvement.skillId,
        sourceRunId: runId,
        category: "improvement",
        tags: ["improvement", improvement.source],
        evalDimension: "improvement",
      }),
    );
  }
  if (created.length === 0) throw new Error("样本 Run 均不存在，无法转入测评集");
  return { cases: created, count: created.length };
}

export async function suggestAbFromImprovement(improvementId: string) {
  const improvement = await getImprovement(improvementId);
  const skillId = improvement.skillId || "response-generator";
  const ab = await createAbTest({
    name: `改进验证：${improvement.title}`.slice(0, 40),
    controlSkillId: skillId,
    treatmentSkillId: skillId,
    trafficPct: 10,
    status: "draft",
  });
  return {
    abTest: ab,
    message: "已创建草稿 A/B；对照组与实验组暂为同一 Skill，请在运营台改实验组后再开跑",
  };
}

export function issueTypeFromText(text: string) {
  return inferIssueType(text);
}
