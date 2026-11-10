import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { products, findVariant } from "../src/services/catalog.js";
import { filterProducts } from "../src/services/logic.js";
import { api } from "../src/services/api.js";

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

test("catalogue pages do not overlap and stale reads can be cancelled", async () => {
  const first = await api.listProducts({}, 0, 12);
  const second = await api.listProducts({}, 12, 12);
  assert.equal(first.items.length, 12);
  assert.equal(second.items.length, 12);
  assert.equal(
    first.items.some((item) => second.items.some((next) => next.id === item.id)),
    false,
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    api.listProducts({ query: "cancelled-query" }, 0, 6, {
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
});

test("variant lookup uses a stable prebuilt index", (t) => {
  const variantId = products.at(-1).variants.at(-1).id;
  const expected = findVariant(variantId);
  const started = performance.now();
  for (let index = 0; index < 100_000; index += 1)
    assert.equal(findVariant(variantId), expected);
  t.diagnostic(
    `100,000 indexed variant lookups: ${(performance.now() - started).toFixed(1)}ms`,
  );
});

test("large in-memory mock filtering remains functionally bounded", (t) => {
  const largeCatalogue = Array.from({ length: 50_000 }, (_, index) => ({
    id: `large-${index}`,
    name: index % 10 === 0 ? `Target shirt ${index}` : `Other shirt ${index}`,
    category: "plain-shirts",
    collections: ["casual"],
    type: "upper",
    material: "cotton",
    colour: "blue",
    isNew: true,
    isTrending: false,
    price: 50_000 - index,
  }));
  const started = performance.now();
  const result = filterProducts(largeCatalogue, {
    query: "target",
    sort: "asc",
  });
  const duration = performance.now() - started;
  assert.equal(result.length, 5_000);
  assert.ok(result[0].price <= result.at(-1).price);
  assert.equal(largeCatalogue.length, 50_000);
  t.diagnostic(`50,000-product filter and sort: ${duration.toFixed(1)}ms`);
});

test("review pages cap automatically rendered records", async () => {
  const user = { id: "performance-user", email: "performance@example.com" };
  localStorage.setItem(
    "narziss-demo-v1",
    JSON.stringify({
      users: [user],
      carts: {},
      addresses: {},
      orders: [],
      reviews: Array.from({ length: 45 }, (_, index) => ({
        id: `review-${index}`,
        userId: index ? `user-${index}` : user.id,
        productId: "p-0-0",
        rating: 5,
        text: `Review ${index}`,
        updatedAt: index,
      })),
    }),
  );
  assert.equal(api.restore(user), true);
  const first = await api.reviewPage("p-0-0", 0, 20);
  const second = await api.reviewPage("p-0-0", 20, 20);
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 20);
  assert.equal(first.total, 45);
  assert.equal(first.averageRating, 5);
  assert.equal(first.items[0].userId, user.id);
});
