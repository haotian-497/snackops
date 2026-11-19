import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { LlmCallError, LlmConfigError } from "@/lib/llm/errors";
import { UnsafePathError } from "@/lib/safe-path";

export function jsonOk<T extends Record<string, unknown>>(body: T, status = 200) {
  return NextResponse.json({ ok: true, ...body }, { status });
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

export class RouteError extends Error {
  status: number;
  extra?: Record<string, unknown>;

  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = "RouteError";
    this.status = status;
    this.extra = extra;
  }
}

export function handleRouteError(error: unknown) {
  if (error instanceof RouteError) {
    return jsonError(error.status, error.message, error.extra);
  }
  if (error instanceof LlmConfigError) {
    return jsonError(400, error.message, {
      code: error.code,
      provider: error.provider,
      hint: error.hint,
    });
  }
  if (error instanceof LlmCallError) {
    const status =
      error.code === "LLM_AUTH_FAILED" ? 401 : error.code === "LLM_TIMEOUT" ? 504 : 400;
    return jsonError(status, error.message, {
      code: error.code,
      provider: error.provider,
      hint: error.hint,
      upstreamStatus: error.status,
    });
  }
  if (error instanceof UnsafePathError) {
    return jsonError(400, error.message);
  }
  if (error instanceof ZodError) {
    return jsonError(400, "输入不合法", { issues: error.issues });
  }
  if (error instanceof Error) {
    return jsonError(500, error.message);
  }
  return jsonError(500, "未知错误");
}
