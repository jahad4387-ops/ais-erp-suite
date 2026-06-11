import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const disposalPath = fileURLToPath(new URL("../src/pages/AssetDisposals.tsx", import.meta.url));
const countPath = fileURLToPath(new URL("../src/pages/AssetCounts.tsx", import.meta.url));
const reconciliationPath = fileURLToPath(new URL("../src/pages/FixedAssetReconciliation.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");

test("app navigation exposes Phase 4 asset disposal, count, and reconciliation pages", () => {
  assert.match(appSource, /\/asset-disposals/, "App should route to asset disposals.");
  assert.match(appSource, /\/asset-counts/, "App should route to asset counts.");
  assert.match(appSource, /\/fixed-asset-reconciliation/, "App should route to fixed asset reconciliation.");
});

test("asset disposal page previews disposal voucher draft and disposal depreciation stop rule", () => {
  const source = readFileSync(disposalPath, "utf8");

  assert.match(source, /api\.post\('\/asset-disposals'/, "Disposal page should create asset disposal drafts.");
  assert.match(source, /phase4_asset_disposal/, "Disposal page should show voucher source.");
  assert.match(source, /depreciationStopPeriod/, "Disposal page should show next-period depreciation stop.");
});

test("asset count page previews and commits count variances", () => {
  const source = readFileSync(countPath, "utf8");

  assert.match(source, /api\.post\('\/asset-counts\/preview'/, "Count page should preview count variances.");
  assert.match(source, /api\.post\('\/asset-counts'/, "Count page should commit count variances.");
  assert.match(source, /phase4_asset_count/, "Count page should show voucher source.");
  assert.match(source, /inventory_loss/, "Count page should expose inventory loss variances.");
  assert.match(source, /inventory_surplus/, "Count page should expose inventory surplus variances.");
});

test("fixed asset reconciliation page shows ledger and GL comparison", () => {
  const source = readFileSync(reconciliationPath, "utf8");

  assert.match(source, /api\.get\(`\/fixed-asset-ledger\?/, "Reconciliation page should load fixed asset ledger entries.");
  assert.match(source, /api\.get\(`\/fixed-asset-reconciliation\?/, "Reconciliation page should load fixed asset reconciliation.");
  assert.match(source, /differenceAmount/, "Reconciliation page should show differences.");
  assert.match(source, /ledgerNetValue/, "Reconciliation page should show fixed asset ledger net value.");
  assert.match(source, /glNetValue/, "Reconciliation page should show GL comparison value.");
});
