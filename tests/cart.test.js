import test from "node:test";
import assert from "node:assert/strict";
import { addLine, totals, filterProducts, rankRelatedProducts, validateCoupon } from "../src/services/logic.js";
test("merges same variant and rejects quantity above three", () => {
  const v = { id: "m", stock: 8 };
  const c = addLine(addLine([], v), v);
  assert.equal(c.length, 1);
  assert.equal(c[0].quantity, 2);
  assert.throws(() => addLine(c, v, 2), /Maximum/);
});
test("different sizes remain separate and stock caps quantity", () => {
  let c = addLine([], { id: "m", stock: 8 });
  c = addLine(c, { id: "l", stock: 1 });
  assert.equal(c.length, 2);
  assert.throws(() => addLine(c, { id: "l", stock: 1 }), /Maximum/);
});
test("tax-inclusive price is not charged twice", () => {
  const result = totals([{ product: { price: 118 }, quantity: 2 }], {
    shipping: 20,
    gstPercent: 18,
    pricesIncludeGst: true,
  });
  assert.equal(result.total, 256);
  assert.ok(Math.abs(result.gst - 36) < 0.001);
});
test("tax-exclusive calculation and item count", () => {
  const t = totals([{ product: { price: 100 }, quantity: 3 }], {
    shipping: 40,
    gstPercent: 5,
    pricesIncludeGst: false,
  });
  assert.equal(t.total, 355);
  assert.equal(t.count, 3);
});
test("filters combine and price sorting only orders results", () => {
  const items = [
    { price: 200, material: "cotton", colour: "black" },
    { price: 100, material: "cotton", colour: "black" },
    { price: 50, material: "linen", colour: "black" },
  ];
  assert.deepEqual(
    filterProducts(items, {
      material: "cotton",
      colour: "black",
      sort: "asc",
    }).map((p) => p.price),
    [100, 200],
  );
});

test("shop-more ranking is related, unique, stable, capped, and excludes current product", () => {
  const current = { id: "current", slug: "current-item", category: "shirts", type: "upper", tags: ["linen"] };
  const items = [
    current,
    { id: "related-tag", slug: "related-tag", category: "other", type: "bottom", tags: ["LINEN"] },
    { id: "related-category", slug: "related-category", category: "shirts", type: "upper", tags: [] },
    { id: "fill", slug: "fill", category: "other", type: "bottom", tags: [] },
    { id: "fill", slug: "duplicate", category: "shirts", type: "upper", tags: ["linen"] },
  ];
  const first = rankRelatedProducts(items, current, 10);
  const second = rankRelatedProducts(items, current, 10);
  assert.deepEqual(first, second);
  assert.equal(first[0].id, "related-category");
  assert.equal(first.some((product) => product.id === current.id), false);
  assert.equal(new Set(first.map((product) => product.id)).size, first.length);
  assert.ok(first.length <= 10);
});

test("coupon validation and order totals with discount & free shipping", () => {
  const invalid = validateCoupon("INVALID");
  assert.equal(invalid.valid, false);

  const coupon10 = validateCoupon("FIRST10", 2000);
  assert.equal(coupon10.valid, true);
  assert.equal(coupon10.discount, 200);

  const tWithDiscount = totals([{ product: { price: 2000 }, quantity: 1 }], {
    shipping: 100,
    gstPercent: 0,
    pricesIncludeGst: true,
  }, "FIRST10");

  assert.equal(tWithDiscount.subtotal, 2000);
  assert.equal(tWithDiscount.discount, 200);
  assert.equal(tWithDiscount.shipping, 0); // Above 1999 free shipping threshold
  assert.equal(tWithDiscount.total, 1800);
  assert.equal(tWithDiscount.qualifiesForFreeShipping, true);
});
