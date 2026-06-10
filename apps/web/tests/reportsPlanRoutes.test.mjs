import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const reportsPath = fileURLToPath(new URL("../src/pages/Reports.tsx", import.meta.url));

test("reports page uses Phase 1 planned ledger and report endpoints", () => {
  const source = readFileSync(reportsPath, "utf8");

  assert.match(source, /api\.get\('\/ledger\/general-ledger'\)/);
  assert.match(source, /api\.get\('\/ledger\/sub-ledger'\)/);
  assert.match(source, /api\.get\('\/reports\/account-balances'\)/);
  assert.match(source, /api\.get\('\/reports\/trial-balance'\)/);
  assert.doesNotMatch(source, /api\.get\('\/ledger\/detail-ledger'\)/);
  assert.doesNotMatch(source, /api\.get\('\/ledger\/account-balances'\)/);
  assert.doesNotMatch(source, /api\.get\('\/ledger\/trial-balance'\)/);
});

test("reports page supports Phase 1 CSV and Excel exports", () => {
  const source = readFileSync(reportsPath, "utf8");

  assert.match(source, /data-testid="report-export-csv"/);
  assert.match(source, /data-testid="report-export-excel"/);
  assert.match(source, /text\/csv;charset=utf-8/);
  assert.match(source, /application\/vnd\.ms-excel/);
  assert.match(source, /\$\{activeReport\}\.csv/);
  assert.match(source, /\$\{activeReport\}\.xls/);
  assert.match(source, /本期借方/);
  assert.match(source, /本期贷方/);
});

test("reports page maps stable report URLs to the matching tab", () => {
  const reportsSource = readFileSync(reportsPath, "utf8");

  assert.match(reportsSource, /useParams/);
  assert.match(reportsSource, /reportName/);
  assert.match(reportsSource, /'trial-balance': 'trial-balance'/);
  assert.match(reportsSource, /'account-balances': 'balances'/);
  assert.match(reportsSource, /'detail-ledger': 'sub-ledger'/);
  assert.match(reportsSource, /'export-center': 'general-ledger'/);
  assert.match(reportsSource, /导出中心/);
});
