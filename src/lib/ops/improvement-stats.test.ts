import assert from "node:assert/strict";
import { test } from "node:test";

import { improvementFunnel } from "./improvement-stats.ts";
import type { Improvement } from "../types/runtime.ts";

function item(partial: Partial<Improvement> & Pick<Improvement, "id" | "title" | "source" | "status">): Improvement {
  return {
    owner: "运营",
    ...partial,
  };
}

test("improvementFunnel 统计 open/draft/apply", () => {
  const items = [
    item({ id: "1", title: "a", source: "rating", status: "open" }),
    item({ id: "2", title: "b", source: "eval", status: "in_progress", draftPrompt: "x", target: "tool" }),
    item({ id: "3", title: "c", source: "annotation", status: "done", appliedAt: "2026-01-01", draftPrompt: "y" }),
  ];
  const funnel = improvementFunnel(items);
  assert.equal(funnel.total, 3);
  assert.equal(funnel.open, 1);
  assert.equal(funnel.inProgress, 1);
  assert.equal(funnel.done, 1);
  assert.equal(funnel.withDraft, 2);
  assert.equal(funnel.applied, 1);
  assert.equal(funnel.bySource.eval, 1);
  assert.equal(funnel.byTarget.tool, 1);
  assert.equal(funnel.byTarget.skill, 2);
});
