import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/ApSettlementWorkbench.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const navigationSource = readFileSync(navigationPath, "utf8");
const pageSource = readFileSync(pagePath, "utf8");

test("AP settlement workbench exposes payable settlement and difference handling", () => {
  assert.match(appSource, /path="\/ap-settlements"/, "AP settlement route should be stable.");
  assert.match(navigationSource, /to: '\/ap-settlements'/, "AP settlement workbench should be reachable from navigation.");
  assert.match(pageSource, /api\.get\(`\/counterparty-ledger\?accountSetId=\$\{currentAccountSetId\}&direction=ap/, "Workbench should load payable entries.");
  assert.match(pageSource, /api\.get\(`\/supplier-payments\?accountSetId=\$\{currentAccountSetId\}/, "Workbench should load supplier payments.");
  assert.match(pageSource, /api\.post\('\/ap-settlements'/, "Workbench should create AP settlements.");
  assert.match(pageSource, /settlementType/, "Workbench should expose settlement type.");
  assert.match(pageSource, /differenceAmount/, "Workbench should expose settlement difference amount.");
  assert.match(pageSource, /differenceReason/, "Workbench should expose settlement difference reason.");
});
