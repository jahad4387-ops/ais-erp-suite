import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const workOrdersPath = fileURLToPath(new URL("../src/pages/ProductionWorkOrders.tsx", import.meta.url));
const requisitionsPath = fileURLToPath(new URL("../src/pages/MaterialRequisitions.tsx", import.meta.url));
const receiptsPath = fileURLToPath(new URL("../src/pages/ProductReceipts.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const workOrdersSource = readFileSync(workOrdersPath, "utf8");
const requisitionsSource = readFileSync(requisitionsPath, "utf8");
const receiptsSource = readFileSync(receiptsPath, "utf8");

test("web app exposes Phase 3 production workflow pages and API wiring", () => {
  assert.match(appSource, /path="\/work-orders"/, "Work order route should be stable.");
  assert.match(appSource, /path="\/material-requisitions"/, "Material requisition route should be stable.");
  assert.match(appSource, /path="\/product-receipts"/, "Product receipt route should be stable.");
  assert.match(appSource, /to="\/work-orders"/, "Work orders should be reachable from navigation.");
  assert.match(appSource, /to="\/material-requisitions"/, "Material requisitions should be reachable from navigation.");
  assert.match(appSource, /to="\/product-receipts"/, "Product receipts should be reachable from navigation.");
  assert.match(workOrdersSource, /api\.get\(`\/work-orders\?/, "Work order page should list work orders.");
  assert.match(workOrdersSource, /api\.post\('\/work-orders'/, "Work order page should create work orders.");
  assert.match(workOrdersSource, /\/work-orders\/\$\{[^}]+\.id\}\/release/, "Work order page should release work orders.");
  assert.match(workOrdersSource, /\/work-orders\/\$\{[^}]+\.id\}\/close/, "Work order page should close work orders.");
  assert.match(requisitionsSource, /api\.get\(`\/material-requisitions\?/, "Material requisition page should list requisitions.");
  assert.match(requisitionsSource, /api\.post\('\/material-requisitions'/, "Material requisition page should post requisitions.");
  assert.match(requisitionsSource, /sourceMovementId/, "Material requisition page should expose movement traceability.");
  assert.match(receiptsSource, /api\.get\(`\/product-receipts\?/, "Product receipt page should list receipts.");
  assert.match(receiptsSource, /api\.post\('\/product-receipts'/, "Product receipt page should post receipts.");
  assert.match(receiptsSource, /costStatus/, "Product receipt page should display receipt cost status.");
});
