import "server-only";

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

function hasProjectMarkers(dir: string): boolean {
  return existsSync(join(dir, "package.json")) && existsSync(join(dir, "data"));
}

export function getProjectRoot(): string {
  const fromEnv = process.env.SNACKOPS_ROOT?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }

  let current = process.cwd();
  while (true) {
    if (hasProjectMarkers(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

export function getDataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(getProjectRoot(), fromEnv);
  }
  return join(getProjectRoot(), "data");
}

export function getDataFilePath(fileName: string): string {
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    throw new Error("非法数据文件名：不允许路径分隔符");
  }
  if (!fileName.endsWith(".json")) {
    throw new Error("数据文件必须以 .json 结尾");
  }
  return join(getDataDir(), fileName);
}
