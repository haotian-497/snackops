import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { withFileLock } from "@/lib/file-lock";
import { getDataDir, getDataFilePath } from "@/lib/paths";

export type StoreWriteOptions = {
  /**
   * Test-only hook. Invoked after the temp file is written and before commit.
   * Throwing here must leave the previous committed file intact.
   */
  beforeCommit?: () => Promise<void> | void;
};

export type JsonRecord = Record<string, unknown> | unknown[];

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function parseJsonFile<T>(path: string): Promise<T> {
  const raw = await readTextFile(path);
  return JSON.parse(raw) as T;
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
      // Keep the backup if restore also fails so operators can recover.
    }
    throw error;
  }
}

async function writeJsonUnlocked<T>(
  fileName: string,
  value: T,
  options?: StoreWriteOptions,
): Promise<void> {
  const targetPath = getDataFilePath(fileName);
  await mkdir(dirname(targetPath), { recursive: true });

  const tempPath = join(
    dirname(targetPath),
    `.${fileName}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await options?.beforeCommit?.();
    await commitTempFile(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export function resolveStoreFile(fileName: string): string {
  return getDataFilePath(fileName);
}

export function resolveStoreDir(): string {
  return getDataDir();
}

export async function readJson<T>(fileName: string): Promise<T> {
  const path = getDataFilePath(fileName);
  return withFileLock(path, async () => parseJsonFile<T>(path));
}

export async function writeJson<T>(
  fileName: string,
  value: T,
  options?: StoreWriteOptions,
): Promise<void> {
  const path = getDataFilePath(fileName);
  await withFileLock(path, async () => {
    await writeJsonUnlocked(fileName, value, options);
  });
}

export async function updateJson<T>(
  fileName: string,
  updater: (current: T) => T | Promise<T>,
  options?: StoreWriteOptions,
): Promise<T> {
  const path = getDataFilePath(fileName);
  return withFileLock(path, async () => {
    const current = await parseJsonFile<T>(path);
    const next = await updater(current);
    await writeJsonUnlocked(fileName, next, options);
    return next;
  });
}

export async function tryReadJson<T>(fileName: string): Promise<T | null> {
  try {
    return await readJson<T>(fileName);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function ensureJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  const existing = await tryReadJson<T>(fileName);
  if (existing !== null) {
    return existing;
  }
  await writeJson(fileName, fallback);
  return fallback;
}

