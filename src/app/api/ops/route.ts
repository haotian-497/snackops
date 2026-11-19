import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { loadOpsSnapshot } from "@/lib/ops/metrics";

export async function GET() {
  try {
    const snapshot = await loadOpsSnapshot();
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    return handleRouteError(error);
  }
}
