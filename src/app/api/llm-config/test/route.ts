import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { testLlmConnection } from "@/lib/llm/public";
import { llmTestSchema } from "@/lib/schemas/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = llmTestSchema.parse(body && typeof body === "object" ? body : {});
    const result = await testLlmConnection(input.provider);
    return NextResponse.json(
      {
        ok: result.ok,
        result,
        message: result.message,
      },
      { status: result.ok ? 200 : 400 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
