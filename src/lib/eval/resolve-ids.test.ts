import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveBatchCaseIds } from "./resolve-ids.ts";

test("不传 caseIds 使用全部启用项", () => {
  const ids = resolveBatchCaseIds({
    requested: undefined,
    enabledIds: ["a", "b"],
    knownIds: ["a", "b", "c"],
  });
  assert.deepEqual(ids, ["a", "b"]);
});

test("空数组抛出 400", () => {
  assert.throws(
    () => resolveBatchCaseIds({ requested: [], enabledIds: ["a"], knownIds: ["a"] }),
    (error: { status?: number; code?: string }) => error.status === 400 && error.code === "EMPTY_CASE_IDS",
  );
});

test("无效 ID 列出全部无效项", () => {
  try {
    resolveBatchCaseIds({ requested: ["a", "x", "y"], enabledIds: ["a"], knownIds: ["a"] });
    assert.fail("should throw");
  } catch (error) {
    const typed = error as { invalidIds?: string[]; status?: number };
    assert.equal(typed.status, 400);
    assert.deepEqual(typed.invalidIds, ["x", "y"]);
  }
});
