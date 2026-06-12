import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const invoicePagePath = fileURLToPath(new URL("../src/pages/Invoices.tsx", import.meta.url));

test("web app exposes Phase 2 purchase and sales invoice confirmation pages", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");
  const invoiceSource = readFileSync(invoicePagePath, "utf8");

  assert.match(navigationSource, /采购发票/, "Navigation should expose purchase invoices.");
  assert.match(navigationSource, /销售发票/, "Navigation should expose sales invoices.");
  assert.match(appSource, /path="\/purchase-invoices"/, "Purchase invoice route should be stable.");
  assert.match(appSource, /path="\/sales-invoices"/, "Sales invoice route should be stable.");
  assert.match(invoiceSource, /api\.get\(`\/\$\{apiBase\}\?/, "Invoice page should list invoice confirmations.");
  assert.match(invoiceSource, /api\.post\(`\/\$\{apiBase\}`/, "Invoice page should create invoice confirmations.");
  assert.match(invoiceSource, /estimatedDifference/, "Purchase invoice page should show estimated variance.");
  assert.match(invoiceSource, /evidenceRefs/, "Invoice page should expose OCR/import evidence refs.");
});
