"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ExecutionTimeline } from "@/components/agent/execution-timeline";
import { PlanPlanPanel } from "@/components/agent/plan-plan-panel";
import { PlanRiskSummary } from "@/components/agent/plan-risk-summary";
import { FeedbackBanner } from "@/components/feedback-banner";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { streamAgentRun } from "@/lib/agent/client";
import type { AgentEvent } from "@/lib/agent/events";
import { upsertAgentStep } from "@/lib/agent/plan-path";
import { runStatusLabel } from "@/lib/labels";
import type { AgentPlan, AgentStep, PlanValidationReport, RiskResult, RunRecord } from "@/lib/types";

const presets = [
  { label: "推荐", text: "给同事推荐两款解馋零食，不要太甜" },
  { label: "价格", text: "新人券 XINREN8 和中秋满减一起买 2 袋海带结加 2 袋软糖要多少钱" },
  { label: "物流", text: "帮我查订单 ord_20260906_10021 的物流到哪了" },
  { label: "诈骗", text: "有客服说我中奖了，让我转账验证才能兑奖" },
];

const WORKBENCH_SESSION_KEY = "snackops.agent-workbench.session.v1";

type WorkbenchSession = {
  question: string;
  phase: "idle" | "loading" | "success" | "error";
  message: string;
  run: RunRecord | null;
  plan: AgentPlan | null;
  validation: PlanValidationReport | null;
  riskResult: RiskResult | null;
  finalReply: string;
  steps: AgentStep[];
};

function readWorkbenchSession(): WorkbenchSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WORKBENCH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkbenchSession;
  } catch {
    return null;
  }
}

function writeWorkbenchSession(snapshot: WorkbenchSession) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WORKBENCH_SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    // quota / private mode
  }
}

function toneForStatus(status: RunRecord["status"]) {
  if (status === "succeeded") return "ok" as const;
  if (status === "failed") return "danger" as const;
  if (status === "handed_off") return "warn" as const;
  return "info" as const;
}

export function AgentWorkbench({
  initialRuns,
  initialQuestion,
}: {
  initialRuns: RunRecord[];
  initialQuestion?: string;
}) {
  const [question, setQuestion] = useState(initialQuestion?.trim() || presets[0].text);
  const [phase, setPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [validation, setValidation] = useState<PlanValidationReport | null>(null);
  const [riskResult, setRiskResult] = useState<RiskResult | null>(null);
  const [finalReply, setFinalReply] = useState("");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [runs, setRuns] = useState(initialRuns);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const session = readWorkbenchSession();
    if (session) {
      setQuestion(initialQuestion?.trim() || session.question || presets[0].text);
      setPhase(session.phase === "loading" ? "idle" : session.phase);
      setMessage(session.phase === "loading" ? "" : session.message || "");
      setRun(session.run);
      setPlan(session.plan);
      setValidation(session.validation);
      setRiskResult(session.riskResult);
      setFinalReply(session.finalReply || "");
      setSteps(session.steps ?? []);
      if (session.run) {
        setRuns((current) => [session.run!, ...current.filter((item) => item.id !== session.run!.id)]);
      }
    } else if (initialQuestion?.trim()) {
      setQuestion(initialQuestion.trim());
    }
    setHydrated(true);
  }, [initialQuestion]);

  useEffect(() => {
    if (!hydrated) return;
    writeWorkbenchSession({
      question,
      phase,
      message,
      run,
      plan,
      validation,
      riskResult,
      finalReply,
      steps,
    });
  }, [hydrated, question, phase, message, run, plan, validation, riskResult, finalReply, steps]);

  async function submit(source: "workbench" | "demo" = "workbench") {
    setPhase("loading");
    setMessage("正在走 Planner → Validator → Executor → risk-check…");
    setSteps([]);
    setRun(null);
    setPlan(null);
    setValidation(null);
    setRiskResult(null);
    setFinalReply("");
    try {
      await streamAgentRun({ question, source }, (event: AgentEvent) => {
        if (event.type === "plan") {
          setPlan(event.plan);
          setValidation(event.validation ?? null);
        }
        if (event.type === "step" && event.step) {
          setSteps((current) => upsertAgentStep(current, event.step!));
        }
        if (event.type === "risk") {
          setRiskResult(event.riskResult);
        }
        if (event.type === "reply") {
          setFinalReply(event.finalReply);
        }
        if (event.type === "done") {
          setRun(event.run);
          setPlan(event.run.plan);
          setValidation(event.run.validation ?? null);
          setRiskResult(event.run.riskResult);
          setFinalReply(event.run.finalReply || "");
          setSteps(event.run.steps);
          setRuns((current) => [event.run, ...current.filter((item) => item.id !== event.run.id)]);
        }
        if (event.type === "error") {
          setMessage(event.message);
        }
      });
      setPhase("success");
      setMessage("主链路已结束，结果已写入 RunRecord");
      toast.success("运行完成");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "运行失败");
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Agent 工作台</CardTitle>
          <CardDescription>
            问题会经过 Planner、计划校验、Tool/Skill 执行和 risk-check，不会短路出答案。下方可对照 Plan计划与逐步执行路径。离开手册再返回会保留本次运行结果。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((item) => (
              <Button key={item.label} type="button" size="sm" variant="outline" onClick={() => setQuestion(item.text)}>
                {item.label}
              </Button>
            ))}
          </div>
          <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-24" />
          <Button type="button" disabled={phase === "loading"} onClick={() => void submit()}>
            {phase === "loading" ? "运行中…" : "运行 Agent"}
          </Button>
          <FeedbackBanner phase={phase} message={message} />
        </CardContent>
      </Card>

      <PlanRiskSummary
        plan={plan}
        validation={validation}
        riskResult={riskResult}
        finalReply={finalReply}
        runId={run?.id}
        steps={steps}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <PlanPlanPanel plan={plan} steps={steps} />
        <ExecutionTimeline steps={steps} live={phase === "loading"} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>最近运行</CardTitle>
            <CardDescription>最近 8 条</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={"/runs" as "/"}>查看全部运行存档</Link>
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pb-2 font-medium">Run</th>
                <th className="pb-2 font-medium">问题</th>
                <th className="pb-2 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 8).map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="py-2">
                    <Link href={`/runs/${item.id}` as "/"}>{item.id}</Link>
                  </td>
                  <td className="max-w-xs truncate">{item.question}</td>
                  <td>
                    <StatusLabel text={runStatusLabel[item.status]} tone={toneForStatus(item.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
