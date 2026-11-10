import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/services/api.js";
import {
  readStorageJson,
  readStorageText,
  removeStorage,
  writeStorageJson,
  writeStorageText,
} from "../src/services/storage.js";

const memory = new Map();
const workingStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};
globalThis.localStorage = workingStorage;

test("corrupted and outdated mock database shapes fail safely", async () => {
  memory.set("narziss-demo-v1", "{not-json");
  assert.equal(api.restore({ id: "stale-user" }), false);
  await assert.rejects(api.cart(), /log in/i);

  const user = { id: "shape-user", email: "shape@example.com" };
  memory.set(
    "narziss-demo-v1",
    JSON.stringify({
      users: [user, null],
      carts: { [user.id]: { invalid: true } },
      addresses: null,
      orders: [null, { invalid: true }],
      reviews: [
        null,
        { id: "bad", userId: "user", productId: "p-0-0", rating: null },
      ],
      obsoleteField: "ignored",
    }),
  );
  assert.equal(api.restore(user), true);
  assert.deepEqual(await api.cart(), []);
  assert.deepEqual(await api.addresses(), []);
  assert.deepEqual(await api.orders(), []);
  assert.deepEqual(await api.reviews("p-0-0"), []);
  api.logout();
});

test("quota or unavailable mock storage returns a useful mutation error", async () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    },
  };
  await assert.rejects(
    api.register({
      email: "quota@example.com",
      phone: "9876543210",
      otp: "123456",
    }),
    /unavailable or full/i,
  );
  api.logout();
  globalThis.localStorage = workingStorage;
});

test("safe browser-storage helpers tolerate blocked and corrupted storage", () => {
  const blocked = {
    getItem: () => {
      throw new DOMException("Blocked", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("Blocked", "SecurityError");
    },
    removeItem: () => {
      throw new DOMException("Blocked", "SecurityError");
    },
  };
  globalThis.window = { localStorage: blocked, sessionStorage: blocked };
  assert.equal(readStorageText("localStorage", "key", "fallback"), "fallback");
  assert.equal(readStorageJson("sessionStorage", "key", null), null);
  assert.equal(writeStorageText("localStorage", "key", "value"), false);
  assert.equal(writeStorageJson("sessionStorage", "key", { value: 1 }), false);
  assert.equal(removeStorage("localStorage", "key"), false);

  globalThis.window = {
    localStorage: workingStorage,
    sessionStorage: workingStorage,
  };
  memory.set("corrupted-json", "not-json");
  assert.deepEqual(
    readStorageJson("localStorage", "corrupted-json", { safe: true }),
    { safe: true },
  );
  delete globalThis.window;
});
