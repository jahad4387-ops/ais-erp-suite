import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const reportsPath = fileURLToPath(new URL("../src/pages/Reports.tsx", import.meta.url));

test("reports page treats tiny trial-balance float differences as balanced", () => {
  const source = readFileSync(reportsPath, "utf8");

  assert.match(source, /TRIAL_BALANCE_TOLERANCE/);
  assert.match(source, /isTrialBalanceBalanced/);
  assert.match(source, /Math\.abs\(balanceDifference\) <= TRIAL_BALANCE_TOLERANCE/);
  assert.match(source, /displayBalanceDifference/);
  assert.doesNotMatch(source, /type=\{balanceDifference === 0 \? 'success' : 'error'\}/);
});
