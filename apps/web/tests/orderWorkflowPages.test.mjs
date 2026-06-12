import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const ordersPagePath = fileURLToPath(new URL("../src/pages/Orders.tsx", import.meta.url));

test("web app exposes Phase 2 purchase and sales order workflow pages", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");
  const ordersSource = readFileSync(ordersPagePath, "utf8");

  assert.match(navigationSource, /采购订单/, "Navigation should expose purchase orders.");
  assert.match(navigationSource, /销售订单/, "Navigation should expose sales orders.");
  assert.match(appSource, /path="\/purchase-orders"/, "Purchase order route should be stable.");
  assert.match(appSource, /path="\/sales-orders"/, "Sales order route should be stable.");
  assert.match(ordersSource, /api\.get\(`\/\$\{apiBase\}\?/, "Order page should list records through the Phase 2 order API.");
  assert.match(ordersSource, /api\.post\(`\/\$\{apiBase\}`/, "Order page should create records through the Phase 2 order API.");
  assert.match(ordersSource, /submit/, "Order page should expose submit workflow action.");
  assert.match(ordersSource, /approve/, "Order page should expose approve workflow action.");
  assert.match(ordersSource, /totalAmount/, "Order page should show order amount.");
});
