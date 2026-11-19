import "server-only";

import { getRunRecord, listRunRecords } from "@/lib/agent/runs";
import { listEvalCases } from "@/lib/eval/cases";
import { listAnnotations } from "@/lib/ops/annotations";
import { listImprovements } from "@/lib/ops/improvements";
import { listPromptAbExperiments } from "@/lib/ops/prompt-ab";
import { listRatings } from "@/lib/ops/ratings";
import type {
  Annotation,
  EvalCase,
  Improvement,
  PromptAbExperiment,
  Rating,
  RunRecord,
} from "@/lib/types";

export type RunHubDispositionStep = {
  id: "rated" | "annotated" | "improved" | "eval_case" | "prompt_ab";
  label: string;
  done: boolean;
  href: string;
  detail: string;
};

export type RunHubBundle = {
  run: RunRecord;
  ratings: Rating[];
  annotations: Annotation[];
  improvements: Improvement[];
  evalCases: EvalCase[];
  promptAbs: PromptAbExperiment[];
  relatedRuns: Array<Pick<RunRecord, "id" | "status" | "question" | "createdAt" | "finalReply">>;
  disposition: RunHubDispositionStep[];
};

function runInImprovement(item: Improvement, runId: string) {
  if ((item.sampleRunIds ?? []).includes(runId)) return true;
  return (item.sampleFocus ?? []).some((focus) => focus.runId === runId);
}

export async function loadRunHub(runId: string): Promise<RunHubBundle | null> {
  const run = await getRunRecord(runId);
  if (!run) return null;

  const [ratingsAll, annotations, improvementsAll, casesAll, experiments, runsAll] = await Promise.all([
    listRatings(),
    listAnnotations(runId),
    listImprovements(),
    listEvalCases(),
    listPromptAbExperiments(),
    listRunRecords(),
  ]);

  const ratings = ratingsAll.filter((item) => item.runId === runId);
  const improvements = improvementsAll.filter((item) => runInImprovement(item, runId));
  const evalCases = casesAll.filter((item) => item.sourceRunId === runId);
  const improvementIds = new Set(improvements.map((item) => item.id));
  const focusCaseIds = new Set(
    improvements.flatMap((item) => (item.sampleFocus ?? []).map((focus) => focus.evalCaseId).filter(Boolean) as string[]),
  );
  for (const item of evalCases) focusCaseIds.add(item.id);

  const promptAbs = experiments.filter(
    (item) =>
      improvementIds.has(item.improvementId) ||
      (item.focusCaseIds ?? []).some((caseId) => focusCaseIds.has(caseId)) ||
      item.caseIds.some((caseId) => focusCaseIds.has(caseId) && evalCases.some((ec) => ec.id === caseId)),
  );

  const relatedRuns = runsAll
    .filter(
      (item) =>
        item.id !== runId &&
        (item.conversationId === run.conversationId || item.question.trim() === run.question.trim()),
    )
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      status: item.status,
      question: item.question,
      createdAt: item.createdAt,
      finalReply: item.finalReply,
    }));

  const latestImprovement = improvements[0];
  const disposition: RunHubDispositionStep[] = [
    {
      id: "rated",
      label: "评分",
      done: ratings.length > 0,
      href: "/ops/ratings",
      detail: ratings.length ? `已有 ${ratings.length} 条` : "尚未评分",
    },
    {
      id: "annotated",
      label: "标注",
      done: annotations.length > 0,
      href: `/ops/annotate?run=${encodeURIComponent(runId)}`,
      detail: annotations.length ? `已有 ${annotations.length} 条` : "尚未标注",
    },
    {
      id: "improved",
      label: "改进单",
      done: improvements.length > 0,
      href: latestImprovement ? `/ops/improvements?id=${encodeURIComponent(latestImprovement.id)}` : "/ops/improvements",
      detail: improvements.length ? improvements.map((item) => item.title).join("；") : "未挂入改进",
    },
    {
      id: "eval_case",
      label: "测评用例",
      done: evalCases.length > 0,
      href: "/ops/center",
      detail: evalCases.length ? evalCases.map((item) => item.name || item.id).join("；") : "未转入测评集",
    },
    {
      id: "prompt_ab",
      label: "Prompt A/B",
      done: promptAbs.length > 0,
      href: promptAbs[0] ? `/ops/prompt-ab?id=${encodeURIComponent(promptAbs[0].id)}` : "/ops/prompt-ab",
      detail: promptAbs.length ? promptAbs.map((item) => item.name).join("；") : "未关联 A/B 实验",
    },
  ];

  return {
    run,
    ratings,
    annotations,
    improvements,
    evalCases,
    promptAbs,
    relatedRuns,
    disposition,
  };
}
