import { NextResponse } from "next/server";

import { deleteJudgeVersion, rollbackJudge } from "@/lib/eval/judge-config";
import { handleRouteError, jsonError } from "@/lib/http";
import { deleteLlmVersion, rollbackLlm } from "@/lib/llm/public";
import {
  loadRollbackHub,
  restoreFromEvalBatch,
  rollbackPlanner,
  rollbackTool,
  setToolEnabled,
  undoPromptAbPromote,
} from "@/lib/ops/rollback";
import { deletePlannerVersion } from "@/lib/planner/registry";
import { rollbackActionSchema } from "@/lib/schemas/ops";
import { deleteSkillVersion, rollbackSkill, updateSkill } from "@/lib/skills/registry";
import { deleteToolVersion } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const hub = await loadRollbackHub();
    return NextResponse.json({ ok: true, hub });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "请求体必须是 JSON 对象");
    const input = rollbackActionSchema.parse(body);

    switch (input.action) {
      case "rollback-skill": {
        const skill = await rollbackSkill(input.skillId, input.versionId);
        return NextResponse.json({ ok: true, skill, message: "已回滚 Skill", hub: await loadRollbackHub() });
      }
      case "rollback-planner": {
        const planner = await rollbackPlanner(input.versionId);
        return NextResponse.json({ ok: true, planner, message: "已回滚 Planner", hub: await loadRollbackHub() });
      }
      case "rollback-tool": {
        const tool = await rollbackTool(input.toolId, input.versionId);
        return NextResponse.json({ ok: true, tool, message: "已回滚 Tool", hub: await loadRollbackHub() });
      }
      case "rollback-judge": {
        const judge = await rollbackJudge(input.versionId);
        return NextResponse.json({ ok: true, judge, message: "已回滚 Judge", hub: await loadRollbackHub() });
      }
      case "rollback-llm": {
        const llm = await rollbackLlm(input.versionId);
        return NextResponse.json({ ok: true, llm, message: "已回滚 LLM 配置", hub: await loadRollbackHub() });
      }
      case "delete-skill-version": {
        await deleteSkillVersion(input.versionId, input.skillId);
        return NextResponse.json({ ok: true, message: "已删除 Skill 快照", hub: await loadRollbackHub() });
      }
      case "delete-planner-version": {
        await deletePlannerVersion(input.versionId);
        return NextResponse.json({ ok: true, message: "已删除 Planner 快照", hub: await loadRollbackHub() });
      }
      case "delete-tool-version": {
        await deleteToolVersion(input.toolId, input.versionId);
        return NextResponse.json({ ok: true, message: "已删除 Tool 快照", hub: await loadRollbackHub() });
      }
      case "delete-judge-version": {
        await deleteJudgeVersion(input.versionId);
        return NextResponse.json({ ok: true, message: "已删除 Judge 快照", hub: await loadRollbackHub() });
      }
      case "delete-llm-version": {
        await deleteLlmVersion(input.versionId);
        return NextResponse.json({ ok: true, message: "已删除 LLM 快照", hub: await loadRollbackHub() });
      }
      case "undo-promote": {
        const result = await undoPromptAbPromote(input.experimentId);
        return NextResponse.json({
          ok: true,
          ...result,
          message: "已撤销晋升并恢复晋升前配置",
          hub: await loadRollbackHub(),
        });
      }
      case "restore-batch": {
        const result = await restoreFromEvalBatch(input.batchId);
        return NextResponse.json({
          ok: true,
          ...result,
          message: `已按批次对齐：${result.applied.join(", ")}`,
          hub: await loadRollbackHub(),
        });
      }
      case "set-skill-enabled": {
        const skill = await updateSkill(input.skillId, {
          enabled: input.enabled,
          snapshotBefore: false,
          changeNote: input.enabled ? "运营启停：启用" : "运营启停：停用",
        });
        return NextResponse.json({
          ok: true,
          skill,
          message: input.enabled ? "已启用 Skill" : "已停用 Skill",
          hub: await loadRollbackHub(),
        });
      }
      case "set-tool-enabled": {
        const tool = await setToolEnabled(input.toolId, input.enabled);
        return NextResponse.json({
          ok: true,
          tool,
          message: input.enabled ? "已启用 Tool" : "已停用 Tool",
          hub: await loadRollbackHub(),
        });
      }
      default:
        return jsonError(400, "未知操作");
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
