import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { listEnabledTools, listTools } from "@/lib/tools/registry";

export async function GET(request: Request) {
  try {
    const enabledOnly = new URL(request.url).searchParams.get("enabled") === "1";
    const tools = enabledOnly ? await listEnabledTools() : await listTools();
    return NextResponse.json({ ok: true, tools });
  } catch (error) {
    return handleRouteError(error);
  }
}
