export const queryProductsInput = {
  type: "object",
  properties: {
    keyword: { type: "string", description: "商品名或 SKU 关键词" },
    category: { type: "string" },
    allergen: { type: "string", description: "需要排除或检查的过敏原" },
    status: { type: "string", enum: ["on_sale", "sold_out", "off_shelf"] },
  },
};

export const queryProductsOutput = {
  type: "object",
  properties: {
    items: { type: "array" },
    count: { type: "number" },
  },
};

export const queryActivitiesInput = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["draft", "live", "ended"] },
    productId: { type: "string" },
  },
};

export const queryCouponsInput = {
  type: "object",
  properties: {
    code: { type: "string" },
    productId: { type: "string" },
    newCustomerOnly: { type: "boolean" },
  },
};

export const calculatePriceInput = {
  type: "object",
  required: ["items"],
  properties: {
    userId: { type: "string" },
    couponCode: { type: "string" },
    activityId: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["sku", "quantity"],
        properties: {
          sku: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
        },
      },
    },
  },
};

export const calculatePriceOutput = {
  type: "object",
  properties: {
    subtotalFen: { type: "number" },
    activityDiscountFen: { type: "number" },
    couponDiscountFen: { type: "number" },
    payableFen: { type: "number" },
    breakdown: { type: "array" },
  },
};

export const queryOrdersInput = {
  type: "object",
  properties: {
    orderId: { type: "string" },
    userId: { type: "string" },
  },
};

export const queryLogisticsInput = {
  type: "object",
  properties: {
    orderId: { type: "string" },
    trackingNo: { type: "string" },
  },
};
