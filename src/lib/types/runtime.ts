import type { HandoffRule } from "@/lib/types/support";

export type SkillStatus = "draft" | "published" | "deprecated";

export type Skill = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  requiredTools: string[];
  version: string;
  filePath: string;
  status: SkillStatus;
  toolIds: string[];
};

export type SkillRecord = Skill & {
  systemPrompt: string;
};

export type ToolStatus = "ready" | "needs_config" | "disabled";

export type JsonSchema = Record<string, unknown>;

export type Tool = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  status: ToolStatus;
  timeoutMs: number;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
};

export type ToolsConfig = {
  updatedAt: string;
  defaults: {
    timeoutMs: number;
    retry: number;
  };
  overrides: Record<string, { timeoutMs?: number; enabled?: boolean }>;
};

export type SkillVersionSnapshot = {
  id: string;
  skillId: string;
  version: string;
  createdAt: string;
  changeNote: string;
  hash: string;
  filePath: string;
  systemPrompt: string;
  metadata: {
    name: string;
    description: string;
    model: string;
    temperature: number;
    maxTokens: number;
    requiredTools: string[];
    enabled: boolean;
  };
};

export type SkillVersionSummary = Pick<
  SkillVersionSnapshot,
  "id" | "skillId" | "version" | "createdAt" | "changeNote" | "hash"
>;

/** @deprecated Prefer SkillVersionSnapshot. Kept for older records. */
export type SkillVersion = SkillVersionSnapshot & {
  changelog?: string;
  publishedAt?: string;
};

export type RunStatus = "running" | "succeeded" | "failed" | "handed_off";

export type AgentRun = {
  id: string;
  ticketId: string;
  skillId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  notes: string;
};

export type PlanRiskJudgment = {
  level: "low" | "medium" | "high";
  needsRiskCheck: boolean;
  notes: string;
};

export type AgentPlan = {
  selectedSkills: string[];
  selectedTools: string[];
  reasoning: string;
  mandatoryCapabilities: string[];
  risk: PlanRiskJudgment;
  degradation?: string;
  handoff?: boolean;
  handoffReason?: string;
};

export type PlanValidationIssue = {
  code: string;
  severity: "error" | "warning" | "block";
  message: string;
  capability?: string;
};

export type PlanValidationReport = {
  ok: boolean;
  blocked: boolean;
  issues: PlanValidationIssue[];
};

export type AgentStepType = "planner" | "validator" | "skill" | "tool" | "risk-check" | "rewrite";

export type AgentStepStatus = "running" | "succeeded" | "failed" | "skipped";

export const EXECUTION_STAGES = [
  { id: "plan", label: "规划", types: ["planner"] },
  { id: "validate", label: "计划校验", types: ["validator"] },
  { id: "execute", label: "Executor 执行", types: ["tool", "skill"] },
  { id: "risk", label: "风险收尾", types: ["risk-check", "rewrite"] },
] as const;

export type ExecutionStageId = (typeof EXECUTION_STAGES)[number]["id"];

export type AgentStep = {
  stepId: string;
  type: AgentStepType;
  /** 执行阶段，仅用于前端分组展示，不写 RunRecord 也不参与判定 */
  stage?: ExecutionStageId;
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  status: AgentStepStatus;
  error?: string;
};

export type RiskResult = {
  verdict: "allow" | "block";
  triggeredRules: string[];
  safeRewriteHint?: string;
  raw: string;
  scored: boolean;
};

export type SkillVersionPin = {
  skillId: string;
  version: string;
  hash?: string;
};

export type ToolVersionPin = {
  toolId: string;
  enabled: boolean;
  timeoutMs: number;
};

export type RunRecord = {
  id: string;
  question: string;
  source: "workbench" | "demo" | "retry" | "legacy" | "eval";
  conversationId: string;
  createdAt: string;
  status: RunStatus;
  finalReply: string;
  plan: AgentPlan | null;
  steps: AgentStep[];
  riskResult: RiskResult | null;
  durationMs: number;
  error?: string;
  provider: string;
  model: string;
  skillVersions: SkillVersionPin[];
  toolVersions: ToolVersionPin[];
  validation?: PlanValidationReport;
  ticketId?: string;
};

export type RatingChannel = "user" | "ops";

export type Rating = {
  id: string;
  runId: string;
  score: number;
  comment: string;
  createdAt: string;
  question?: string;
  reply?: string;
  issueType?: string;
  /** user = 用户侧打分；ops = 运营代评。缺省按 ops 兼容旧数据。 */
  channel?: RatingChannel;
  createdBy?: string;
};

export type AnnotationStatus = "pending" | "accepted" | "rejected";

export type AnnotationScores = {
  correctness?: number;
  relevance?: number;
  completeness?: number;
  safety?: number;
  tone?: number;
  overall?: number;
};

export type Annotation = {
  id: string;
  runId: string;
  label: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  status?: AnnotationStatus;
  scores?: AnnotationScores;
  goldReply?: string;
  promotedTo?: Array<"improvement" | "eval">;
};

export type ImprovementSource = "rating" | "annotation" | "eval" | "bad_case";
export type ImprovementTarget = "planner" | "skill" | "tool" | "eval";
export type ImprovementDiagnosisConfidence = "high" | "medium" | "low";

/** Bad Case / Run 链路归因结果；needsConfirm=true 表示建议仍待人工确认 */
export type ImprovementDiagnosis = {
  target: Exclude<ImprovementTarget, "eval">;
  skillId?: string;
  toolId?: string;
  confidence: ImprovementDiagnosisConfidence;
  needsConfirm: boolean;
  /** 列表徽章短文案，如「嫌疑 Skill · risk-check」 */
  summary: string;
  rationale: string;
  evidence: string[];
  /** 同根因归并键，如 skill:risk-check / planner:missing_tool:query_logistics */
  rootCauseKey: string;
};

export type ImprovementSampleFocus = {
  runId: string;
  evalCaseId?: string;
  addedAt: string;
};

export type Improvement = {
  id: string;
  title: string;
  source: ImprovementSource;
  status: "open" | "in_progress" | "done";
  owner: string;
  cluster?: string;
  clusterMethod?: "rule" | "root_cause";
  target?: ImprovementTarget;
  sampleRunIds?: string[];
  /** 同根因焦点样本（对应 Prompt A/B 焦点用例） */
  sampleFocus?: ImprovementSampleFocus[];
  skillId?: string;
  draftPrompt?: string;
  appliedAt?: string;
  createdAt?: string;
  note?: string;
  promptAbExperimentId?: string;
  /** 链路归因 */
  diagnosis?: ImprovementDiagnosis;
  /** 运营已确认/改过目标后为 true */
  diagnosisConfirmed?: boolean;
};

export type RuntimeFallback = {
  enabled: boolean;
  fallbackSkillId: string;
  humanTakeoverAfterFails: number;
  note: string;
  handoffRules: HandoffRule[];
};
