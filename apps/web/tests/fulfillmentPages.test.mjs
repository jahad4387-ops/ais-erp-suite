import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const fulfillmentPagePath = fileURLToPath(new URL("../src/pages/Fulfillment.tsx", import.meta.url));

test("web app exposes Phase 2 purchase receipt and sales delivery pages", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");
  const fulfillmentSource = readFileSync(fulfillmentPagePath, "utf8");

  assert.match(navigationSource, /采购入库/, "Navigation should expose purchase receipts.");
  assert.match(navigationSource, /销售出库/, "Navigation should expose sales deliveries.");
  assert.match(appSource, /path="\/purchase-receipts"/, "Purchase receipt route should be stable.");
  assert.match(appSource, /path="\/sales-deliveries"/, "Sales delivery route should be stable.");
  assert.match(fulfillmentSource, /api\.get\(`\/\$\{apiBase\}\?/, "Fulfillment page should list source-chain records.");
  assert.match(fulfillmentSource, /api\.post\(`\/\$\{apiBase\}`/, "Fulfillment page should create source-chain records.");
  assert.match(fulfillmentSource, /orderLineNo/, "Fulfillment page should map execution quantities back to order lines.");
  assert.match(fulfillmentSource, /evidenceRefs/, "Fulfillment page should expose attachment evidence references.");
});
