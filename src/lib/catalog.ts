import "server-only";

import { readJson } from "@/lib/store";
import type {
  Activity,
  Coupon,
  FaqItem,
  LogisticsTrack,
  Order,
  Product,
  HandoffRule,
  ReturnPolicy,
  Ticket,
  User,
} from "@/lib/types";

export const CATALOG_TYPES = [
  "products",
  "activities",
  "coupons",
  "orders",
  "users",
  "return-policies",
  "faq",
  "logistics",
  "tickets",
  "handoff-rules",
] as const;

export type CatalogType = (typeof CATALOG_TYPES)[number];

export type CatalogSummary = {
  type: CatalogType;
  label: string;
  count: number;
  rows: Record<string, string>[];
};

function money(fen: number) {
  return `¥${(fen / 100).toFixed(2)}`;
}

export async function loadCatalog(type: CatalogType): Promise<CatalogSummary> {
  switch (type) {
    case "products": {
      const items = await readJson<Product[]>("products.json");
      return {
        type,
        label: "商品",
        count: items.length,
        rows: items.map((item) => ({
          名称: item.name,
          分类: item.category,
          口味: item.flavor,
          价格: money(item.priceFen),
          库存: String(item.stock),
          过敏原: item.allergens.join("、") || "无",
          配料: item.ingredients.join("、"),
          糖分: `${item.nutrition.sugarG}g`,
          标签: item.tags.join("、"),
        })),
      };
    }
    case "activities": {
      const items = await readJson<Activity[]>("activities.json");
      return {
        type,
        label: "活动",
        count: items.length,
        rows: items.map((item) => ({
          名称: item.name,
          门槛: money(item.thresholdFen),
          规则: item.rule,
          开始: item.startsAt,
          结束: item.endsAt,
          状态: item.status,
        })),
      };
    }
    case "coupons": {
      const items = await readJson<Coupon[]>("coupons.json");
      return {
        type,
        label: "优惠券",
        count: items.length,
        rows: items.map((item) => ({
          券码: item.code,
          类型: item.kind === "amount" ? "满减金额" : "折扣",
          门槛: money(item.minSpendFen),
          优惠: item.kind === "amount" ? money(item.discountFen ?? 0) : `${item.percentOff}%`,
          有效期: item.expiresAt,
          适用: item.applicableProductIds.join("、"),
          新客: item.newCustomerOnly ? "仅新客" : "不限",
        })),
      };
    }
    case "orders": {
      const items = await readJson<Order[]>("orders.json");
      return {
        type,
        label: "订单",
        count: items.length,
        rows: items.map((item) => ({
          订单号: item.id,
          用户: item.userId,
          商品: item.productName,
          金额: money(item.amountFen),
          物流: item.logisticsStatus,
          售后: item.afterSaleStatus,
        })),
      };
    }
    case "users": {
      const items = await readJson<User[]>("users.json");
      return {
        type,
        label: "用户",
        count: items.length,
        rows: items.map((item) => ({
          用户: item.name,
          新客: item.isNewCustomer ? "新客" : "老客",
          历史订单: String(item.orderIds.length),
          忌口: item.preferences.avoidAllergens.join("、") || "无",
          口味偏好: item.preferences.flavors.join("、"),
        })),
      };
    }
    case "return-policies": {
      const items = await readJson<ReturnPolicy[]>("return-policies.json");
      return {
        type,
        label: "售后政策",
        count: items.length,
        rows: items.map((item) => ({
          品类: item.category,
          破损: item.damageRule,
          缺件: item.missingItemRule,
          退换: item.exchangeRule,
          退款: item.refundRule,
        })),
      };
    }
    case "faq": {
      const items = await readJson<FaqItem[]>("faq.json");
      return {
        type,
        label: "FAQ",
        count: items.length,
        rows: items.map((item) => ({
          问题: item.question,
          分类: item.category,
          Skill: item.skillId,
        })),
      };
    }
    case "logistics": {
      const items = await readJson<LogisticsTrack[]>("logistics.json");
      return {
        type,
        label: "物流",
        count: items.length,
        rows: items.map((item) => ({
          订单: item.orderId,
          承运: item.carrier,
          运单: item.trackingNo,
          状态: item.status,
          最新: item.lastEvent,
        })),
      };
    }
    case "tickets": {
      const items = await readJson<Ticket[]>("tickets.json");
      return {
        type,
        label: "工单",
        count: items.length,
        rows: items.map((item) => ({
          工单: item.id,
          意图: item.intent,
          状态: item.status,
          摘要: item.summary,
          转人工: item.handoffReason || "—",
        })),
      };
    }
    case "handoff-rules": {
      const items = await readJson<HandoffRule[]>("handoff-rules.json");
      return {
        type,
        label: "转人工规则",
        count: items.length,
        rows: items.map((item) => ({
          条件: item.when,
          动作: item.action === "human_takeover" ? "转人工接管" : "继续机器人",
          说明: item.note,
        })),
      };
    }
    default:
      throw new Error("未知目录类型");
  }
}
