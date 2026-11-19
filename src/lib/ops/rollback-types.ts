import type {
  EvalBatch,
  JudgeConfig,
  JudgeVersionSnapshot,
  LlmVersionSnapshot,
  PlannerConfig,
  PlannerVersionSnapshot,
  PromptAbExperiment,
  PublicLlmConfig,
  Skill,
  SkillVersionSummary,
  Tool,
  ToolVersionSnapshot,
} from "@/lib/types";

export type RollbackHub = {
  skills: Skill[];
  skillVersions: SkillVersionSummary[];
  planner: {
    config: PlannerConfig;
    systemPrompt: string;
    versions: Array<Pick<PlannerVersionSnapshot, "id" | "version" | "createdAt" | "changeNote">>;
  };
  tools: Tool[];
  toolVersions: Array<Pick<ToolVersionSnapshot, "id" | "toolId" | "createdAt" | "changeNote" | "name">>;
  judge: {
    config: JudgeConfig;
    versions: Array<Pick<JudgeVersionSnapshot, "id" | "createdAt" | "changeNote">>;
  };
  llm: {
    config: PublicLlmConfig;
    versions: Array<Pick<LlmVersionSnapshot, "id" | "createdAt" | "changeNote"> & { summary: string }>;
  };
  promotedExperiments: PromptAbExperiment[];
  evalBatches: Array<{
    id: string;
    name: string;
    versionLabel: string;
    status: EvalBatch["status"];
    createdAt: string;
    passRate: number;
    skillVersion: string;
    hasOverrides: boolean;
  }>;
};
