import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/CounterpartyAnalytics.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const pageSource = readFileSync(pagePath, "utf8");

test("counterparty analytics page exposes summaries, aging, and payment/collection plans", () => {
  assert.match(appSource, /path="\/counterparty-analytics"/, "Counterparty analytics route should be stable.");
  assert.match(appSource, /to="\/counterparty-analytics"/, "Counterparty analytics should be reachable from navigation.");
  assert.match(pageSource, /api\.get\(`\/counterparty-ledger-summary\?/, "Page should load AP/AR counterparty summaries.");
  assert.match(pageSource, /api\.get\(`\/counterparty-aging\?/, "Page should load AP/AR aging buckets.");
  assert.match(pageSource, /api\.get\(`\/payment-requests\?accountSetId=\$\{currentAccountSetId\}/, "Page should load payment plans.");
  assert.match(pageSource, /api\.get\(`\/collection-plans\?accountSetId=\$\{currentAccountSetId\}/, "Page should load collection plans.");
  assert.match(pageSource, /bucketOver90/, "Page should show high-risk aging buckets.");
  assert.match(pageSource, /plannedPaymentDate/, "Page should expose planned payment dates.");
  assert.match(pageSource, /plannedReceiptDate/, "Page should expose planned receipt dates.");
});
