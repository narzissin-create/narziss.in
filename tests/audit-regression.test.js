import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/services/api.js";
import { products } from "../src/services/catalog.js";
import {
  validProduct,
  validReviewPage,
  validAddress,
  validOrder,
  validCart,
  addressErrors,
} from "../src/services/validation.js";
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => memory.get(k) || null,
  setItem: (k, v) => memory.set(k, v),
};
const fixture = {
  name: "Fixture",
  phone: "9876543210",
  line: "Fixture address",
  city: "Indore",
  state: "Madhya Pradesh",
  pin: "452001",
};
test("nested malformed adapter records are rejected before rendering", () => {
  assert.equal(validProduct({ ...products[0], variants: [null] }), false);
  assert.equal(validProduct({ ...products[0], images: [{}] }), false);
  assert.equal(
    validProduct({ ...products[0], description: { bad: true } }),
    false,
  );
  assert.equal(validProduct({ ...products[0], type: "unknown" }), false);
  assert.equal(
    validReviewPage({ items: [null], total: 1, averageRating: 5 }),
    false,
  );
  assert.equal(
    validReviewPage({
      items: [{ id: "x", text: { bad: true } }],
      total: 1,
      averageRating: 5,
    }),
    false,
  );
  assert.equal(validAddress({ ...fixture, name: { bad: true } }), false);
  assert.equal(validOrder({ id: "bad", items: null }), false);
  assert.equal(
    validCart([
      { variantId: "x", quantity: 1 },
      { variantId: "x", quantity: 1 },
    ]),
    false,
  );
  assert.doesNotThrow(() =>
    addressErrors({ name: 42, city: [], state: {}, line: null }),
  );
});
test("hydration does not trust stored price, stock, or product overrides", () => {
  const v = products[1].variants.find((v) => v.stock > 0);
  const [line] = api.hydrateLines([
    {
      variantId: v.id,
      quantity: 1,
      stock: 99,
      product: { price: 0, name: { bad: true } },
    },
  ]);
  assert.equal(line.stock, v.stock);
  assert.equal(line.product.price, products[1].price);
});
test("a session switch during a mutation cannot write to another cart", async () => {
  const a = await api.register({
    email: "a@example.test",
    phone: "9876543210",
    otp: "123456",
  });
  const b = await api.register({
    email: "b@example.test",
    phone: "9876543211",
    otp: "123456",
  });
  api.restore(a);
  const v = products[1].variants.find((v) => v.stock > 0);
  const pending = api.add(v.id);
  const rejected = assert.rejects(pending, /session changed/);
  await new Promise((r) => setTimeout(r, 30));
  api.logout();
  api.restore(b);
  await rejected;
  assert.deepEqual(await api.cart(), []);
  api.restore(a);
  assert.deepEqual(await api.cart(), []);
});
test("address and quantity validation rejects corrupted mutation input", async () => {
  await assert.rejects(
    api.saveAddress({ ...fixture, name: { bad: true } }),
    /full name/,
  );
  const v = products[1].variants.find((v) => v.stock > 0);
  await api.add(v.id);
  await assert.rejects(api.quantity(v.id, 1.5), /Invalid quantity/);
  assert.equal((await api.cart())[0].quantity, 1);
});
test("unpaid orders cannot be delivered and cancellation creates no refund", async () => {
  const address = await api.saveAddress(fixture),
    v = products[1].variants.find((v) => v.stock > 0);
  const order = await api.placeOrder({
    lines: [{ variantId: v.id, quantity: 1 }],
    address,
    method: "upi",
    idempotencyKey: "unpaid",
  });
  await assert.rejects(api.demoDeliver(order.id), /Payment must succeed/);
  await api.cancel(order.id);
  const stored = (await api.orders()).find((x) => x.id === order.id);
  assert.equal(stored.refundStatus, undefined);
  await assert.rejects(api.paymentStatus(order.id, "successful"), /cancelled/);
});
test("confirmed payments cannot regress and duplicate checkout lines are rejected", async () => {
  const address = (await api.addresses())[0],
    v = products[2].variants.find((v) => v.stock > 0);
  const line = { variantId: v.id, quantity: 1 };
  await assert.rejects(
    api.placeOrder({ lines: [line, line], address, method: "cod" }),
    /Duplicate/,
  );
  const order = await api.placeOrder({
    lines: [line],
    address,
    method: "card",
    idempotencyKey: "paid",
  });
  await api.paymentStatus(order.id, "successful");
  await assert.rejects(
    api.paymentStatus(order.id, "failed"),
    /confirmed payment/,
  );
});

test("partial cancellation keeps the cancelled variant in cart after payment success", async () => {
  const address = (await api.addresses())[0];
  const a = products[3].variants.find((v) => v.stock > 0),
    b = products[4].variants.find((v) => v.stock > 0);
  await api.add(a.id);
  await api.add(b.id);
  const order = await api.placeOrder({
    lines: [
      { variantId: a.id, quantity: 1 },
      { variantId: b.id, quantity: 1 },
    ],
    address,
    method: "upi",
    checkoutKind: "cart",
    idempotencyKey: "partial-cancel",
  });
  await api.cancel(order.id, a.id);
  await api.paymentStatus(order.id, "successful");
  const cart = await api.cart();
  assert.ok(cart.some((l) => l.variantId === a.id));
  assert.ok(!cart.some((l) => l.variantId === b.id));
});

