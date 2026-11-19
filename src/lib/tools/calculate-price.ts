import "server-only";

import { readJson } from "@/lib/store";
import type { Activity, Coupon, Product, User } from "@/lib/types";
import type { PriceItemInput, ToolResult } from "@/lib/tools/types";

function couponAppliesToProduct(coupon: Coupon, productId: string) {
  return coupon.applicableProductIds.includes("*") || coupon.applicableProductIds.includes(productId);
}

export async function calculatePrice(input: {
  userId?: string;
  couponCode?: string;
  activityId?: string;
  items?: PriceItemInput[];
}): Promise<
  ToolResult<{
    subtotalFen: number;
    activityDiscountFen: number;
    couponDiscountFen: number;
    payableFen: number;
    breakdown: {
      sku: string;
      name: string;
      quantity: number;
      unitPriceFen: number;
      lineFen: number;
    }[];
    notes: string[];
  }>
> {
  try {
    const items = input.items ?? [];
    if (items.length === 0) {
      return {
        ok: false,
        toolId: "calculate_price",
        error: { code: "EMPTY_ITEMS", message: "至少需要一件商品才能算价" },
      };
    }

    const [products, activities, coupons, users] = await Promise.all([
      readJson<Product[]>("products.json"),
      readJson<Activity[]>("activities.json"),
      readJson<Coupon[]>("coupons.json"),
      readJson<User[]>("users.json"),
    ]);

    const notes: string[] = [];
    const breakdown: {
      sku: string;
      name: string;
      quantity: number;
      unitPriceFen: number;
      lineFen: number;
    }[] = [];

    for (const item of items) {
      const product = products.find((entry) => entry.sku === item.sku);
      if (!product) {
        return {
          ok: false,
          toolId: "calculate_price",
          error: { code: "SKU_NOT_FOUND", message: `找不到 SKU：${item.sku}` },
        };
      }
      if (item.quantity < 1) {
        return {
          ok: false,
          toolId: "calculate_price",
          error: { code: "INVALID_QTY", message: `${item.sku} 数量必须大于 0` },
        };
      }
      const lineFen = product.priceFen * item.quantity;
      breakdown.push({
        sku: product.sku,
        name: product.name,
        quantity: item.quantity,
        unitPriceFen: product.priceFen,
        lineFen,
      });
    }

    const subtotalFen = breakdown.reduce((sum, line) => sum + line.lineFen, 0);
    let activityDiscountFen = 0;
    const activity = input.activityId
      ? activities.find((item) => item.id === input.activityId)
      : activities.find((item) => item.status === "live");

    if (activity && activity.status === "live") {
      const eligible = breakdown.some((line) => {
        const product = products.find((entry) => entry.sku === line.sku);
        return product ? activity.productIds.includes(product.id) : false;
      });
      if (eligible && subtotalFen >= activity.thresholdFen) {
        activityDiscountFen =
          activity.discountKind === "percent"
            ? Math.round((subtotalFen * activity.discountValue) / 100)
            : activity.discountValue;
        notes.push(`已应用活动「${activity.name}」`);
      } else if (eligible) {
        notes.push(`活动「${activity.name}」未满门槛 ${activity.thresholdFen / 100} 元`);
      }
    }

    let couponDiscountFen = 0;
    if (input.couponCode) {
      const coupon = coupons.find((item) => item.code.toUpperCase() === input.couponCode!.toUpperCase());
      if (!coupon) {
        return {
          ok: false,
          toolId: "calculate_price",
          error: { code: "COUPON_NOT_FOUND", message: `找不到券码：${input.couponCode}` },
        };
      }
      if (coupon.status !== "active") {
        notes.push(`优惠券 ${coupon.code} 当前状态为${coupon.status}，未抵扣`);
      } else {
        const user = input.userId ? users.find((item) => item.id === input.userId) : undefined;
        if (coupon.newCustomerOnly && user && !user.isNewCustomer) {
          notes.push("该券仅新客可用，当前用户不是新客");
        } else {
          const eligibleLines = breakdown.filter((line) => {
            const product = products.find((entry) => entry.sku === line.sku);
            return product ? couponAppliesToProduct(coupon, product.id) : false;
          });
          const eligibleFen = eligibleLines.reduce((sum, line) => sum + line.lineFen, 0);
          const afterActivity = subtotalFen - activityDiscountFen;
          if (!coupon.stackWithActivity && activityDiscountFen > 0) {
            notes.push("该券不可与活动叠加");
          } else if (eligibleFen < coupon.minSpendFen && afterActivity < coupon.minSpendFen) {
            notes.push(`未满券门槛 ${coupon.minSpendFen / 100} 元`);
          } else {
            const base = coupon.stackWithActivity ? afterActivity : eligibleFen;
            couponDiscountFen =
              coupon.kind === "percent"
                ? Math.round((base * (coupon.percentOff ?? 0)) / 100)
                : coupon.discountFen ?? 0;
            notes.push(`已应用优惠券 ${coupon.code}`);
          }
        }
      }
    }

    const payableFen = Math.max(0, subtotalFen - activityDiscountFen - couponDiscountFen);
    return {
      ok: true,
      toolId: "calculate_price",
      data: {
        subtotalFen,
        activityDiscountFen,
        couponDiscountFen,
        payableFen,
        breakdown,
        notes,
      },
    };
  } catch (error) {
    return {
      ok: false,
      toolId: "calculate_price",
      error: { code: "PRICE_FAILED", message: error instanceof Error ? error.message : "算价失败" },
    };
  }
}
