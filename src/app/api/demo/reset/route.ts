import { spawn } from "node:child_process";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { isDemoResetAllowed } from "@/lib/llm/secrets";
import { getProjectRoot } from "@/lib/paths";

function runDemoResetScript() {
  const scriptPath = join(getProjectRoot(), "scripts", "demo-reset.mjs");
  return new Promise<{ ok: true }>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: getProjectRoot(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      reject(new Error(stderr.trim() || `demo:reset 退出码 ${code ?? "unknown"}`));
    });
  });
}

export async function GET() {
  if (!isDemoResetAllowed()) {
    return jsonError(404, "未找到接口", { code: "RESET_DISABLED" });
  }
  return NextResponse.json({
    ok: true,
    allowDemoReset: true,
    hint: "POST 此接口可恢复 Demo 种子数据；也可用 pnpm demo:reset。",
  });
}

export async function POST() {
  try {
    if (!isDemoResetAllowed()) {
      return jsonError(404, "未找到接口", { code: "RESET_DISABLED" });
    }
    await runDemoResetScript();
    return NextResponse.json({
      ok: true,
      message: "Demo 数据已恢复到已知初始状态（业务商品等基础数据已保留）",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
