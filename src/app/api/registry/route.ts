import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { listEnabledSkills } from "@/lib/skills/registry";
import { listEnabledTools } from "@/lib/tools/registry";

export async function GET() {
  try {
    const [skills, tools] = await Promise.all([listEnabledSkills(), listEnabledTools()]);
    return NextResponse.json({
      ok: true,
      skills,
      tools,
      skillCount: skills.length,
      toolCount: tools.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
