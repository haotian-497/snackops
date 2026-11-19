import "server-only";

import { isAbsolute, relative, resolve, sep } from "node:path";

import { getProjectRoot } from "@/lib/paths";

export class UnsafePathError extends Error {
  constructor(message = "非法路径：已拒绝路径穿越或项目外写入") {
    super(message);
    this.name = "UnsafePathError";
  }
}

function assertRelativeSegment(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/").trim();
  if (!normalized) {
    throw new UnsafePathError("路径不能为空");
  }
  if (normalized.includes("\0")) {
    throw new UnsafePathError("路径包含非法字符");
  }
  if (isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
    throw new UnsafePathError("不允许绝对路径");
  }
  if (normalized.split("/").some((part) => part === "..")) {
    throw new UnsafePathError("不允许使用 ../ 穿越目录");
  }
  return normalized;
}

export function resolveProjectFile(rootDirName: "skills" | "tools", filePath: string): string {
  const stripped = filePath.replaceAll("\\", "/").trim().startsWith(`${rootDirName}/`)
    ? filePath.replaceAll("\\", "/").trim().slice(rootDirName.length + 1)
    : filePath;
  const safeRelative = assertRelativeSegment(stripped);
  const root = resolve(getProjectRoot(), rootDirName);
  const target = resolve(root, safeRelative);
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new UnsafePathError(`试图写入 ${rootDirName} 目录之外`);
  }
  if (target !== root && !target.startsWith(root + sep)) {
    throw new UnsafePathError(`试图写入 ${rootDirName} 目录之外`);
  }
  return target;
}

export function getSkillsRoot(): string {
  return resolve(getProjectRoot(), "skills");
}
