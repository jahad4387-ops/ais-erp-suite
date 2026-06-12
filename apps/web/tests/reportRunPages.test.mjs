import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/ReportRuns.tsx", import.meta.url));

test("Phase 5 report run route is available from the report menu", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /ReportRuns/);
  assert.match(navigationSource, /to: '\/report-runs'/);
  assert.match(appSource, /path="\/report-runs"/);
});

test("Phase 5 report run page wires run, lock, recalculate, and snapshot detail APIs", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\(`\/report-runs\?accountSetId=\$\{currentAccountSetId\}`\)/);
  assert.match(source, /api\.post\('\/report-runs'/);
  assert.match(source, /api\.get\(`\/report-runs\/\$\{selectedRunId\}`\)/);
  assert.match(source, /api\.get\(`\/report-runs\/\$\{selectedRunId\}\/cells\/\$\{record\.cellAddress\}\/drilldown`\)/);
  assert.match(source, /api\.post\(`\/report-runs\/\$\{selectedRunId\}\/recalculate`/);
  assert.match(source, /api\.post\(`\/report-runs\/\$\{selectedRunId\}\/lock`/);
  assert.match(source, /includeUnposted/);
  assert.match(source, /calculatedValue/);
  assert.match(source, /traceLinks/);
  assert.match(source, /cellDrilldown/);
  assert.match(source, /sourceBalances/);
  assert.match(source, /ledgerEntries/);
  assert.match(source, /vouchers/);
  assert.match(source, /renderMode/);
});
