export type EvalDifficulty = "easy" | "medium" | "hard";
export type EvalRiskLevel = "low" | "medium" | "high";
export type EvalScoreStatus = "PASS" | "FAIL" | "REVIEW" | "ERROR";

export type KeywordGroup = {
  op: "and" | "or";
  terms: string[];
};

export type EvalCase = {
  id: string;
  name: string;
  title?: string;
  question: string;
  userUtterance?: string;
  category: string;
  scenario?: string;
  difficulty: EvalDifficulty;
  riskLevel: EvalRiskLevel;
  expectedBehavior: string;
  expectedReply?: string;
  expectedKeywords?: Array<string | KeywordGroup>;
  forbiddenWords: string[];
  expectedPrice?: number;
  expectReplySafe: boolean;
  expectSendAllowed?: boolean;
  expectInputRisk?: boolean;
  expectRiskPassed?: boolean;
  requiredCapabilities: string[];
  forbiddenCapabilities: string[];
  evalDimension: string;
  llmJudgePrompt?: string;
  tags: string[];
  sourceRunId?: string;
  createdAt: string;
  enabled: boolean;
  expectedIntent?: string;
  expectedSkillId?: string;
};

export type JudgeConfig = {
  systemPrompt: string;
  updatedAt: string;
};

export type JudgeVersionSnapshot = {
  id: string;
  createdAt: string;
  changeNote: string;
  systemPrompt: string;
  updatedAt: string;
};

export type ToolVersionSnapshot = {
  id: string;
  toolId: string;
  createdAt: string;
  changeNote: string;
  name: string;
  description: string;
  enabled: boolean;
  timeoutMs?: number;
};

export type LlmJudgeDimensions = {
  /** 1-5；历史 0-10 分会在读取时折算 */
  correctness: number;
  relevance: number;
  completeness: number;
  safety: number;
  tone: number;
  overall: number;
};

export type LlmJudgeResult = {
  enabled: boolean;
  status: "ok" | "error" | "skipped";
  verdict?: EvalScoreStatus;
  overall: number;
  dimensions: LlmJudgeDimensions;
  rationale: string;
  highlights: string[];
  issues: string[];
  overrideQualityFail?: boolean;
  overrideReason?: string;
  provider?: string;
  model?: string;
  fixture?: boolean;
  error?: string;
};

export type EvalScoreResult = {
  status: EvalScoreStatus;
  passed: boolean;
  reason: string;
  evidence: string[];
  keywordHits: string[];
  keywordMisses: string[];
  forbiddenHits: string[];
  expectedPrice?: number;
  mentionedPrice: number[];
  riskIssues: string[];
  capabilityHits: string[];
  durationMs: number;
  runId?: string;
  inputRisk: boolean;
  replySafe: boolean;
  shouldSend: boolean;
  safetyHardFail: boolean;
  qualityFail: boolean;
  judge?: LlmJudgeResult;
};

export type EvalBatchStatus = "queued" | "running" | "done" | "error" | "cancelled";

export type EvalRunParams = {
  temperature: number;
  maxTokens: number;
};

export type EvalCaseSnapshot = {
  id: string;
  name: string;
  question: string;
  expectedKeywords?: EvalCase["expectedKeywords"];
  forbiddenWords: string[];
  expectedPrice?: number;
  expectedReply?: string;
  expectedSkillId?: string;
  requiredCapabilities: string[];
  forbiddenCapabilities: string[];
  expectReplySafe: boolean;
  expectInputRisk?: boolean;
  evalDimension: string;
};

export type EvalCaseResult = {
  caseId: string;
  name: string;
  question: string;
  finalReply: string;
  status: EvalScoreStatus;
  reason: string;
  keywordHits: string[];
  keywordMisses: string[];
  forbiddenHits: string[];
  expectedPrice?: number;
  mentionedPrice: number[];
  riskIssues: string[];
  capabilityHits: string[];
  capabilityPath: string[];
  durationMs: number;
  runId?: string;
  evidence: string[];
  inputRisk: boolean;
  replySafe: boolean;
  shouldSend: boolean;
  judge?: LlmJudgeResult;
};

export type EvalBatch = {
  id: string;
  name: string;
  versionLabel: string;
  changeNote: string;
  caseIds: string[];
  caseSnapshot: EvalCaseSnapshot[];
  caseSetHash: string;
  skillVersion: string;
  skillHash: string;
  /** 评测时按 skillId 覆盖 systemPrompt（不写生产），用于 Prompt A/B 实验组 */
  skillPromptOverrides?: Record<string, string>;
  /** 评测时覆盖 Planner system prompt（不写生产） */
  plannerPromptOverride?: string;
  /** 评测时覆盖 Tool description / enabled（不写生产） */
  toolOverrides?: Record<string, { description?: string; enabled?: boolean }>;
  /** 为 true 时 FAIL 不回流改进建议（A/B 批次用） */
  suppressEvalImprovements?: boolean;
  evaluatorVersion: string;
  evaluatorHash: string;
  evaluatorMode: "rules" | "rules+judge";
  judgeEnabled: boolean;
  provider: string;
  model: string;
  params: EvalRunParams;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  status: EvalBatchStatus;
  currentIndex: number;
  total: number;
  passed: number;
  failed: number;
  review: number;
  errors: number;
  passRate: number;
  qualityPassRate: number;
  caseResults: EvalCaseResult[];
  errorMessage?: string;
  saved: boolean;
  saveOnComplete: boolean;
};

export type PromptAbStatus = "draft" | "running" | "ready" | "promoted" | "discarded";

export type PromptAbKind = "skill" | "planner" | "tool";

/** 双跑用例集：ab-smoke 烟测套件，或全部启用用例 */
export type PromptAbCaseSuite = "ab-smoke" | "all";

export type PromptAbExperiment = {
  id: string;
  name: string;
  kind: PromptAbKind;
  improvementId: string;
  /** Skill 实验 */
  controlSkillId?: string;
  treatmentSkillId?: string;
  /** Planner 实验：临时 prompt 文件相对 skills/ */
  treatmentPlannerPath?: string;
  /** Tool 实验 */
  controlToolId?: string;
  draftDescription?: string;
  draftEnabled?: boolean;
  draftPrompt: string;
  status: PromptAbStatus;
  /** 双跑选用例集；跑批时按此解析 caseIds */
  caseSuite?: PromptAbCaseSuite;
  caseIds: string[];
  /** 改进单焦点用例（与回归套件合并后双跑） */
  focusCaseIds?: string[];
  controlBatchId?: string;
  treatmentBatchId?: string;
  createdAt: string;
  promotedAt?: string;
  note?: string;
};

export type EvalCompareReason =
  | "caseIds"
  | "caseSnapshot"
  | "evaluator"
  | "runConditions";

export type EvalCompareCaseDelta = {
  caseId: string;
  name: string;
  from: EvalScoreStatus;
  to: EvalScoreStatus;
  baselineReply: string;
  candidateReply: string;
};

export type EvalCompareReplyChange = {
  caseId: string;
  name: string;
  status: EvalScoreStatus;
  baselineReply: string;
  candidateReply: string;
};

export type EvalBatchCompare = {
  comparable: boolean;
  reasons: string[];
  notes: string[];
  mismatched: EvalCompareReason[];
  baseline: { id: string; versionLabel: string; status: EvalBatchStatus };
  candidate: { id: string; versionLabel: string; status: EvalBatchStatus };
  counts: {
    baseline: { passed: number; failed: number; review: number; errors: number; total: number; qualityPassRate: number };
    candidate: { passed: number; failed: number; review: number; errors: number; total: number; qualityPassRate: number };
  };
  fixed: EvalCompareCaseDelta[];
  newFailures: EvalCompareCaseDelta[];
  replyChangedSameStatus: EvalCompareReplyChange[];
  avgDurationMs: { baseline: number; candidate: number; delta: number };
  skills: {
    same: boolean;
    baseline: { skillVersion: string; skillHash: string };
    candidate: { skillVersion: string; skillHash: string };
  };
  conditions: {
    providerSame: boolean;
    modelSame: boolean;
    paramsSame: boolean;
    evaluatorSame: boolean;
    skillSame: boolean;
  };
};

export type AbTestStatus = "draft" | "running" | "stopped";

export type AbTest = {
  id: string;
  name: string;
  controlSkillId: string;
  treatmentSkillId: string;
  trafficPct: number;
  status: AbTestStatus;
};

export type LlmProviderId = "demo" | "openai-compatible";

export type LlmConfig = {
  provider: LlmProviderId | string;
  model: string;
  temperature: number;
  maxTokens: number;
  updatedAt: string;
};

export type LlmVersionSnapshot = {
  id: string;
  createdAt: string;
  changeNote: string;
  config: LlmConfig;
};

export type EnvFlag = "set" | "missing";

export type LlmVendorPresetPublic = {
  id: string;
  label: string;
  description: string;
  baseUrl: string;
  models: Array<{ id: string; label: string }>;
};

export type PublicLlmConfig = {
  provider: LlmProviderId;
  model: string;
  temperature: number;
  maxTokens: number;
  updatedAt: string;
  mode: "demo" | "live";
  modeLabel: string;
  providerDescription: string;
  models: Array<{ id: string; label: string; demo?: boolean }>;
  providers: Array<{
    id: LlmProviderId;
    description: string;
    demo: boolean;
    models: Array<{ id: string; label: string; demo?: boolean }>;
  }>;
  presets: LlmVendorPresetPublic[];
  connection: {
    apiKeySet: boolean;
    apiKeyMasked: string;
    apiKeySource: "local" | "env" | "missing";
    baseUrl: string;
    baseUrlSource: "local" | "env" | "default";
    vendorPresetId: string;
    slots: Record<string, { apiKeySet: boolean; apiKeyMasked: string; baseUrl: string; model?: string }>;
  };
  allowDemoReset: boolean;
  env: Record<string, EnvFlag>;
};

export type PlannerConfig = {
  version: string;
  filePath: string;
  enabledSkillIds: string[];
  enabledToolIds: string[];
  mandatoryCapabilities: string[];
  updatedAt: string;
};

export type PlannerVersionSnapshot = {
  id: string;
  version: string;
  createdAt: string;
  changeNote: string;
  systemPrompt: string;
  config: Omit<PlannerConfig, "filePath">;
};
