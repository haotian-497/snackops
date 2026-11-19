import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractCouponCode } from "./capabilities.ts";

describe("extractCouponCode", () => {
  it("extracts real coupon codes with digits", () => {
    assert.equal(extractCouponCode("帮我用一下 XINREN8 算价"), "XINREN8");
    assert.equal(extractCouponCode("有 GOLD12 吗"), "GOLD12");
  });

  it("does not treat SKU or field names as coupon codes", () => {
    assert.equal(extractCouponCode("按 SKU 算一下价格"), undefined);
    assert.equal(extractCouponCode("看看这个 SKU KL-SPICY-80G 多少钱"), undefined);
  });
});
