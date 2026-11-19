import assert from "node:assert/strict";
import { test } from "node:test";

test("skillPromptOverrides 覆盖同 id 的 prompt 且不改其它 skill", () => {
  const skills = [
    { id: "response-generator", systemPrompt: "A" },
    { id: "risk-check", systemPrompt: "R" },
  ];
  const overrides = { "response-generator": "B-draft" };
  const next = skills.map((skill) =>
    overrides[skill.id as keyof typeof overrides] !== undefined
      ? { ...skill, systemPrompt: overrides[skill.id as keyof typeof overrides] }
      : skill,
  );
  assert.equal(next[0].systemPrompt, "B-draft");
  assert.equal(next[1].systemPrompt, "R");
  assert.equal(skills[0].systemPrompt, "A");
});
