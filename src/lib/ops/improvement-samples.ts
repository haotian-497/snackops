import type { Improvement, ImprovementDiagnosis, PromptAbExperiment, RunRecord } from "@/lib/types";

export type ImprovementSamplePreview = {
  runId: string;
  question: string;
  replyPreview: string;
  emptyReply: boolean;
};

export type ImprovementWithSamples = Improvement & {
  samples: ImprovementSamplePreview[];
};

export type PromptAbFocusRole = "focus" | "regression";

export type PromptAbCasePreview = {
  caseId: string;
  name: string;
  question: string;
  focusRole?: PromptAbFocusRole;
};

export type PromptAbExperimentView = PromptAbExperiment & {
  improvementTitle: string;
  sourceSamples: ImprovementSamplePreview[];
  casePreviews: PromptAbCasePreview[];
  focusCaseCount?: number;
  regressionCaseCount?: number;
  /** 来自关联改进建议的链路归因 */
  diagnosis?: ImprovementDiagnosis;
  diagnosisConfirmed?: boolean;
};

function clip(text: string, max: number) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

export function samplePreviewFromRun(runId: string, run: RunRecord | null | undefined): ImprovementSamplePreview {
  const reply = (run?.finalReply || "").trim();
  return {
    runId,
    question: run?.question?.trim() || "(找不到对应 Run 的问题)",
    replyPreview: reply ? clip(reply, 72) : "(空回复)",
    emptyReply: !reply,
  };
}

export function enrichImprovementsWithSamples(
  items: Improvement[],
  runs: RunRecord[],
): ImprovementWithSamples[] {
  const map = new Map(runs.map((item) => [item.id, item]));
  return items.map((item) => ({
    ...item,
    samples: (item.sampleRunIds ?? []).map((runId) => samplePreviewFromRun(runId, map.get(runId))),
  }));
}

export function improvementTitleFromAnnotation(label: string, question?: string) {
  const short = question ? clip(question, 32) : "";
  return short ? `标注·${label}：${short}` : `标注转入：${label}`;
}

export function improvementNoteFromAnnotation(input: {
  runId: string;
  label: string;
  question?: string;
  note?: string;
}) {
  const parts = [
    `来源标注 · 标签 ${input.label}`,
    `Run ${input.runId}`,
    input.question ? `用户问题：${clip(input.question, 120)}` : "",
    input.note?.trim() || "",
  ].filter(Boolean);
  return parts.join("\n");
}
