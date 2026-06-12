import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const setupPath = fileURLToPath(new URL("../src/pages/PayrollSetup.tsx", import.meta.url));
const runsPath = fileURLToPath(new URL("../src/pages/PayrollRuns.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const navigationSource = readFileSync(navigationPath, "utf8");
const setupSource = readFileSync(setupPath, "utf8");
const runsSource = readFileSync(runsPath, "utf8");

test("web app exposes Phase 4 payroll setup and calculation pages", () => {
  assert.match(appSource, /path="\/payroll-setup"/, "Payroll setup route should be stable.");
  assert.match(appSource, /path="\/payroll-runs"/, "Payroll run route should be stable.");
  assert.match(navigationSource, /to: '\/payroll-setup'/, "Payroll setup should be reachable from navigation.");
  assert.match(navigationSource, /to: '\/payroll-runs'/, "Payroll runs should be reachable from navigation.");
  assert.match(setupSource, /api\.post\('\/payroll-categories'/, "Setup page should create categories.");
  assert.match(setupSource, /api\.post\('\/payroll-items'/, "Setup page should create payroll items.");
  assert.match(setupSource, /api\.post\('\/employee-payroll-profiles'/, "Setup page should create employee payroll profiles.");
  assert.match(runsSource, /api\.post\('\/payroll-variable-imports'/, "Runs page should import attendance and variable pay.");
  assert.match(runsSource, /api\.post\('\/payroll-runs\/calculate'/, "Runs page should calculate payroll runs.");
  assert.match(runsSource, /manualAdjustmentAmount/, "Runs page should show manual adjustment traces.");
  assert.match(runsSource, /cumulativeTaxableIncome/, "Runs page should show cumulative tax basis.");
});
