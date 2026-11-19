export type ProductStatus = "on_sale" | "sold_out" | "off_shelf";

export type NutritionInfo = {
  serving: string;
  energyKcal: number;
  sugarG: number;
  proteinG: number;
  fatG: number;
  sodiumMg: number;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  flavor: string;
  priceFen: number;
  stock: number;
  status: ProductStatus;
  tags: string[];
  ingredients: string[];
  allergens: string[];
  nutrition: NutritionInfo;
  updatedAt: string;
};

export type ActivityStatus = "draft" | "live" | "ended";
export type DiscountKind = "amount" | "percent";

export type Activity = {
  id: string;
  name: string;
  productIds: string[];
  rule: string;
  thresholdFen: number;
  discountKind: DiscountKind;
  discountValue: number;
  startsAt: string;
  endsAt: string;
  status: ActivityStatus;
};

export type CouponStatus = "active" | "paused" | "expired";
export type CouponKind = "amount" | "percent";

export type Coupon = {
  id: string;
  code: string;
  name: string;
  kind: CouponKind;
  discountFen?: number;
  percentOff?: number;
  minSpendFen: number;
  remaining: number;
  status: CouponStatus;
  expiresAt: string;
  applicableProductIds: string[];
  newCustomerOnly: boolean;
  stackWithActivity: boolean;
};
