import { test } from "node:test";
import assert from "node:assert/strict";
import { scenicBudgetSeconds } from "../src/lib/budget";

test("default budget is 5 minutes plus 20% of the fastest trip", () => {
  assert.equal(scenicBudgetSeconds(17 * 60), 5 * 60 + 0.2 * 17 * 60);
  assert.equal(Math.round(scenicBudgetSeconds(44 * 60) / 60), 14);
});

test("a longer trip gets a bigger budget", () => {
  assert.ok(scenicBudgetSeconds(120 * 60) > scenicBudgetSeconds(20 * 60));
});

test("an explicit maxExtraMinutes overrides the default", () => {
  assert.equal(scenicBudgetSeconds(17 * 60, 25), 25 * 60);
  assert.equal(scenicBudgetSeconds(17 * 60, 0), 0);
});
