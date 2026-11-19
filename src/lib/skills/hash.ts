import { createHash } from "node:crypto";

import type { Skill } from "@/lib/types";

export function hashSkillSnapshot(skill: Skill, systemPrompt: string): string {
  const payload = JSON.stringify({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    model: skill.model,
    temperature: skill.temperature,
    maxTokens: skill.maxTokens,
    requiredTools: skill.requiredTools,
    enabled: skill.enabled,
    version: skill.version,
    filePath: skill.filePath,
    systemPrompt,
  });
  return createHash("sha256").update(payload).digest("hex");
}
