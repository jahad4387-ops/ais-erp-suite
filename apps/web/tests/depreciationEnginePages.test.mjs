import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/DepreciationRuns.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");

test("app navigation exposes the Phase 4 depreciation workbench", () => {
  assert.match(appSource, /\/depreciation-runs/, "App should route to depreciation runs.");
  assert.match(appSource, /DepreciationRuns/, "App should mount the depreciation workbench page.");
});

test("depreciation workbench handles dry-run, formal run, approval, locking, and cost pools", () => {
  const pageSource = readFileSync(pagePath, "utf8");

  assert.match(pageSource, /api\.post\('\/depreciation-runs\/dry-run'/, "Depreciation page should create dry-runs.");
  assert.match(pageSource, /api\.post\('\/depreciation-runs'/, "Depreciation page should create formal runs.");
  assert.match(pageSource, /api\.post\(`\/depreciation-runs\/\$\{.+\}\/approve`/, "Depreciation page should approve runs.");
  assert.match(pageSource, /api\.post\(`\/depreciation-runs\/\$\{.+\}\/lock`/, "Depreciation page should lock runs.");
  assert.match(pageSource, /api\.get\(`\/asset-depreciation-cost-pools\?/, "Depreciation page should show locked cost pools.");
  assert.match(pageSource, /NEW_ASSET_NOT_STARTED/, "Depreciation page should disclose new asset timeline skips.");
  assert.match(pageSource, /brakeApplied/, "Depreciation page should show net-value brake evidence.");
  assert.match(pageSource, /month_end_department/, "Depreciation page should show month-end department ownership.");
});
