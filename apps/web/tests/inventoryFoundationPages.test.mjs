import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const itemsPath = fileURLToPath(new URL("../src/pages/InventoryItems.tsx", import.meta.url));
const bomPath = fileURLToPath(new URL("../src/pages/BomMaintenance.tsx", import.meta.url));
const warehousePath = fileURLToPath(new URL("../src/pages/Warehouses.tsx", import.meta.url));
const openingPath = fileURLToPath(new URL("../src/pages/InventoryOpeningBalances.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const navigationSource = readFileSync(navigationPath, "utf8");
const itemsSource = readFileSync(itemsPath, "utf8");
const bomSource = readFileSync(bomPath, "utf8");
const warehouseSource = readFileSync(warehousePath, "utf8");
const openingSource = readFileSync(openingPath, "utf8");

test("web app exposes Phase 3 inventory foundation pages and API wiring", () => {
  assert.match(appSource, /path="\/inventory-items"/, "Inventory item route should be stable.");
  assert.match(appSource, /path="\/boms"/, "BOM route should be stable.");
  assert.match(appSource, /path="\/warehouses"/, "Warehouse route should be stable.");
  assert.match(appSource, /path="\/inventory-opening-balances"/, "Inventory opening balance route should be stable.");
  assert.match(navigationSource, /to: '\/inventory-items'/, "Inventory items should be reachable from navigation.");
  assert.match(navigationSource, /to: '\/boms'/, "BOM maintenance should be reachable from navigation.");
  assert.match(navigationSource, /to: '\/warehouses'/, "Warehouses should be reachable from navigation.");
  assert.match(navigationSource, /to: '\/inventory-opening-balances'/, "Inventory opening balances should be reachable from navigation.");
  assert.match(itemsSource, /api\.get\(`\/inventory-items\?/, "Inventory item page should list items.");
  assert.match(itemsSource, /api\.post\('\/inventory-items'/, "Inventory item page should create items.");
  assert.match(itemsSource, /BATCH_COST_METHOD_CONFLICT/, "Inventory page should surface the batch/cost-method guardrail.");
  assert.match(itemsSource, /onValuesChange/, "Inventory item form should guard conflicting batch and cost method choices before submit.");
  assert.match(itemsSource, /setFieldValue\('costMethod', 'fifo'\)/, "Batch-managed items should switch away from moving-average costing.");
  assert.match(bomSource, /api\.get\(`\/boms\?/, "BOM page should list BOMs.");
  assert.match(bomSource, /api\.post\('\/boms'/, "BOM page should create BOMs.");
  assert.match(warehouseSource, /api\.get\(`\/warehouses\?/, "Warehouse page should list warehouses.");
  assert.match(warehouseSource, /api\.post\('\/warehouses'/, "Warehouse page should create warehouses.");
  assert.match(openingSource, /api\.get\(`\/inventory-opening-balances\?/, "Opening page should list opening balances.");
  assert.match(openingSource, /api\.post\('\/inventory-opening-balances'/, "Opening page should save opening balances.");
  assert.match(openingSource, /api\.get\(`\/inventory-opening-balances\/trial-balance\?/, "Opening page should load trial totals.");
});
