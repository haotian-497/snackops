import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http";
import { annotationsToCsv, listAnnotations } from "@/lib/ops/annotations";

export async function GET() {
  try {
    const annotations = await listAnnotations();
    return new NextResponse(await annotationsToCsv(annotations), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"annotations.csv\"",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
