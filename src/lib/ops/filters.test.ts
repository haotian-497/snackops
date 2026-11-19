import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseOpsFilters, serializeOpsFilters } from "./filters.ts";

describe("ops filters url", () => {
  it("parses traffic range dedupe from search params", () => {
    const filters = parseOpsFilters(new URLSearchParams("traffic=eval&range=today&dedupe=1"));
    assert.deepEqual(filters, { traffic: "eval", range: "today", dedupe: true });
  });

  it("falls back to defaults on invalid values", () => {
    const filters = parseOpsFilters({ traffic: "nope", range: "week", dedupe: "yes" });
    assert.equal(filters.traffic, "business");
    assert.equal(filters.range, "7d");
    assert.equal(filters.dedupe, false);
  });

  it("serializes and omits default dedupe off", () => {
    assert.equal(serializeOpsFilters({ traffic: "business", range: "7d", dedupe: false }), "traffic=business&range=7d");
    assert.equal(
      serializeOpsFilters({ traffic: "all", range: "all", dedupe: true }),
      "traffic=all&range=all&dedupe=1",
    );
  });
});
