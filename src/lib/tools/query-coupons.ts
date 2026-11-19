import "server-only";

import { readJson } from "@/lib/store";
import type { Coupon } from "@/lib/types";
import type { ToolResult } from "@/lib/tools/types";

export async function queryCoupons(input: {
  code?: string;
  productId?: string;
  newCustomerOnly?: boolean;
}): Promise<ToolResult<{ items: Coupon[]; count: number }>> {
  try {
    const coupons = await readJson<Coupon[]>("coupons.json");
    const items = coupons.filter((coupon) => {
      if (input.code && coupon.code.toUpperCase() !== input.code.toUpperCase()) return false;
      if (input.newCustomerOnly !== undefined && coupon.newCustomerOnly !== input.newCustomerOnly) return false;
      if (
        input.productId &&
        !coupon.applicableProductIds.includes("*") &&
        !coupon.applicableProductIds.includes(input.productId)
      ) {
        return false;
      }
      return true;
    });
    return { ok: true, toolId: "query_coupons", data: { items, count: items.length } };
  } catch (error) {
    return {
      ok: false,
      toolId: "query_coupons",
      error: { code: "COUPON_QUERY_FAILED", message: error instanceof Error ? error.message : "优惠券查询失败" },
    };
  }
}
