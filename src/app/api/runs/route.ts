import { NextResponse } from "next/server";

import { listRunRecords } from "@/lib/agent/runs";
import { handleRouteError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const runs = await listRunRecords({ summary: true });
    return NextResponse.json({
      ok: true,
      total: runs.length,
      runs: runs.slice(offset, offset + limit),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
