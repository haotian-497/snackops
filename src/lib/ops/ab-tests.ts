import "server-only";

import { randomUUID } from "node:crypto";

import { readJson, updateJson } from "@/lib/store";
import type { AbTest, AbTestStatus } from "@/lib/types";

export async function listAbTests(): Promise<AbTest[]> {
  return readJson<AbTest[]>("ab-tests.json");
}

export async function createAbTest(input: {
  name: string;
  controlSkillId: string;
  treatmentSkillId: string;
  trafficPct: number;
  status?: AbTestStatus;
}): Promise<AbTest> {
  const created: AbTest = {
    id: `ab_${randomUUID()}`,
    name: input.name,
    controlSkillId: input.controlSkillId,
    treatmentSkillId: input.treatmentSkillId,
    trafficPct: input.trafficPct,
    status: input.status ?? "draft",
  };
  await updateJson<AbTest[]>("ab-tests.json", (current) => [created, ...current]);
  return created;
}

export async function updateAbTest(id: string, patch: Partial<Pick<AbTest, "status" | "trafficPct" | "name">>) {
  const items = await updateJson<AbTest[]>("ab-tests.json", (current) => {
    if (!current.some((item) => item.id === id)) {
      throw new Error(`未找到 A/B 实验：${id}`);
    }
    return current.map((item) => (item.id === id ? { ...item, ...patch } : item));
  });
  return items.find((item) => item.id === id)!;
}
