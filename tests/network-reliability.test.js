import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  api,
  clearMockTransportFaults,
  setMockTransportFault,
} from "../src/services/api.js";

afterEach(() => clearMockTransportFaults());

test("offline, timeout, and failed mock transport errors remain retryable", async () => {
  setMockTransportFault("product", { type: "offline", delayMs: 1 });
  await assert.rejects(api.product("acid-wash-tees-1"), /offline/i);

  setMockTransportFault("product", { type: "timeout", delayMs: 1 });
  await assert.rejects(api.product("acid-wash-tees-1"), /timed out/i);

  setMockTransportFault("product", {
    type: "failed",
    delayMs: 1,
    message: "Temporary catalogue failure. Please retry.",
  });
  await assert.rejects(api.product("acid-wash-tees-1"), /temporary catalogue/i);

  clearMockTransportFaults();
  assert.equal((await api.product("acid-wash-tees-1")).id, "p-0-0");
});

test("slow mock reads honor abort signals and do not finish stale work", async () => {
  const controller = new AbortController();
  setMockTransportFault("listProducts", { type: "slow", delayMs: 200 });
  const request = api.listProducts({}, 0, 12, { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, (error) => error.name === "AbortError");
});

test("malformed responses pass through the adapter for UI validation tests", async () => {
  setMockTransportFault("listProducts", {
    type: "malformed",
    delayMs: 1,
    value: { items: null, total: "unknown" },
  });
  assert.deepEqual(await api.listProducts({}, 0, 12), {
    items: null,
    total: "unknown",
  });
});
