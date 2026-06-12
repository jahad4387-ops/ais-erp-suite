import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/ManagementAnalysis.tsx", import.meta.url));

test("Phase 5 management analysis route is available from the report menu", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /ManagementAnalysis/);
  assert.match(navigationSource, /to: '\/management-analysis'/);
  assert.match(appSource, /path="\/management-analysis"/);
});

test("Phase 5 management analysis page wires metrics, warnings, and drilldown APIs", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\(`\/management-analysis\?accountSetId=\$\{currentAccountSetId\}&fiscalYear=\$\{currentYear\}&periodNo=\$\{currentPeriod\}`\)/);
  assert.match(source, /purchaseTrend/);
  assert.match(source, /salesGrossMargin/);
  assert.match(source, /inventoryTurnover/);
  assert.match(source, /counterpartyAging/);
  assert.match(source, /cashFlow/);
  assert.match(source, /laborCost/);
  assert.match(source, /depreciationCost/);
  assert.match(source, /operatingOverview/);
  assert.match(source, /warnings/);
  assert.match(source, /drilldowns/);
});
