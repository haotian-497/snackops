export type OrderStatus =
  | "pending_pay"
  | "paid"
  | "shipped"
  | "completed"
  | "after_sale";

export type AfterSaleStatus = "none" | "requested" | "approved" | "rejected" | "refunded";

export type OrderItem = {
  sku: string;
  productName: string;
  quantity: number;
  priceFen: number;
};

export type Order = {
  id: string;
  userId: string;
  sku: string;
  productName: string;
  quantity: number;
  amountFen: number;
  status: OrderStatus;
  logisticsStatus: LogisticsStatus | "pending_ship";
  afterSaleStatus: AfterSaleStatus;
  items: OrderItem[];
  createdAt: string;
};

export type UserPreference = {
  flavors: string[];
  avoidAllergens: string[];
  giftOccasions: string[];
};

export type User = {
  id: string;
  name: string;
  phoneMasked: string;
  memberLevel: "regular" | "silver" | "gold";
  isNewCustomer: boolean;
  orderIds: string[];
  preferences: UserPreference;
  lastOrderAt: string;
};

export type ReturnPolicy = {
  id: string;
  category: string;
  windowHours: number;
  allowUnopened: boolean;
  allowOpened: boolean;
  damageRule: string;
  missingItemRule: string;
  exchangeRule: string;
  refundRule: string;
  note: string;
};

export type LogisticsStatus = "in_transit" | "delivered" | "exception";

export type LogisticsTrack = {
  id: string;
  orderId: string;
  carrier: string;
  trackingNo: string;
  status: LogisticsStatus;
  lastEvent: string;
  updatedAt: string;
};
