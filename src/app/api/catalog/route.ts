import { NextResponse } from "next/server";

import { CATALOG_TYPES, loadCatalog, type CatalogType } from "@/lib/catalog";
import { handleRouteError, jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const type = new URL(request.url).searchParams.get("type") ?? "products";
    if (!CATALOG_TYPES.includes(type as CatalogType)) {
      return jsonError(400, "未知目录类型", { types: CATALOG_TYPES });
    }
    const catalog = await loadCatalog(type as CatalogType);
    return NextResponse.json({ ok: true, catalog });
  } catch (error) {
    return handleRouteError(error);
  }
}
