import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const setupPath = fileURLToPath(new URL("../src/pages/FixedAssetSetup.tsx", import.meta.url));
const assetsPath = fileURLToPath(new URL("../src/pages/FixedAssets.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");

test("app navigation exposes Phase 4 fixed asset foundation pages", () => {
  assert.match(appSource, /\/fixed-asset-setup/, "App should route to fixed asset setup.");
  assert.match(appSource, /\/fixed-assets/, "App should route to fixed asset cards.");
  assert.match(appSource, /FixedAssetSetup/, "App should mount the fixed asset setup page.");
  assert.match(appSource, /FixedAssets/, "App should mount the fixed asset cards page.");
});

test("fixed asset setup page maintains categories and depreciation methods", () => {
  const setupSource = readFileSync(setupPath, "utf8");

  assert.match(setupSource, /api\.post\('\/asset-categories'/, "Setup page should create asset categories.");
  assert.match(setupSource, /api\.post\('\/depreciation-methods'/, "Setup page should create depreciation methods.");
  assert.match(setupSource, /defaultUsefulLifeMonths/, "Setup page should expose default useful life.");
  assert.match(setupSource, /defaultSalvageRate/, "Setup page should expose default salvage rate.");
});

test("fixed asset card page handles additions, transfers, value changes, and timeline rules", () => {
  const assetsSource = readFileSync(assetsPath, "utf8");

  assert.match(assetsSource, /api\.post\('\/fixed-assets'/, "Asset page should create fixed asset cards.");
  assert.match(assetsSource, /api\.post\('\/asset-transfers'/, "Asset page should record department transfers.");
  assert.match(assetsSource, /api\.post\('\/asset-value-changes'/, "Asset page should record original value changes.");
  assert.match(assetsSource, /serviceStartPeriod/, "Asset page should show the first depreciation period.");
  assert.match(assetsSource, /new_asset_next_month/, "Asset page should disclose the new asset next-month rule.");
  assert.match(assetsSource, /month_end_department/, "Asset page should disclose month-end department ownership.");
});
