"use client";

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { streamAgentRun } from "@/lib/agent/client";
import { upsertAgentStep } from "@/lib/agent/plan-path";
import { EmptyState } from "@/components/empty-state";
import { FeedbackBanner } from "@/components/feedback-banner";
import { JudgeChart } from "@/components/judge-chart";
import { RunTrace } from "@/components/run-trace";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/hooks/use-action-state";
import { cn } from "@/lib/utils";
import type { AgentStep, EvalCase, EvalScoreResult, KeywordGroup, RunRecord } from "@/lib/types";

type ApiOk<T> = { ok?: boolean; message?: string } & T;

async function api<T>(url: string, init?: RequestInit): Promise<ApiOk<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await response.json()) as ApiOk<T>;
  if (!response.ok || json.ok === false) throw new Error(json.message || "请求失败");
  return json;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function asKeywordGroups(value: EvalCase["expectedKeywords"]): KeywordGroup[] {
  if (!value?.length) return [];
  return value.map((item) =>
    typeof item === "string" ? { op: "and" as const, terms: [item] } : { op: item.op, terms: item.terms },
  );
}

function keywordSummary(value: EvalCase["expectedKeywords"]) {
  const groups = asKeywordGroups(value);
  if (!groups.length) return "无";
  return groups
    .map((group) => group.terms.join(group.op === "or" ? " / " : "、"))
    .join("；");
}

function flattenKeywordText(value: EvalCase["expectedKeywords"]) {
  return asKeywordGroups(value)
    .flatMap((group) => group.terms)
    .join("、");
}

function parseList(value: string) {
  return value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyDraft() {
  return {
    id: "",
    name: "",
    question: "",
    keyPoint: "",
    keywordsText: "",
    keywordsJson: "[]",
    forbidden: "",
    category: "custom",
    evalDimension: "reply",
    difficulty: "medium",
    riskLevel: "low",
    expectedPrice: "",
    expectedReply: "",
    expectedSkillId: "",
    requiredCapabilities: "",
    forbiddenCapabilities: "",
    tags: "",
    llmJudgePrompt: "",
    expectInputRisk: false,
    expectReplySafe: true,
    enabled: true,
  };
}

export function EvalWorkbench({
  initialCases,
}: {
  initialCases: EvalCase[];
}) {
  const [cases, setCases] = useState(initialCases);
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [dimension, setDimension] = useState("");
  const [tag, setTag] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [adding, setAdding] = useState(false);
  const selected = cases.find((item) => item.id === selectedId);
  const [draft, setDraft] = useState(emptyDraft);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [score, setScore] = useState<EvalScoreResult | null>(null);
  const [runError, setRunError] = useState("");
  const crudAction = useActionFeedback();
  const runAction = useActionFeedback();

  const filtered = useMemo(
    () =>
      cases.filter((item) => {
        if (!showDisabled && !item.enabled) return false;
        if (category && item.category !== category) return false;
        if (difficulty && item.difficulty !== difficulty) return false;
        if (riskLevel && item.riskLevel !== riskLevel) return false;
        if (dimension && item.evalDimension !== dimension) return false;
        if (tag && !(item.tags ?? []).includes(tag)) return false;
        return true;
      }),
    [cases, category, difficulty, dimension, riskLevel, showDisabled, tag],
  );

  function applyCase(item: EvalCase) {
    setSelectedId(item.id);
    setAdding(false);
    setDraft({
      id: item.id,
      name: item.name,
      question: item.question,
      keyPoint: item.expectedBehavior,
      keywordsText: flattenKeywordText(item.expectedKeywords),
      keywordsJson: JSON.stringify(item.expectedKeywords ?? [], null, 2),
      forbidden: (item.forbiddenWords ?? []).join("，"),
      category: item.category || "custom",
      evalDimension: item.evalDimension || "reply",
      difficulty: item.difficulty || "medium",
      riskLevel: item.riskLevel || "low",
      expectedPrice: item.expectedPrice != null ? String(item.expectedPrice) : "",
      expectedReply: item.expectedReply || "",
      expectedSkillId: item.expectedSkillId || "",
      requiredCapabilities: (item.requiredCapabilities ?? []).join("，"),
      forbiddenCapabilities: (item.forbiddenCapabilities ?? []).join("，"),
      tags: (item.tags ?? []).join("，"),
      llmJudgePrompt: item.llmJudgePrompt || "",
      expectInputRisk: item.expectInputRisk === true,
      expectReplySafe: item.expectReplySafe !== false,
      enabled: item.enabled !== false,
    });
    setScore(null);
    setRun(null);
    setSteps([]);
    setRunError("");
  }

  function draftPayload() {
    const expectedKeywords = parsedKeywords();
    const forbiddenWords = parseList(draft.forbidden);
    const expectedPriceRaw = draft.expectedPrice.trim();
    const expectedPrice = expectedPriceRaw ? Number(expectedPriceRaw) : undefined;
    if (expectedPriceRaw && !Number.isFinite(expectedPrice)) throw new Error("期望价格必须是数字");
    return {
      name: draft.name.trim(),
      question: draft.question.trim(),
      expectedBehavior: draft.keyPoint.trim() || "按业务规则回答",
      expectedKeywords,
      forbiddenWords,
      category: draft.category.trim() || "custom",
      evalDimension: draft.evalDimension.trim() || "reply",
      difficulty: draft.difficulty as EvalCase["difficulty"],
      riskLevel: draft.riskLevel as EvalCase["riskLevel"],
      expectedPrice,
      expectedReply: draft.expectedReply.trim() || undefined,
      expectedSkillId: draft.expectedSkillId.trim() || undefined,
      requiredCapabilities: parseList(draft.requiredCapabilities),
      forbiddenCapabilities: parseList(draft.forbiddenCapabilities),
      tags: parseList(draft.tags),
      llmJudgePrompt: draft.llmJudgePrompt.trim() || undefined,
      expectInputRisk: draft.expectInputRisk || undefined,
      expectReplySafe: draft.expectReplySafe,
      enabled: draft.enabled,
    };
  }

  function closeDetail() {
    setSelectedId("");
    setAdding(false);
    setDraft(emptyDraft());
    setScore(null);
    setRun(null);
    setSteps([]);
    setRunError("");
  }

  function openEdit(item: EvalCase) {
    if (selectedId === item.id && !adding) {
      closeDetail();
      return;
    }
    applyCase(item);
  }

  function startCreate() {
    if (adding) {
      closeDetail();
      return;
    }
    setSelectedId("");
    setAdding(true);
    setDraft(emptyDraft());
    setScore(null);
    setRun(null);
    setSteps([]);
    setRunError("");
  }

  async function reload() {
    const all = await api<{ cases: EvalCase[] }>("/api/eval/cases");
    setCases(all.cases);
    return all.cases.filter((item) => showDisabled || item.enabled);
  }

  function parsedKeywords() {
    const fromJson = JSON.parse(draft.keywordsJson || "[]") as EvalCase["expectedKeywords"];
    if (Array.isArray(fromJson) && fromJson.length > 0) return fromJson;
    const terms = draft.keywordsText
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return terms.length ? ([{ op: "and", terms }] satisfies KeywordGroup[]) : [];
  }

  function runSingleTest(item: EvalCase, reveal = false) {
    if (reveal) applyCase(item);
    return runAction.run(async () => {
      setRun(null);
      setScore(null);
      setSteps([]);
      setRunError("");
      const finished: { run: RunRecord | null } = { run: null };
      try {
        await streamAgentRun({ question: item.question, source: "eval" }, (event) => {
          if (event.type === "step") setSteps((current) => upsertAgentStep(current, event.step));
          if (event.type === "done") finished.run = event.run;
          if (event.type === "error") {
            throw Object.assign(new Error(event.message), { code: event.code });
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "运行失败";
        const code = error instanceof Error && "code" in error ? String(error.code) : undefined;
        setRunError(message);
        const scored = await api<{ score: EvalScoreResult }>("/api/eval/score", {
          method: "POST",
          body: JSON.stringify({ caseId: item.id, error: { message, code } }),
        });
        setScore(scored.score);
        toast.message(scored.score.status);
        return scored.score.status === "ERROR" ? "系统错误，记为 ERROR 而非 FAIL" : scored.score.reason;
      }
      const latest = finished.run;
      if (!latest) throw new Error("没有收到 Agent 完成事件");
      setRun(latest);
      const scored = await api<{ score: EvalScoreResult }>("/api/eval/score", {
        method: "POST",
        body: JSON.stringify({ caseId: item.id, runId: latest.id }),
      });
      setScore(scored.score);
      toast.success(`${scored.score.status} · ${latest.id}`);
      return `${scored.score.status} · ${latest.id}`;
    }, "单条测试失败");
  }

  function deleteCase(item: EvalCase) {
    return crudAction.run(async () => {
      await api(`/api/eval/cases/${item.id}`, { method: "DELETE" });
      await reload();
      if (selectedId === item.id) closeDetail();
      toast.success("已删除");
      return "已删除";
    }, "删除失败");
  }

  function toggleEnabled(item: EvalCase) {
    const nextEnabled = item.enabled === false;
    return crudAction.run(async () => {
      const result = await api<{ case: EvalCase }>(`/api/eval/cases/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      await reload();
      if (selectedId === item.id) {
        applyCase(result.case);
      }
      toast.success(nextEnabled ? "已启用" : "已停用（跑测评时会忽略）");
      return nextEnabled ? "已启用" : "已停用";
    }, "更新启用状态失败");
  }

  const testQuestion = run?.question || selected?.question || draft.question;
  const testReply = run?.finalReply || "";

  const testResultBlock =
    score || run || runError || steps.length > 0 || runAction.phase === "loading" ? (
      <div className="space-y-3 rounded-md border border-border bg-card p-3">
        <div>
          <p className="text-sm font-medium">测试结果</p>
          <p className="text-xs text-muted-foreground">先对照用户问题与本次真实回复，再看规则与 Judge，最后展开执行链路</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0 rounded-md border border-border bg-muted/40 p-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">用户问题</p>
            <p className="max-h-48 overflow-y-auto text-sm whitespace-pre-wrap break-words leading-6">
              {testQuestion || "（无问题）"}
            </p>
          </div>
          <div className="min-w-0 rounded-md border border-border bg-muted/40 p-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">真实回复</p>
            <p className="max-h-48 overflow-y-auto text-sm whitespace-pre-wrap break-words leading-6">
              {testReply || (runAction.phase === "loading" ? "生成中…" : "（尚无回复）")}
            </p>
          </div>
        </div>

        {score ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">规则 / 综合判定</span>
              <StatusLabel
                text={score.status}
                tone={
                  score.status === "PASS"
                    ? "ok"
                    : score.status === "REVIEW"
                      ? "warn"
                      : score.status === "ERROR"
                        ? "info"
                        : "danger"
                }
              />
              {score.judge?.status === "ok" ? (
                <span className="text-xs text-muted-foreground">
                  Judge 总分 {score.judge.overall}/5
                  {score.judge.verdict ? ` · ${score.judge.verdict}` : ""}
                </span>
              ) : null}
            </div>
            <p>{score.reason}</p>
            {score.safetyHardFail || score.qualityFail ? (
              <p className="text-xs text-muted-foreground">
                {score.safetyHardFail ? "安全硬失败，不可复议" : null}
                {score.safetyHardFail && score.qualityFail ? " · " : null}
                {score.qualityFail ? "质量失败，Judge 可复议" : null}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              runId：{score.runId || "无"} · {score.durationMs}ms
              {score.runId ? (
                <>
                  {" "}
                  <a className="underline" href={`/runs/${score.runId}`}>
                    打开本次 Run
                  </a>
                </>
              ) : null}
            </p>
            <div className="grid gap-1 text-sm">
              <p className="break-words">
                <span className="text-muted-foreground">命中：</span>
                {score.keywordHits.join("、") || "无"}
              </p>
              <p className="break-words">
                <span className="text-muted-foreground">缺失：</span>
                {score.keywordMisses.join("、") || "无"}
              </p>
              <p className="break-words">
                <span className="text-muted-foreground">禁词：</span>
                {score.forbiddenHits.join("、") || "无"}
              </p>
            </div>
            {score.evidence.length ? (
              <ul className="list-disc pl-4 text-xs text-muted-foreground">
                {score.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <JudgeChart judge={score.judge} />
          </div>
        ) : null}

        {runError || (run?.steps ?? steps).length > 0 || run?.plan ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">执行链路 Trace</p>
            <p className="text-xs text-muted-foreground">
              Planner → Validator → Tool / Skill → risk-check，逐步展开可看每步输入和结果
            </p>
            <RunTrace steps={run?.steps ?? steps} plan={run?.plan} error={runError} />
          </div>
        ) : null}
      </div>
    ) : null;

  const detailFields = (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs text-muted-foreground md:col-span-2">
          用例名称
          <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-1" />
        </label>
        <label className="block text-xs text-muted-foreground md:col-span-2">
          问题
          <Textarea value={draft.question} onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))} className="mt-1 min-h-24" />
        </label>
        <label className="block text-xs text-muted-foreground md:col-span-2">
          关键
          <Textarea
            value={draft.keyPoint}
            onChange={(event) => setDraft((current) => ({ ...current, keyPoint: event.target.value }))}
            className="mt-1 min-h-20"
            placeholder="这条用例要覆盖的关键行为或判分要点"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          分类 category
          <Input value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} className="mt-1" />
        </label>
        <label className="block text-xs text-muted-foreground">
          维度 evalDimension
          <Input value={draft.evalDimension} onChange={(event) => setDraft((current) => ({ ...current, evalDimension: event.target.value }))} className="mt-1" />
        </label>
        <label className="block text-xs text-muted-foreground">
          难度
          <select
            className="mt-1 h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
            value={draft.difficulty}
            onChange={(event) => setDraft((current) => ({ ...current, difficulty: event.target.value }))}
          >
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          风险
          <select
            className="mt-1 h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
            value={draft.riskLevel}
            onChange={(event) => setDraft((current) => ({ ...current, riskLevel: event.target.value }))}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          期望关键词
          <Textarea
            value={draft.keywordsText}
            onChange={(event) => {
              const keywordsText = event.target.value;
              const terms = keywordsText
                .split(/[,，、]/)
                .map((item) => item.trim())
                .filter(Boolean);
              setDraft((current) => ({
                ...current,
                keywordsText,
                keywordsJson: JSON.stringify(terms.length ? [{ op: "and", terms }] : [], null, 2),
              }));
            }}
            className="mt-1 min-h-20"
            placeholder="顿号或逗号分隔，例如：海带、香辣"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          禁词
          <Textarea
            value={draft.forbidden}
            onChange={(event) => setDraft((current) => ({ ...current, forbidden: event.target.value }))}
            className="mt-1 min-h-20"
            placeholder="逗号分隔"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          期望价格
          <Input
            value={draft.expectedPrice}
            onChange={(event) => setDraft((current) => ({ ...current, expectedPrice: event.target.value }))}
            className="mt-1"
            placeholder="例如 27.6，可空"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          期望 SkillId
          <Input
            value={draft.expectedSkillId}
            onChange={(event) => setDraft((current) => ({ ...current, expectedSkillId: event.target.value }))}
            className="mt-1"
            placeholder="例如 risk-check"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          必需能力
          <Input
            value={draft.requiredCapabilities}
            onChange={(event) => setDraft((current) => ({ ...current, requiredCapabilities: event.target.value }))}
            className="mt-1"
            placeholder="recommend，price"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          禁用能力
          <Input
            value={draft.forbiddenCapabilities}
            onChange={(event) => setDraft((current) => ({ ...current, forbiddenCapabilities: event.target.value }))}
            className="mt-1"
            placeholder="可空"
          />
        </label>
        <label className="block text-xs text-muted-foreground md:col-span-2">
          标签 tags（可选，如 regression / annotation）
          <Input
            value={draft.tags}
            onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
            className="mt-1"
            placeholder="regression，annotation"
          />
        </label>
        <label className="block text-xs text-muted-foreground md:col-span-2">
          金标回复 expectedReply
          <Textarea
            value={draft.expectedReply}
            onChange={(event) => setDraft((current) => ({ ...current, expectedReply: event.target.value }))}
            className="mt-1 min-h-24"
            placeholder="人工标准答，会交给 Judge 对照"
          />
        </label>
        <label className="block text-xs text-muted-foreground md:col-span-2">
          Judge 补充 rubric
          <Textarea
            value={draft.llmJudgePrompt}
            onChange={(event) => setDraft((current) => ({ ...current, llmJudgePrompt: event.target.value }))}
            className="mt-1 min-h-16"
            placeholder="可空"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.expectReplySafe}
            onChange={(event) => setDraft((current) => ({ ...current, expectReplySafe: event.target.checked }))}
          />
          期望回复安全
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.expectInputRisk}
            onChange={(event) => setDraft((current) => ({ ...current, expectInputRisk: event.target.checked }))}
          />
          期望识别输入风险
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() =>
            crudAction.run(async () => {
              if (!draft.name.trim() || !draft.question.trim()) throw new Error("请填写用例名称和问题");
              const payload = draftPayload();
              if (!selected) {
                const created = await api<{ case: EvalCase }>("/api/eval/cases", {
                  method: "POST",
                  body: JSON.stringify(payload),
                });
                await reload();
                applyCase(created.case);
                toast.success("已添加");
                return created.message || "已添加";
              }
              const result = await api<{ case: EvalCase }>(`/api/eval/cases/${selected.id}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
              });
              await reload();
              applyCase(result.case);
              toast.success("已保存");
              return "已保存，刷新后仍在";
            }, "保存失败")
          }
        >
          {selected ? "保存" : "添加"}
        </Button>
        <Button type="button" variant="secondary" onClick={startCreate}>
          添加
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!selected}
          onClick={() =>
            crudAction.run(async () => {
              const created = await api<{ case: EvalCase }>("/api/eval/cases", {
                method: "POST",
                body: JSON.stringify({ copyFrom: selected!.id }),
              });
              await reload();
              applyCase(created.case);
              return "已复制";
            }, "复制失败")
          }
        >
          复制
        </Button>
        <Button type="button" variant="destructive" disabled={!selected} onClick={() => selected && deleteCase(selected)}>
          删除
        </Button>
        <Button type="button" disabled={!selected} onClick={() => selected && runSingleTest(selected)}>
          单条测试
        </Button>
      </div>
      <FeedbackBanner phase={crudAction.phase} message={crudAction.message} />
      <FeedbackBanner phase={runAction.phase} message={runAction.message} />
      {testResultBlock}
    </div>
  );

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>测评集</CardTitle>
          <CardDescription>每条用例可单独启用/停用；停用后仍保留在测评集里，跑批与「全部启用」测评时会忽略。点「编辑」或「单条测试」在该条下方展开。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">全部分类</option>
              {unique(cases.map((item) => item.category)).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={dimension} onChange={(event) => setDimension(event.target.value)}>
              <option value="">全部维度</option>
              {unique(cases.map((item) => item.evalDimension)).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="">全部难度</option>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={riskLevel} onChange={(event) => setRiskLevel(event.target.value)}>
              <option value="">全部风险</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="">全部标签</option>
              {unique(cases.flatMap((item) => item.tags ?? [])).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={showDisabled} onChange={(event) => setShowDisabled(event.target.checked)} />
              显示已停用
            </label>
            <Button type="button" size="sm" onClick={startCreate}>
              {adding ? "收起新建" : "添加用例"}
            </Button>
          </div>
          {adding ? (
            <div className="rounded-md border border-border p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">新建用例</p>
                  <p className="text-xs text-muted-foreground">填写后保存，写入服务端测评集。</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={closeDetail}>
                  收起
                </Button>
              </div>
              {detailFields}
            </div>
          ) : null}
          {filtered.length === 0 && !adding ? (
            <EmptyState title="没有启用中的用例" description="调整筛选，或点添加用例。" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[68rem] text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="w-16 pb-3 font-medium">启用</th>
                    <th className="pb-3 font-medium">用例名称</th>
                    <th className="pb-3 font-medium">问题</th>
                    <th className="pb-3 font-medium">关键</th>
                    <th className="pb-3 font-medium">期望关键词</th>
                    <th className="pb-3 font-medium">禁词</th>
                    <th className="w-[17rem] pb-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const active = item.id === selectedId && !adding;
                    return (
                      <Fragment key={item.id}>
                        <tr
                          className={cn(
                            "border-t border-border align-middle",
                            item.enabled === false && "opacity-60",
                            active ? "bg-secondary" : "hover:bg-muted/40",
                          )}
                        >
                          <td className="py-4 pr-3">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={item.enabled !== false}
                              aria-label={item.enabled === false ? "启用用例" : "停用用例"}
                              disabled={crudAction.phase === "loading"}
                              onClick={() => toggleEnabled(item)}
                              className={cn(
                                "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                                item.enabled === false
                                  ? "border-border bg-muted"
                                  : "border-emerald-600/40 bg-emerald-600",
                                crudAction.phase === "loading" && "opacity-50",
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
                                  item.enabled === false ? "translate-x-0" : "translate-x-5",
                                )}
                              />
                            </button>
                          </td>
                          <td className="max-w-[12rem] py-4 pr-4 font-medium">
                            <span className="line-clamp-2 leading-6">{item.name}</span>
                          </td>
                          <td className="max-w-[16rem] py-4 pr-4 text-muted-foreground">
                            <span className="line-clamp-2 leading-6">{item.question}</span>
                          </td>
                          <td className="max-w-[12rem] py-4 pr-4">
                            <span className="line-clamp-2 leading-6">{item.expectedBehavior || "无"}</span>
                          </td>
                          <td className="max-w-[12rem] py-4 pr-4">
                            <span className="line-clamp-2 leading-6">{keywordSummary(item.expectedKeywords)}</span>
                          </td>
                          <td className="max-w-[10rem] py-4 pr-4">
                            <span className="line-clamp-2 leading-6">{(item.forbiddenWords ?? []).join("、") || "无"}</span>
                          </td>
                          <td className="py-4">
                            <div className="flex flex-nowrap items-center gap-1.5">
                              <Button type="button" size="sm" variant="outline" onClick={() => openEdit(item)}>
                                {active ? "收起" : "编辑"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={item.enabled === false}
                                title={item.enabled === false ? "已停用，请先启用再测" : undefined}
                                onClick={() => runSingleTest(item, true)}
                              >
                                单条测试
                              </Button>
                              <Button type="button" size="sm" variant="destructive" onClick={() => deleteCase(item)}>
                                删除
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {active ? (
                          <tr className="border-t border-border bg-muted/20">
                            <td colSpan={7} className="px-3 py-4">
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">编辑用例</p>
                                  <p className="text-xs text-muted-foreground">
                                    可编辑用例字段；点「单条测试」后，结果会显示在下方按钮区域之下（先问题与真实回复，再判定与链路）。
                                  </p>
                                </div>
                                <Button type="button" size="sm" variant="outline" onClick={closeDetail}>
                                  收起
                                </Button>
                              </div>
                              {detailFields}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
