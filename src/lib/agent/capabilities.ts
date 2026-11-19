export const PRICE_TOOLS = ["calculate_price", "query_coupons"] as const;
export const ORDER_TOOLS = ["query_orders"] as const;
export const LOGISTICS_TOOLS = ["query_logistics"] as const;
export const RISK_SKILLS = ["risk-check"] as const;

export function inferMandatoryCapabilities(userInput: string): string[] {
  const caps = new Set<string>();
  if (/价格|多少钱|券|优惠|满减|算价|折扣/.test(userInput)) caps.add("price");
  if (/订单|售后|退款|退货/.test(userInput)) caps.add("order");
  if (/物流|快递|运单|到哪|到货|签收/.test(userInput)) caps.add("logistics");
  if (/中奖|转账|验证码|兑奖|诈骗|陌生链接/.test(userInput)) caps.add("risk");
  if (/推荐|买什么|送礼|礼盒|零食|口味/.test(userInput)) caps.add("recommend");
  if (/过敏|小孩|儿童|孕妇/.test(userInput)) caps.add("allergy");
  return [...caps];
}

export function extractOrderId(userInput: string) {
  const match = userInput.match(/ord_[a-zA-Z0-9_]+/);
  return match?.[0];
}

/** 常见误匹配：商品字段名 / 协议词，不是券码 */
const COUPON_CODE_DENYLIST = new Set([
  "SKU",
  "API",
  "URL",
  "URI",
  "HTTP",
  "HTTPS",
  "JSON",
  "POST",
  "GET",
  "PUT",
  "PDF",
  "VIP",
  "FAQ",
  "ID",
]);

/**
 * 从用户话里抽券码。真实券多为字母+数字（如 XINREN8）。
 * 旧正则 `\b[A-Z]{3,}\d*\b` 会把「SKU」误当成券码，导致 calculate_price 报「找不到券码：SKU」。
 */
export function extractCouponCode(userInput: string) {
  const matches = userInput.match(/\b[A-Z]{2,}[0-9][A-Z0-9]*\b/g) ?? [];
  for (const candidate of matches) {
    if (COUPON_CODE_DENYLIST.has(candidate)) continue;
    return candidate;
  }
  return undefined;
}
