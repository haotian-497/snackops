import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveDirs() {
  return {
    seedDir: join(root, "fixtures", "demo"),
    dataDir: process.env.DATA_DIR?.trim() || join(root, "data"),
    skillsDir: process.env.SKILLS_DIR?.trim() || join(root, "skills"),
  };
}

export const RESET_JSON_FILES = [
  "eval_cases.json",
  "eval_batches.json",
  "judge-config.json",
  "annotations.json",
  "improvements.json",
  "prompt-ab-experiments.json",
  "skills.json",
  "skill-versions.json",
  "llm-config.json",
];

export const PRESERVED_JSON_FILES = [
  "products.json",
  "orders.json",
  "coupons.json",
  "users.json",
  "activities.json",
  "faq.json",
  "logistics.json",
  "return-policies.json",
];

function isNodeError(error) {
  return typeof error === "object" && error !== null && "code" in error;
}

async function commitTempFile(tempPath, targetPath) {
  try {
    await rename(tempPath, targetPath);
    return;
  } catch (error) {
    if (!isNodeError(error) || (error.code !== "EEXIST" && error.code !== "EPERM")) {
      throw error;
    }
  }
  const backupPath = `${targetPath}.${process.pid}.bak`;
  try {
    await rename(targetPath, backupPath);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  }
  try {
    await rename(tempPath, targetPath);
    await unlink(backupPath).catch(() => undefined);
  } catch (error) {
    try {
      await rename(backupPath, targetPath);
    } catch {
      // keep backup
    }
    throw error;
  }
}

export async function atomicWrite(targetPath, content) {
  await mkdir(dirname(targetPath), { recursive: true });
  const tempPath = join(dirname(targetPath), `.reset.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, content, "utf8");
    await commitTempFile(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function demoReset() {
  const { seedDir, dataDir, skillsDir } = resolveDirs();
  const written = [];
  for (const fileName of RESET_JSON_FILES) {
    const source = await readFile(join(seedDir, fileName), "utf8");
    const target = join(dataDir, fileName);
    await atomicWrite(target, source.endsWith("\n") ? source : `${source}\n`);
    written.push(fileName);
  }
  const skillFiles = [
    "after-sales-classification.md",
    "allergy-risk-reminder.md",
    "clarification-question.md",
    "complaint-triage.md",
    "conversation-summary.md",
    "gift-scenario-advisor.md",
    "human-handoff-decision.md",
    "need-extraction.md",
    "planner.md",
    "product-substitution.md",
    "recommendation-decision.md",
    "recommendation-reason.md",
    "response-generator.md",
    "risk-check.md",
    "对话问候-skill.md",
  ];
  for (const fileName of skillFiles) {
    const source = await readFile(join(seedDir, "skills", fileName), "utf8");
    await atomicWrite(join(skillsDir, fileName), source.endsWith("\n") ? source : `${source}\n`);
    written.push(`skills/${fileName}`);
  }
  return { ok: true, written, dataDir, skillsDir };
}

export async function snapshotResetState() {
  const { dataDir } = resolveDirs();
  const hashes = {};
  for (const fileName of RESET_JSON_FILES) {
    hashes[fileName] = hashText(await readFile(join(dataDir, fileName), "utf8"));
  }
  for (const fileName of PRESERVED_JSON_FILES) {
    hashes[`preserved:${fileName}`] = hashText(await readFile(join(dataDir, fileName), "utf8"));
  }
  return hashes;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = await demoReset();
  console.log(JSON.stringify({ message: "Demo 数据已恢复到已知初始状态", ...result }, null, 2));
}
