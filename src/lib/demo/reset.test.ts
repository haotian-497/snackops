import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { demoReset, hashText, snapshotResetState } from "../../../scripts/demo-reset.mjs";

test("demo reset 可重复且不改业务基础数据", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "snackops-reset-"));
  const skillsDir = await mkdtemp(join(tmpdir(), "snackops-skills-"));
  process.env.DATA_DIR = dataDir;
  process.env.SKILLS_DIR = skillsDir;
  await writeFile(join(dataDir, "products.json"), "{\"keep\":true}\n", "utf8");
  await writeFile(join(dataDir, "orders.json"), "[]\n", "utf8");
  await writeFile(join(dataDir, "coupons.json"), "[]\n", "utf8");
  await writeFile(join(dataDir, "users.json"), "[]\n", "utf8");
  await writeFile(join(dataDir, "activities.json"), "[]\n", "utf8");
  await writeFile(join(dataDir, "faq.json"), "[]\n", "utf8");
  await writeFile(join(dataDir, "logistics.json"), "[]\n", "utf8");
  await writeFile(join(dataDir, "return-policies.json"), "[]\n", "utf8");
  await mkdir(skillsDir, { recursive: true });

  await demoReset();
  await writeFile(join(dataDir, "eval_cases.json"), '[{"id":"ec_polluted"}]\n', "utf8");
  await writeFile(join(dataDir, "annotations.json"), '[{"id":"an_polluted"}]\n', "utf8");
  const productsBefore = hashText(await readFile(join(dataDir, "products.json"), "utf8"));

  await demoReset();
  const first = await snapshotResetState();
  await demoReset();
  const second = await snapshotResetState();

  const cases = JSON.parse(await readFile(join(dataDir, "eval_cases.json"), "utf8")) as Array<{ id: string }>;
  assert.ok(cases.some((item) => item.id === "ec_spicy_office"));
  assert.ok(!cases.some((item) => item.id === "ec_polluted"));
  assert.deepEqual(first, second);
  assert.equal(second["preserved:products.json"], productsBefore);
  assert.equal(JSON.parse(await readFile(join(dataDir, "annotations.json"), "utf8")).length, 0);
  assert.equal(JSON.parse(await readFile(join(dataDir, "llm-config.json"), "utf8")).provider, "demo");
});
