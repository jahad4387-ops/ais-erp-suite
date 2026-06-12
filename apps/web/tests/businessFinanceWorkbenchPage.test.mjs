import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/BusinessFinanceWorkbench.tsx", import.meta.url));

test("Phase 6 business finance workbench is reachable from finance center", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.equal(existsSync(pagePath), true, "BusinessFinanceWorkbench page should exist.");
  assert.match(appSource, /import \{ BusinessFinanceWorkbench \} from '\.\/pages\/BusinessFinanceWorkbench';/);
  assert.match(appSource, /path="\/business-finance\/workbench"/);
  assert.match(navigationSource, /label: '业财工作台'[^}]+to: '\/business-finance\/workbench'/s);
});

test("Phase 6 business finance workbench shows voucher drafts, reconciliation exceptions, and close blocks", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.ok(source.includes("api.get(`/business-finance/workbench?accountSetId="));
  assert.match(source, /currentAccountSetId/);
  assert.match(source, /sourceTrace/);
  assert.match(source, /inventoryReconciliationExceptions/);
  assert.match(source, /closeBlocks/);
  assert.match(source, /Table/);
});
