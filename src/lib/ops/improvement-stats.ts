import type { Improvement } from "@/lib/types";

export type ImprovementFunnel = {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  withDraft: number;
  applied: number;
  draftRate: number;
  applyRate: number;
  bySource: Record<string, number>;
  byTarget: Record<string, number>;
};

export function improvementFunnel(items: Improvement[]): ImprovementFunnel {
  const bySource: Record<string, number> = {};
  const byTarget: Record<string, number> = {};
  let open = 0;
  let inProgress = 0;
  let done = 0;
  let withDraft = 0;
  let applied = 0;
  for (const item of items) {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
    const target = item.target || "skill";
    byTarget[target] = (byTarget[target] ?? 0) + 1;
    if (item.status === "open") open += 1;
    if (item.status === "in_progress") inProgress += 1;
    if (item.status === "done") done += 1;
    if (item.draftPrompt) withDraft += 1;
    if (item.appliedAt || item.status === "done") applied += 1;
  }
  const total = items.length;
  return {
    total,
    open,
    inProgress,
    done,
    withDraft,
    applied,
    draftRate: total ? Math.round((withDraft / total) * 1000) / 10 : 0,
    applyRate: total ? Math.round((applied / total) * 1000) / 10 : 0,
    bySource,
    byTarget,
  };
}
