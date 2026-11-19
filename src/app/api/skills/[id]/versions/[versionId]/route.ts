import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { getSkillVersion } from "@/lib/skills/registry";

type RouteContext = { params: Promise<{ id: string; versionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, versionId } = await context.params;
    const snapshot = await getSkillVersion(versionId, decodeURIComponent(id));
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return handleRouteError(error);
  }
}
