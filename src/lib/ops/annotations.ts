import "server-only";

import { randomUUID } from "node:crypto";

import { getRunRecord, listRunRecords } from "@/lib/agent/runs";
import { createEvalCase, listEvalCases } from "@/lib/eval/cases";
import { annotationLabelIssueHint, isBadCaseLabel } from "@/lib/ops/annotation-labels";
import {
  improvementNoteFromAnnotation,
  improvementTitleFromAnnotation,
} from "@/lib/ops/improvement-samples";
import { upsertImprovement } from "@/lib/ops/improvements";
import { inferIssueType, inferSkillId } from "@/lib/ops/issue";
import { readJson, updateJson } from "@/lib/store";
import type { Annotation, AnnotationScores, AnnotationStatus } from "@/lib/types";

type PromoteTarget = "improvement" | "eval";

function mergePromote(current: PromoteTarget[] | undefined, extra: PromoteTarget[] | undefined): PromoteTarget[] {
  return [...new Set([...(current ?? []), ...(extra ?? [])])];
}

function normalizeAnnotation(item: Annotation): Annotation {
  return {
    ...item,
    status: item.status ?? "pending",
    scores: item.scores ?? {},
    promotedTo: item.promotedTo ?? [],
  };
}

export async function listAnnotations(runId?: string): Promise<Annotation[]> {
  const items = await readJson<Annotation[]>("annotations.json");
  const normalized = items.map(normalizeAnnotation).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return runId ? normalized.filter((item) => item.runId === runId) : normalized;
}

export async function getAnnotation(id: string): Promise<Annotation> {
  const items = await listAnnotations();
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`未找到标注：${id}`);
  return found;
}

export async function createAnnotation(input: {
  runId: string;
  label: string;
  note?: string;
  createdBy?: string;
  status?: AnnotationStatus;
  scores?: AnnotationScores;
  goldReply?: string;
  promote?: Array<"improvement" | "eval">;
}): Promise<{ annotation: Annotation; improvementId?: string; evalCaseId?: string }> {
  const run = await getRunRecord(input.runId);
  if (!run) throw new Error(`未找到运行：${input.runId}`);
  const now = new Date().toISOString();
  const low = isLowScore(input.scores);
  const promote = mergePromote(input.promote, low ? ["improvement"] : []);
  const annotation: Annotation = {
    id: `an_${randomUUID()}`,
    runId: input.runId,
    label: input.label,
    note: input.note ?? "",
    createdBy: input.createdBy?.trim() || "运营",
    createdAt: now,
    updatedAt: now,
    status: input.status ?? "pending",
    scores: input.scores ?? {},
    goldReply: input.goldReply ?? "",
    promotedTo: promote,
  };
  await updateJson<Annotation[]>("annotations.json", (current) => [annotation, ...current]);
  const promoted = await maybePromote(annotation, run.question, promote);
  return { annotation, ...promoted };
}

export async function updateAnnotation(
  id: string,
  patch: Partial<Pick<Annotation, "label" | "note" | "status" | "scores" | "createdBy" | "goldReply" | "promotedTo">> & {
    promote?: PromoteTarget[];
  },
): Promise<{ annotation: Annotation; improvementId?: string; evalCaseId?: string }> {
  const current = await getAnnotation(id);
  const promote = patch.promote ?? patch.promotedTo;
  const next: Annotation = {
    ...current,
    label: patch.label ?? current.label,
    note: patch.note ?? current.note,
    status: patch.status ?? current.status,
    createdBy: patch.createdBy?.trim() || current.createdBy,
    scores: patch.scores ? { ...current.scores, ...patch.scores } : current.scores,
    goldReply: patch.goldReply ?? current.goldReply ?? "",
    promotedTo: promote ? mergePromote(current.promotedTo, promote) : current.promotedTo,
    updatedAt: new Date().toISOString(),
  };
  await updateJson<Annotation[]>("annotations.json", (items) => items.map((item) => (item.id === id ? next : item)));
  const run = await getRunRecord(next.runId);
  const promoted = await maybePromote(next, run?.question, promote);
  return { annotation: next, ...promoted };
}

function isLowScore(scores?: AnnotationScores) {
  const overall = scores?.overall ?? scores?.safety;
  return typeof overall === "number" && overall <= 2;
}

async function maybePromote(
  annotation: Annotation,
  question?: string,
  promote?: PromoteTarget[],
): Promise<{ improvementId?: string; evalCaseId?: string }> {
  const run = await getRunRecord(annotation.runId);
  const issueSeed = [annotation.label, annotationLabelIssueHint(annotation.label), annotation.note, question || ""]
    .filter(Boolean)
    .join(" ");
  const issueType = inferIssueType(issueSeed);
  const skillId = inferSkillId(run, issueType);
  const q = question || run?.question || "";
  let improvementId: string | undefined;
  let evalCaseId: string | undefined;

  if (promote?.includes("improvement")) {
    const improvement = await upsertImprovement({
      title: improvementTitleFromAnnotation(annotation.label, q),
      source: isBadCaseLabel(annotation.label) ? "bad_case" : "annotation",
      issueType,
      runId: annotation.runId,
      label: annotation.label,
      note: improvementNoteFromAnnotation({
        runId: annotation.runId,
        label: annotation.label,
        question: q,
        note: annotation.note,
      }),
    });
    improvementId = improvement.id;
  }
  if (promote?.includes("eval") && q) {
    const existing = await listEvalCases();
    const found = existing.find((item) => item.sourceRunId === annotation.runId && item.name.includes(annotation.label));
    if (found) {
      evalCaseId = found.id;
    } else {
      const created = await createEvalCase({
        name: improvementTitleFromAnnotation(annotation.label, q),
        question: q,
        expectedIntent: annotation.label,
        expectedBehavior: annotation.note || "按标注备注核对回复质量",
        expectedReply: annotation.goldReply || undefined,
        expectedSkillId: skillId,
        sourceRunId: annotation.runId,
        category: "annotation",
        tags: ["annotation"],
        evalDimension: "annotation",
      });
      evalCaseId = created.id;
    }
  }
  return { improvementId, evalCaseId };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export async function annotationsToCsv(items: Annotation[]) {
  const runs = await listRunRecords();
  const runMap = new Map(runs.map((item) => [item.id, item]));
  const header = [
    "id",
    "runId",
    "question",
    "reply",
    "label",
    "status",
    "note",
    "goldReply",
    "createdBy",
    "createdAt",
    "updatedAt",
    "promotedTo",
    "correctness",
    "relevance",
    "completeness",
    "safety",
    "tone",
    "overall",
  ];
  const rows = items.map((item) => {
    const run = runMap.get(item.runId);
    return [
      item.id,
      item.runId,
      run?.question ?? "",
      (run?.finalReply ?? "").replaceAll("\n", " "),
      item.label,
      item.status ?? "pending",
      item.note.replaceAll("\n", " "),
      (item.goldReply ?? "").replaceAll("\n", " "),
      item.createdBy,
      item.createdAt,
      item.updatedAt ?? item.createdAt,
      (item.promotedTo ?? []).join("|"),
      item.scores?.correctness ?? "",
      item.scores?.relevance ?? "",
      item.scores?.completeness ?? "",
      item.scores?.safety ?? "",
      item.scores?.tone ?? "",
      item.scores?.overall ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  return `\uFEFF${[header.join(","), ...rows].join("\n")}`;
}
