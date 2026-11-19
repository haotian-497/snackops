export function sampleOutputFor(toolId: string): Record<string, unknown> {
  switch (toolId) {
    case "query_products":
      return { count: 1, items: [{ sku: "KL-SPICY-80G", name: "香辣海带结 80g", priceFen: 1290 }] };
    case "query_activities":
      return { count: 1, items: [{ id: "act_mid_autumn", name: "中秋解馋满减", status: "live" }] };
    case "query_coupons":
      return { count: 1, items: [{ code: "XINREN8", newCustomerOnly: true }] };
    case "calculate_price":
      return { subtotalFen: 4360, activityDiscountFen: 800, couponDiscountFen: 800, payableFen: 2760 };
    case "query_orders":
      return { count: 1, items: [{ id: "ord_20260906_10021", logisticsStatus: "in_transit" }] };
    case "query_logistics":
      return { count: 1, items: [{ orderId: "ord_20260906_10021", carrier: "中通" }] };
    default:
      return { note: "无预置示例，请运行服务端测试" };
  }
}
