import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { diffSkillVersions } from "@/lib/skills/registry";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const diff = await diffSkillVersions(
      decodeURIComponent(id),
      url.searchParams.get("from") ?? undefined,
      url.searchParams.get("to") ?? undefined,
    );
    return NextResponse.json({ ok: true, diff });
  } catch (error) {
    return handleRouteError(error);
  }
}
