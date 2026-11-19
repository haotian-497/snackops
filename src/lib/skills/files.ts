import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { withFileLock } from "@/lib/file-lock";
import { resolveProjectFile } from "@/lib/safe-path";

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

async function commitTempFile(tempPath: string, targetPath: string): Promise<void> {
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
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
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

export async function readSkillPrompt(filePath: string): Promise<string> {
  const target = resolveProjectFile("skills", filePath);
  return withFileLock(target, async () => readFile(target, "utf8"));
}

export async function writeSkillPrompt(filePath: string, content: string): Promise<void> {
  const target = resolveProjectFile("skills", filePath);
  await withFileLock(target, async () => {
    await mkdir(dirname(target), { recursive: true });
    const tempPath = join(dirname(target), `.${randomUUID()}.tmp`);
    try {
      await writeFile(tempPath, content, "utf8");
      await commitTempFile(tempPath, target);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  });
}
