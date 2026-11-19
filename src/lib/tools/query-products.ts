import "server-only";

import { readJson } from "@/lib/store";
import type { Product } from "@/lib/types";
import type { ToolResult } from "@/lib/tools/types";

export async function queryProducts(input: {
  keyword?: string;
  category?: string;
  allergen?: string;
  status?: Product["status"];
}): Promise<ToolResult<{ items: Product[]; count: number }>> {
  try {
    const products = await readJson<Product[]>("products.json");
    const keyword = input.keyword?.trim().toLowerCase();
    const items = products.filter((product) => {
      if (input.status && product.status !== input.status) return false;
      if (input.category && product.category !== input.category) return false;
      if (input.allergen && !product.allergens.includes(input.allergen)) return false;
      if (keyword) {
        const hay = `${product.name} ${product.sku} ${product.flavor} ${product.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
    return { ok: true, toolId: "query_products", data: { items, count: items.length } };
  } catch (error) {
    return {
      ok: false,
      toolId: "query_products",
      error: { code: "PRODUCT_QUERY_FAILED", message: error instanceof Error ? error.message : "商品查询失败" },
    };
  }
}
