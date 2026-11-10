import test from "node:test";
import assert from "node:assert/strict";
import { createPendingAction } from "../src/services/pendingAction.js";

test("a deferred login action resumes exactly once", async () => {
  const pending = createPendingAction();
  let calls = 0;
  pending.set(async () => {
    calls += 1;
  });
  await pending.run();
  await pending.run();
  assert.equal(calls, 1);
});

test("cancelling login clears the deferred action", async () => {
  const pending = createPendingAction();
  let calls = 0;
  pending.set(() => {
    calls += 1;
  });
  pending.clear();
  await pending.run();
  assert.equal(calls, 0);
});
