import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/http";
import { diffToolVersion } from "@/lib/tools/registry";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const from = new URL(request.url).searchParams.get("from");
    if (!from) return jsonError(400, "缺少 from 版本 id");
    const diff = await diffToolVersion(decodeURIComponent(id), from);
    return NextResponse.json({ ok: true, diff });
  } catch (error) {
    return handleRouteError(error);
  }
}
