import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/ReportApprovals.tsx", import.meta.url));

test("Phase 5 report approval route is available from the report menu", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /ReportApprovals/);
  assert.match(navigationSource, /to: '\/report-approvals'/);
  assert.match(appSource, /path="\/report-approvals"/);
});

test("Phase 5 report approval page wires review, cash-flow exceptions, and approve APIs", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\(`\/report-approvals\?accountSetId=\$\{currentAccountSetId\}`\)/);
  assert.match(source, /api\.post\(`\/report-runs\/\$\{values\.reportRunId\}\/submit-review`/);
  assert.match(source, /api\.post\(`\/report-approvals\/\$\{record\.id\}\/approve`/);
  assert.match(source, /未分配异常现金流/);
  assert.match(source, /审批并锁定/);
  assert.match(source, /exceptionCount/);
});
