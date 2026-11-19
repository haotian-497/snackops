"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

import { StatusLabel } from "@/components/status-label";
import { JUDGE_DIMENSIONS } from "@/lib/eval/judge-dimensions";
import { normalizeJudgeDimensions } from "@/lib/eval/judge-parse";
import { formatJudgeScore, JUDGE_SCORE_MAX, toJudgeFive } from "@/lib/eval/judge-scale";
import type { LlmJudgeResult } from "@/lib/types";

export function JudgeChart({ judge }: { judge?: LlmJudgeResult }) {
  if (!judge) {
    return <p className="text-xs text-muted-foreground">本次没有 Judge 结果。</p>;
  }
  if (judge.status !== "ok") {
    return (
      <div className="rounded-md border border-border p-3 text-sm">
        <p className="font-medium">LLM-as-Judge</p>
        <p className="text-xs text-muted-foreground">
          {judge.status === "error" ? `未出分，未伪造：${judge.error || "调用失败"}` : judge.rationale || "本次跳过 Judge"}
        </p>
      </div>
    );
  }

  const dimensions = normalizeJudgeDimensions(judge.dimensions);
  const data = JUDGE_DIMENSIONS.map((item) => ({ name: item.name, score: dimensions[item.key] }));

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">LLM-as-Judge</p>
        <StatusLabel
          text={judge.verdict || "ok"}
          tone={judge.verdict === "PASS" ? "ok" : judge.verdict === "REVIEW" ? "warn" : "danger"}
        />
        <span className="text-sm">总分 {formatJudgeScore(judge.overall)}</span>
        <span className="text-xs text-muted-foreground">
          {judge.provider}/{judge.model}
          {judge.fixture ? " · fixture" : ""}
        </span>
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid />
            <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, JUDGE_SCORE_MAX]} tick={{ fontSize: 10 }} />
            <Radar name="Judge" dataKey="score" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mb-2 grid grid-cols-3 gap-1 text-center text-xs sm:grid-cols-6">
        {data.map((item) => (
          <li key={item.name}>
            <span className="text-muted-foreground">{item.name}</span>
            <p className="font-medium">{toJudgeFive(item.score)}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm">{judge.rationale}</p>
      {judge.highlights.length ? <p className="text-xs text-muted-foreground">亮点：{judge.highlights.join("、")}</p> : null}
      {judge.issues.length ? <p className="text-xs text-red-800">问题：{judge.issues.join("、")}</p> : null}
    </div>
  );
}
