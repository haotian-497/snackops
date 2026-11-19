import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { hydrateSkills, listEnabledSkills, listSkills } from "@/lib/skills/registry";

export async function GET(request: Request) {
  try {
    const enabledOnly = new URL(request.url).searchParams.get("enabled") === "1";
    const skills = enabledOnly
      ? await listEnabledSkills()
      : await hydrateSkills(await listSkills());
    return NextResponse.json({ ok: true, skills });
  } catch (error) {
    return handleRouteError(error);
  }
}
