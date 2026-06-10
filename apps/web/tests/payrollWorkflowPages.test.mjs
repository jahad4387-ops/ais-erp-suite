import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const runsPath = fileURLToPath(new URL("../src/pages/PayrollRuns.tsx", import.meta.url));
const runsSource = readFileSync(runsPath, "utf8");

test("payroll run page exposes Phase 4 approval, lock, payment, allocation, and cost-pool workflow", () => {
  assert.match(runsSource, /api\.post\(`\/payroll-runs\/\$\{.+\}\/approve`/, "Payroll run page should approve runs.");
  assert.match(runsSource, /api\.post\(`\/payroll-runs\/\$\{.+\}\/lock`/, "Payroll run page should lock runs.");
  assert.match(runsSource, /api\.post\('\/payroll-payment-files'/, "Payroll run page should create payment files.");
  assert.match(runsSource, /api\.post\('\/payroll-allocations'/, "Payroll run page should create allocation voucher drafts.");
  assert.match(runsSource, /api\.get\(`\/payroll-cost-pools\?/, "Payroll run page should show formal Phase 3 labor cost pools.");
  assert.match(runsSource, /voucherDraft/, "Payroll allocation should show voucher draft effects.");
  assert.match(runsSource, /lockedAt/, "Payroll cost pools should show lock evidence.");
});
