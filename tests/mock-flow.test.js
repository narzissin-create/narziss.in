import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/services/api.js";
import { products } from "../src/services/catalog.js";
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => memory.get(k) || null,
  setItem: (k, v) => memory.set(k, v),
};
test("mock register, cart, COD, delivery, review, cancellation ownership flow", async () => {
  const user = await api.register({
    email: "demo@example.com",
    phone: "9876543210",
    otp: "123456",
  });
  const p = products[0],
    v = p.variants.find((v) => v.size === "M");
  assert.equal(user.email, "demo@example.com");
  await api.add(v.id);
  assert.equal((await api.cart())[0].quantity, 1);
  await api.add(v.id);
  assert.equal((await api.cart())[0].quantity, 2);
  await assert.rejects(api.add(v.id), /Maximum/); // fixture has stock 2
  const address = await api.saveAddress({
    name: "Demo",
    line: "Demo address",
    city: "Indore",
    state: "Madhya Pradesh",
    pin: "452001",
    phone: "9876543210",
  });
  const order = await api.placeOrder({
    lines: [{ variantId: v.id, quantity: 1 }],
    address,
    method: "cod",
  });
  assert.equal(order.paymentStatus, "pay-on-delivery");
  await assert.rejects(api.review(p.id, 5, "Nice"), /after delivery/);
  await api.demoDeliver(order.id);
  await api.review(p.id, 5, "Nice");
  await api.review(p.id, 4, "Updated");
  assert.equal((await api.reviews(p.id)).length, 1);
  assert.equal((await api.reviews(p.id))[0].rating, 4);
  await api.cancel(order.id);
  assert.equal((await api.orders())[0].items[0].status, "delivered");
  await api.clearPurchased([{ variantId: v.id, quantity: 1 }]);
  assert.equal((await api.cart())[0].quantity, 1);
  api.logout();
  await assert.rejects(api.orders(), /log in/);
});
test("failed online payment changes method on same order", async () => {
  await api.login({ email: "demo@example.com" });
  const v = products[1].variants.find((v) => v.stock > 0);
  const address = (await api.addresses())[0];
  const o = await api.placeOrder({
    lines: [{ variantId: v.id, quantity: 1 }],
    address,
    method: "upi",
  });
  await api.paymentStatus(o.id, "failed");
  const retry = await api.placeOrder({
    orderId: o.id,
    lines: [{ variantId: v.id, quantity: 1 }],
    address,
    method: "cod",
  });
  assert.equal(retry.id, o.id);
  assert.equal(retry.paymentStatus, "pay-on-delivery");
});
test("online cart stays intact until success and idempotency prevents duplicates", async () => {
  const user = await api.register({
    email: "payment@example.com",
    phone: "9876543211",
    otp: "123456",
  });
  assert.equal(user.email, "payment@example.com");
  const variant = products[2].variants.find((item) => item.stock > 0);
  await api.add(variant.id, 2);
  const address = await api.saveAddress({
    name: "Payment Demo",
    line: "Demo address",
    city: "Indore",
    state: "Madhya Pradesh",
    pin: "452001",
    phone: "9876543211",
  });
  const payload = {
    lines: [{ variantId: variant.id, quantity: 1 }],
    address,
    method: "upi",
    checkoutKind: "cart",
    idempotencyKey: "same-attempt",
    upiProvider: "BHIM",
  };
  const order = await api.placeOrder(payload);
  const duplicate = await api.placeOrder(payload);
  assert.equal(duplicate.id, order.id);
  assert.equal((await api.cart())[0].quantity, 2);
  await api.paymentStatus(order.id, "failed");
  assert.equal((await api.cart())[0].quantity, 2);
  await api.paymentStatus(order.id, "pending");
  assert.equal((await api.cart())[0].quantity, 2);
  await api.paymentStatus(order.id, "successful");
  assert.equal((await api.cart())[0].quantity, 1);
  await api.paymentStatus(order.id, "successful");
  assert.equal((await api.cart())[0].quantity, 1);
});
test("COD cart clears purchased lines while Buy Now never changes cart", async () => {
  await api.login({ email: "payment@example.com" });
  const cartVariant = products[3].variants.find((item) => item.stock > 0);
  const buyVariant = products[4].variants.find((item) => item.stock > 0);
  await api.add(cartVariant.id);
  const beforeBuy = await api.cart();
  const address = (await api.addresses())[0];
  await api.placeOrder({
    lines: [{ variantId: buyVariant.id, quantity: 1 }],
    address,
    method: "cod",
    checkoutKind: "buy",
    idempotencyKey: "buy-now-attempt",
  });
  assert.deepEqual(await api.cart(), beforeBuy);
  await api.placeOrder({
    lines: [{ variantId: cartVariant.id, quantity: 1 }],
    address,
    method: "cod",
    checkoutKind: "cart",
    idempotencyKey: "cod-cart-attempt",
  });
  assert.equal(
    (await api.cart()).some((line) => line.variantId === cartVariant.id),
    false,
  );
});
