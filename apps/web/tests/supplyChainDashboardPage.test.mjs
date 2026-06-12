import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/SupplyChainDashboard.tsx", import.meta.url));

test("supply chain manufacturing workbench is routed from the dual-center navigation", () => {
  assert.equal(existsSync(pagePath), true, "SupplyChainDashboard page should exist.");

  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /import \{ SupplyChainDashboard \} from '\.\/pages\/SupplyChainDashboard';/);
  assert.match(appSource, /path="\/supply-chain\/dashboard"/);
  assert.match(navigationSource, /label: '生产工作台', to: '\/supply-chain\/dashboard'/);
});

test("supply chain manufacturing workbench consumes the dashboard summary API", () => {
  assert.equal(existsSync(pagePath), true, "SupplyChainDashboard page should exist.");

  const pageSource = readFileSync(pagePath, "utf8");

  assert.match(pageSource, /api\.get\(`\/supply-chain\/dashboard\?/);
  assert.match(pageSource, /summary\.pendingOrders/);
  assert.match(pageSource, /summary\.materialShortages/);
  assert.match(pageSource, /summary\.inventoryExceptions/);
  assert.match(pageSource, /summary\.pendingAgentApprovals/);
  assert.match(pageSource, /agentSuggestions/);
  assert.match(pageSource, /生产工作台/);
  assert.match(pageSource, /缺料预警/);
});
