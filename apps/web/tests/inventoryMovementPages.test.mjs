import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const movementsPath = fileURLToPath(new URL("../src/pages/InventoryMovements.tsx", import.meta.url));
const transfersPath = fileURLToPath(new URL("../src/pages/InventoryTransfers.tsx", import.meta.url));
const countsPath = fileURLToPath(new URL("../src/pages/StockCounts.tsx", import.meta.url));
const ledgerPath = fileURLToPath(new URL("../src/pages/InventoryLedger.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const movementsSource = readFileSync(movementsPath, "utf8");
const transfersSource = readFileSync(transfersPath, "utf8");
const countsSource = readFileSync(countsPath, "utf8");
const ledgerSource = readFileSync(ledgerPath, "utf8");

test("web app exposes Phase 3 movement costing pages and API wiring", () => {
  assert.match(appSource, /path="\/inventory-movements"/, "Inventory movement route should be stable.");
  assert.match(appSource, /path="\/inventory-transfers"/, "Inventory transfer route should be stable.");
  assert.match(appSource, /path="\/stock-counts"/, "Stock count route should be stable.");
  assert.match(appSource, /path="\/inventory-ledger"/, "Inventory ledger route should be stable.");
  assert.match(appSource, /to="\/inventory-movements"/, "Inventory movements should be reachable from navigation.");
  assert.match(appSource, /to="\/inventory-transfers"/, "Inventory transfers should be reachable from navigation.");
  assert.match(appSource, /to="\/stock-counts"/, "Stock counts should be reachable from navigation.");
  assert.match(appSource, /to="\/inventory-ledger"/, "Inventory ledger should be reachable from navigation.");
  assert.match(movementsSource, /api\.get\(`\/inventory-movements\?/, "Movement page should list movements.");
  assert.match(movementsSource, /api\.post\('\/inventory-movements'/, "Movement page should post movements.");
  assert.match(movementsSource, /costBreakdown/, "Movement page should display FIFO layer costing.");
  assert.match(transfersSource, /api\.get\(`\/inventory-transfers\?/, "Transfer page should list transfers.");
  assert.match(transfersSource, /api\.post\('\/inventory-transfers'/, "Transfer page should post transfers.");
  assert.match(countsSource, /api\.post\('\/stock-counts\/preview'/, "Stock count page should request adjustment preview.");
  assert.match(countsSource, /differenceQuantity/, "Stock count page should display count differences.");
  assert.match(ledgerSource, /api\.get\(`\/inventory-balances\?/, "Ledger page should list inventory balances.");
  assert.match(ledgerSource, /api\.get\(`\/inventory-cost-layers\?/, "Ledger page should list cost layers.");
});
