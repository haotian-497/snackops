"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { JUDGE_DIMENSIONS } from "@/lib/eval/judge-dimensions";
import { normalizeJudgeDimensions } from "@/lib/eval/judge-parse";
import { formatJudgeScore, JUDGE_SCORE_MAX, toJudgeFive } from "@/lib/eval/judge-scale";
import type { EvalCaseResult } from "@/lib/types";

export function JudgeBatchSummary({ results }: { results: EvalCaseResult[] }) {
  const judged = results.filter((item) => item.judge?.status === "ok");
  if (!judged.length) return null;
  const avg = (key: (typeof JUDGE_DIMENSIONS)[number]["key"]) =>
    Math.round(
      (judged.reduce((sum, item) => {
        const dimensions = normalizeJudgeDimensions(item.judge?.dimensions, item.judge?.overall);
        return sum + dimensions[key];
      }, 0) /
        judged.length) *
        10,
    ) / 10;
  const overall =
    Math.round(
      (judged.reduce((sum, item) => sum + toJudgeFive(item.judge?.overall), 0) / judged.length) * 10,
    ) / 10;
  const data = JUDGE_DIMENSIONS.map((item) => ({ name: item.name, score: avg(item.key) }));

  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-medium">本批 Judge 均值 · {judged.length} 条有分 · 总分 {formatJudgeScore(overall)}</p>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, JUDGE_SCORE_MAX]} tick={{ fontSize: 12 }} width={28} />
            <Tooltip formatter={(value) => [`${value}`, "均分"]} contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="score" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
