import "server-only";

import { readJson } from "@/lib/store";
import type { Order } from "@/lib/types";
import type { ToolResult } from "@/lib/tools/types";

export async function queryOrders(input: {
  orderId?: string;
  userId?: string;
}): Promise<ToolResult<{ items: Order[]; count: number }>> {
  try {
    const orders = await readJson<Order[]>("orders.json");
    const items = orders.filter((order) => {
      if (input.orderId && order.id !== input.orderId) return false;
      if (input.userId && order.userId !== input.userId) return false;
      return true;
    });
    return { ok: true, toolId: "query_orders", data: { items, count: items.length } };
  } catch (error) {
    return {
      ok: false,
      toolId: "query_orders",
      error: { code: "ORDER_QUERY_FAILED", message: error instanceof Error ? error.message : "订单查询失败" },
    };
  }
}
