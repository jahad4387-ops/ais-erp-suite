import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/CounterpartyLedger.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const navigationSource = readFileSync(navigationPath, "utf8");
const pageSource = readFileSync(pagePath, "utf8");

test("counterparty ledger page exposes AP/AR detail and GL auxiliary mappings", () => {
  assert.match(appSource, /path="\/counterparty-ledger"/, "Counterparty ledger route should be stable.");
  assert.match(navigationSource, /to: '\/counterparty-ledger'/, "Counterparty ledger should be reachable from navigation.");
  assert.match(pageSource, /api\.get\(`\/counterparty-ledger\?/, "Page should list counterparty ledger entries.");
  assert.match(pageSource, /direction/, "Page should expose AP and AR direction filters.");
  assert.match(pageSource, /remainingAmount/, "Page should show outstanding amount.");
  assert.match(pageSource, /glAccountCode/, "Page should show the mapped GL account.");
  assert.match(pageSource, /auxiliaryPartnerId/, "Page should show the auxiliary partner mapping.");
});
